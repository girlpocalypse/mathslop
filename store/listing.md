# Chrome Web Store listing

Everything to paste into the Chrome Web Store developer dashboard, tab by tab. Name and summary come
from manifest.json and can't be edited in the dashboard; change them there and re-upload.

## For each release

1. Bump `version` in manifest.json and add the release to CHANGELOG.md.
2. Update the "New in …" block at the top of the description below (the dashboard has no release-notes
   field, so this is where store users see what changed). Keep only the latest release there.
3. Re-read the rest of this file against the code: description, permission justifications, test
   instructions (re-count: max 500 characters), and the library versions in the reviewer reply.
4. Put the upload date on the CHANGELOG.md entry, keep PRIVACY.md true, and merge the release to `main`
   before you submit it for review: the privacy policy URL points at PRIVACY.md on `main`.
5. Run `scripts/package.sh` and upload `dist/mathslop-<version>.zip` (Package tab). Paste every field below
   that changed since the last upload (`git diff <last release tag> -- store/listing.md`), replace changed
   screenshots, then submit for review.

For 1.3.0, also re-paste the Homepage URL, Support URL and Privacy policy URL: 1.2.0 was submitted with
links to the old account name (girlpocalypse), and those dashboard fields don't come from the package.

## Package (Build → Package)

Build it with `scripts/package.sh` (runnable from any directory). It writes `dist/mathslop-<version>.zip`
with manifest.json at the root, and contains only:

```
manifest.json  background.js  panel.html  panel.js  panel.css  sandbox.html  sandbox.js
icons/  vendor/  LICENSE  LICENSE-MIT  LICENSE-WTFPL  COPYING
```

It leaves out `.git/`, `docs/`, `store/`, `scripts/`, `dist/`, `CLAUDE.md`, `CHANGELOG.md`, `README.md` and
`PRIVACY.md` (none of them are loaded by the extension). Rebuild after every manifest or code change. Every upload needs a higher
`version` than the last one.

## Store listing tab

**Name** (from manifest, max 75 characters)

```
mathslop
```

**Summary** (manifest `description`, max 132 characters, plain text)

```
A multiline math scratchpad in the side panel. Optional live answers, works offline.
```

**Description** (plain text, paste as is)

```
mathslop is a scratchpad for writing math in Chrome's side panel, next to whatever you're working from: an online lesson, a PDF, a homework page. Type expressions the way they look on paper, one per line, instead of drawing with a mouse or writing x^2/(3+y) in plain text.

New in 1.3.0:
- Click an answer to put it into the line you're working on, or type ans for the answer of the line above.
- Define functions: f(x) := x² + 1, then f(3).
- Answer options: degrees or radians, decimal places, and exact or decimal first.
- Copy the whole pad as plain text as well as LaTeX, with or without the answers.
- Ctrl+Z undoes anything on the pad, including deleted lines.
- With answers on, lines with a typo are marked "can't read", and a line that takes too long is skipped instead of holding up the others.
- Updated math libraries.

Features:

- A multiline editor built on MathLive. Type / for a fraction, ^ and _ for superscripts and subscripts, and names like sqrt, pi or sin turn into symbols. A backslash starts a LaTeX command (\alpha, \int).
- An on-screen keyboard for fractions, roots, powers, integrals, Greek letters and more, with calculator-style labels (x², √x) instead of placeholder boxes.
- Optional answers next to each line, in three modes:
    Off: no answers, just writing. This is the default.
    Arithmetic: answers lines with no unknowns, like 1/3 + 1/6 or the integral of sin x from 0 to π. Letters you give a value with := (a := 3) count as known on the lines below.
    Algebra: also simplifies lines with unknowns, so 2x + 3x becomes 5x and d/dx x³ becomes 3x².
  Turning answers on asks first, and suggests keeping them off while you're still learning the material.
- Answers show the exact result and, where it helps, a decimal: = when the decimal is exact (1/2 = 0.5), ≈ when it's rounded (√2, π). Choose degrees or radians, how many decimal places, and whether the exact form or the decimal comes first.
- Reuse answers: click an answer to put it into the line you're editing (Shift+click copies it), or type ans for the answer of the nearest line above.
- Functions: define one with := (f(x) := x² + 1) and use it on the lines below (f(3)).
- Lines the math engine can't read are marked, so a typo doesn't look like "no answer here".
- Colors: give each letter its own color, the same on every line and in the answers, so you can follow a variable through your working.
- Copy one line or the whole pad as LaTeX, or the whole pad as plain text, with or without answers. Import LaTeX to replace or add to the pad.
- Keyboard shortcuts: Enter for a new line, arrow keys to move between lines, Backspace on an empty line to delete it, Ctrl+Z to undo anything on the pad, Esc twice to clear it. Ctrl+/ shows the full list.
- The pad saves itself and is still there next time you open the panel.

Privacy: everything stays on your device. The pad is kept in Chrome's local extension storage, nothing is synced or sent anywhere, and there are no accounts, ads or analytics. The extension has no network access at all, so it also works offline.

Good to know:
- Click the toolbar icon to open the side panel (pin it from the puzzle-piece menu first).
- Answers work out and simplify expressions, but they don't solve equations: a line like x^2 - 4 = 0 gets no answer.
- Answers come from the Compute Engine library. Angles are in radians unless you switch to Deg, and some lines just won't get an answer. Check anything that matters.
- Dark theme only.

Free and open source (MIT or WTFPL): https://github.com/mollymillions2035/mathslop
```

**Category:** Education (in the Productivity group).

**Language:** English

**Graphic assets** (in `store/`, except the icon)

| Field | File | Size |
|---|---|---|
| Store icon | `icons/icon128.png` (96x96 artwork, 16 px transparent padding) | 128x128 PNG |
| Screenshots (1 required, up to 5) | `store/screenshot-1.png`, `store/screenshot-2.png`, … | 1280x800 |
| Small promo tile (required) | `store/promo-small.png` | 440x280 PNG/JPEG |
| Marquee promo tile (optional) | `store/promo-marquee.png` | 1400x560 PNG/JPEG |

**Promo video:** leave empty (optional).

Don't use `docs/screenshot.png` (840x1966); store screenshots must be 1280x800 or 640x400.

**Official URL:** leave empty (needs a site verified in Google Search Console).

**Homepage URL:** https://github.com/mollymillions2035/mathslop

**Support URL:** https://github.com/mollymillions2035/mathslop/issues

**Mature content:** off.

## Privacy practices tab

**Single purpose**

```
A math scratchpad in Chrome's side panel: you write math line by line with a math editor and on-screen keyboard, and can optionally see the answer to each line.
```

**Permission justifications**

sidePanel:

```
The extension's only UI is a side panel page (panel.html). sidePanel registers it, and background.js calls chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }) so clicking the toolbar icon opens it. No other API use.
```

storage:

```
Saves the user's pad (the lines of math they typed) and its settings (Answers mode, Colors, angle unit, decimal places, answer order and the Copy all format) with chrome.storage.local, so the pad is still there the next time the panel opens. Stored only on the device; nothing is synced or sent anywhere.
```

There are no host permissions, so no host permission justification.

**Remote code:** No, I am not using remote code. (No justification field appears for No; the test
instructions below cover the vendored libraries.)

**Data usage**

What user data do you plan to collect: tick nothing. The pad is stored locally and never leaves the
device, and none of the categories (personally identifiable info, health, financial and payment,
authentication, personal communications, location, web history, user activity, website content) apply.

Certifications: tick all three.

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://github.com/mollymillions2035/mathslop/blob/main/PRIVACY.md

## Distribution tab

Free, Public, all regions.

## Test instructions tab

Max 500 characters (this is 461). Re-count after any edit.

```
No account needed.
1. Click the mathslop toolbar icon (pin it from the puzzle menu). The side panel opens with sample lines.
2. Click Arithmetic, then Enable answers. Expect 5, 2, 5050, 1/2 = 0.5, 0 and 10.
3. Click Algebra: d/dx x^3 shows 3x^2.

The engine runs in sandbox.html (manifest "sandbox") because Compute Engine uses new Function. It has no chrome.* APIs and its CSP blocks all network. Both libraries are unmodified npm builds; nothing remote loads.
```

## If review asks about the sandbox or remote code

Longer explanation to paste into a reply or appeal (doesn't fit in the test instructions).

```
About the sandbox page: the math engine (Compute Engine) uses new Function for compiling expressions, which the extension page CSP forbids. So it runs in sandbox.html, declared under "sandbox" in the manifest, inside a hidden iframe in the panel. It has no chrome.* APIs, and its CSP is "sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-eval'; base-uri 'none'; form-action 'none'", so it can only run its two packaged scripts and can't make network requests. It only receives the pad's LaTeX strings via postMessage and sends back results. This is the pattern from https://developer.chrome.com/docs/extensions/how-to/security/sandboxing-eval

Vendored libraries: vendor/mathlive/mathlive.min.js (MathLive 0.111.1) and vendor/compute-engine/compute-engine.min.js (@cortex-js/compute-engine 0.161.0) are the unmodified minified builds from npm. All code is in the package; nothing is fetched and no fetched string is evaluated. The panel's own CSP also sets connect-src 'none'.

URL strings you may see in them: Compute Engine has a fetch to oeis.org in a helper used only by its integer-sequence lookup methods (lookupOEIS and related). sandbox.js calls none of them, and the sandbox CSP would block it anyway. MathLive mentions esm.run and the aws-sdk npm page only in console error text; its optional Amazon Polly speech needs an AWS SDK that isn't loaded. Neither library loads anything remote here.
```
