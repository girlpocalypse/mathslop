#!/usr/bin/env bash
# Build dist/mathslop-<version>.zip for upload to the Chrome Web Store.
#
# Only an explicit allowlist of runtime files goes into the zip (manifest.json at the root).
# Docs, store assets, scripts, CLAUDE.md, README.md, .git and dotfiles are never included.
# The build fails if a file referenced by manifest.json / panel.html / sandbox.html /
# mathlive-static.css is missing, or if the allowlist would ship a file nothing uses.
#
# Usage: scripts/package.sh                 dist/mathslop-<version>.zip  (runnable from any directory)
#        scripts/package.sh --suffix tests  dist/mathslop-<version>-tests.zip, for test builds
#                                           (or ZIP_SUFFIX=tests); the contents are the same either way
set -euo pipefail

SUFFIX="${ZIP_SUFFIX:-}"
while (( $# )); do
  case "$1" in
    --suffix) [[ $# -ge 2 ]] || { echo "package.sh: error: --suffix needs a name" >&2; exit 1; }; SUFFIX="$2"; shift 2 ;;
    *) echo "package.sh: error: unknown argument: $1" >&2; exit 1 ;;
  esac
done
[[ -z "$SUFFIX" || "$SUFFIX" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "package.sh: error: suffix '$SUFFIX' may only use letters, digits, . _ -" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

die() { echo "package.sh: error: $*" >&2; exit 1; }

command -v python3 >/dev/null || die "python3 is required"
command -v zip >/dev/null     || die "zip is required"
[[ -f manifest.json ]]        || die "manifest.json not found in $ROOT"

VERSION="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' manifest.json)"
# Chrome: 1-4 dot-separated integers, each 0-65535, no leading zeros.
[[ "$VERSION" =~ ^(0|[1-9][0-9]{0,4})(\.(0|[1-9][0-9]{0,4})){0,3}$ ]] \
  || die "manifest version '$VERSION' is not 1-4 dot-separated integers without leading zeros"
IFS=. read -r -a _parts <<<"$VERSION"
for _p in "${_parts[@]}"; do (( _p <= 65535 )) || die "manifest version part $_p is over 65535"; done

# ---- allowlist (paths relative to repo root) ----
TOP_FILES=(manifest.json background.js panel.html panel.js panel.css sandbox.html sandbox.js
           LICENSE LICENSE-MIT LICENSE-WTFPL COPYING)
FILES=()
for f in "${TOP_FILES[@]}"; do
  [[ -f "$f" ]] || die "allowlisted file missing: $f"
  FILES+=("$f")
done
shopt -s nullglob
for f in icons/*.png; do FILES+=("$f"); done
shopt -u nullglob
[[ -d vendor ]] || die "vendor/ missing"
while IFS= read -r -d '' f; do
  FILES+=("${f#./}")
done < <(find vendor -type f ! -name '.*' ! -path '*/.*' -print0 | sort -z)

# Dotfiles inside vendor/ are skipped above; refuse to build if any exist so nothing is silently lost/added.
if find vendor -name '.*' -print -quit | grep -q .; then
  die "dotfiles found under vendor/: $(find vendor -name '.*' | tr '\n' ' ')"
fi

# ---- reference checks: everything referenced exists, everything shipped is referenced ----
read -r -d '' CHECK_PY <<'PY' || true
import json, os, re, sys
from html.parser import HTMLParser

root = sys.argv[1]
shipped = set(line.strip() for line in sys.stdin if line.strip())
errors, refs = [], set()

def ref(path, source):
    p = os.path.normpath(path.split('?')[0].split('#')[0]).lstrip('/')
    refs.add(p)
    if p not in shipped:
        errors.append(f"{source} references '{p}', which is missing from the package")

m = json.load(open(os.path.join(root, 'manifest.json')))
ref('manifest.json', 'package')
for size, p in (m.get('icons') or {}).items(): ref(p, 'manifest.json icons')
act = m.get('action') or {}
icons = act.get('default_icon')
if isinstance(icons, str): ref(icons, 'manifest.json action.default_icon')
elif isinstance(icons, dict):
    for p in icons.values(): ref(p, 'manifest.json action.default_icon')
if act.get('default_popup'): ref(act['default_popup'], 'manifest.json action.default_popup')
bg = m.get('background') or {}
if bg.get('service_worker'): ref(bg['service_worker'], 'manifest.json background.service_worker')
sp = m.get('side_panel') or {}
if sp.get('default_path'): ref(sp['default_path'], 'manifest.json side_panel.default_path')
for p in (m.get('sandbox') or {}).get('pages', []): ref(p, 'manifest.json sandbox.pages')

class Refs(HTMLParser):
    def __init__(self, page):
        super().__init__(); self.page = page; self.found = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'script' and a.get('src'): self.found.append(a['src'])
        if tag == 'link' and a.get('href'): self.found.append(a['href'])
        if tag in ('iframe', 'img', 'source') and a.get('src'): self.found.append(a['src'])

for page in sorted(p for p in shipped if p.endswith('.html')):
    parser = Refs(page)
    parser.feed(open(os.path.join(root, page), encoding='utf-8').read())
    for u in parser.found:
        if re.match(r'^[a-z][a-z0-9+.-]*:', u, re.I):
            errors.append(f"{page} references a non-local URL: {u}")
            continue
        ref(os.path.join(os.path.dirname(page), u), page)

# url(...) inside shipped CSS (MathLive fonts)
for css in sorted(p for p in shipped if p.endswith('.css')):
    text = open(os.path.join(root, css), encoding='utf-8').read()
    for u in re.findall(r'url\(\s*[\'"]?([^\'")]+)[\'"]?\s*\)', text):
        if u.startswith('data:'): continue
        if re.match(r'^[a-z][a-z0-9+.-]*:', u, re.I):
            errors.append(f"{css} references a non-local URL: {u}")
            continue
        ref(os.path.join(os.path.dirname(css), u), css)

# Files allowed to ship without being referenced: license texts.
license_ok = lambda p: os.path.basename(p) in ('LICENSE', 'LICENSE-MIT', 'LICENSE-WTFPL', 'COPYING', 'LICENSE.txt')
for p in sorted(shipped - refs):
    if not license_ok(p):
        errors.append(f"'{p}' would be packaged but nothing references it (remove it or reference it)")

if errors:
    print("package.sh: reference check failed:", *errors, sep="\n  ", file=sys.stderr)
    sys.exit(1)
PY
printf '%s\n' "${FILES[@]}" | python3 -I -c "$CHECK_PY" "$ROOT"

# ---- stage and zip ----
DIST="$ROOT/dist"
OUT="$DIST/mathslop-$VERSION${SUFFIX:+-$SUFFIX}.zip"
mkdir -p "$DIST"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/mathslop-pkg.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

for f in "${FILES[@]}"; do
  mkdir -p "$STAGE/$(dirname "$f")"
  cp -p "$f" "$STAGE/$f"
  chmod 0644 "$STAGE/$f"
done

# Fixed timestamps so rebuilding the same tree gives the same zip.
# SOURCE_DATE_EPOCH wins; otherwise the last commit time; otherwise a constant.
EPOCH="${SOURCE_DATE_EPOCH:-$(git -C "$ROOT" log -1 --format=%ct 2>/dev/null || echo 315532800)}"
[[ "$EPOCH" =~ ^[0-9]+$ ]] || die "SOURCE_DATE_EPOCH '$EPOCH' is not an integer"
# Python instead of `touch -d @N` so this also works with BSD/macOS touch.
python3 -I - "$STAGE" "$EPOCH" <<'PY'
import os, sys
root, t = sys.argv[1], int(sys.argv[2])
for d, dirs, files in os.walk(root):
    for n in dirs + files:
        os.utime(os.path.join(d, n), (t, t), follow_symlinks=False)
os.utime(root, (t, t))
PY

rm -f "$OUT"
(
  cd "$STAGE"
  export TZ=UTC
  printf '%s\n' "${FILES[@]}" | LC_ALL=C sort | zip -q -X -D -9 "$OUT" -@
)

# Sanity: manifest.json at the zip root.
python3 -I - "$OUT" <<'PY'
import sys, zipfile
names = zipfile.ZipFile(sys.argv[1]).namelist()
if 'manifest.json' not in names:
    sys.exit("package.sh: manifest.json is not at the zip root")
PY

SIZE="$(stat -c %s "$OUT" 2>/dev/null || stat -f %z "$OUT")"
COUNT="${#FILES[@]}"
echo "Built $OUT"
echo "  version $VERSION, $COUNT files, $SIZE bytes ($(( (SIZE + 1023) / 1024 )) KiB)"
