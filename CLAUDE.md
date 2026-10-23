# mathslop — Chrome side panel extension

A multiline math scratchpad (MathLive editor + Compute Engine answers) that opens in Chrome's side panel.
Manifest V3, no build step, no network access at runtime — every library is vendored.

## Open items

Rough priority order.

1. **Plotting.** New `type: 'plot'` in sandbox.js using `compile()` to sample points, returning number arrays;
      draw on a `<canvas>` in the panel. The reason CE lives in the sandbox in the first place.
2. **Multiple pads** (named tabs). Storage becomes `{ pads: [...] }`, so bump to `mathslop.v2` with a
      migration from `v1` (see "Renaming / moving the folder").
3. **Units — possible future enhancement, on hold** while deciding whether and how units should work at
      all. A working attempt is on the local branch `units-experiment` (not pushed). What it found: CE 0.161 reads `5\,\mathrm{km}` and
      `5\text{km/h}` as `Quantity`, but MathLive's own unit shortcuts write `\operatorname{km}`, which CE reads as
      a variable; single-letter units (m, s, g, h) can't be told apart from variables while typing; CE's `\to`
      doesn't convert (`\operatorname{UnitConvert}` does); exact unit answers come out as siunitx `\qty[…]`,
      which MathLive can't render; and unit names count as unknowns, so Arithmetic skips unit lines.

## Load it

1. `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → pick this folder.
2. Click the toolbar icon (pin it from the puzzle-piece menu) to open the side panel.
3. After editing files, press the reload ↻ button on the extension card, then close and reopen the panel.

Debugging: right-click inside the panel → Inspect. Errors from the sandboxed engine frame show up in the
same DevTools window (pick the `sandbox.html` frame in the console's context dropdown).

## Architecture — read this before adding features

```
panel.html / panel.js / panel.css     the UI (side panel). Strict extension CSP.
   │  postMessage (see protocol in sandbox.js)
   ▼
sandbox.html / sandbox.js             the math engine only. Sandboxed page, relaxed CSP.
vendor/compute-engine/                Compute Engine (UMD build), loaded only by sandbox.html
vendor/mathlive/                      MathLive + its fonts/static CSS, loaded only by panel.html
background.js                         makes the toolbar icon open the side panel
docs/screenshot.png                   used only by README.md; the extension never loads it
store/ PRIVACY.md scripts/            Chrome Web Store listing, assets and packaging; not shipped (see "Publishing")
```

**The rule:** anything that uses `eval`, `new Function`, or a library that does, goes in the sandbox.
Everything else stays in the panel.

- Extension pages (panel.html) run under MV3's fixed CSP: `script-src 'self'`. manifest.json adds
  `frame-src 'self'` (the engine iframe can't be navigated to an outside URL), `connect-src 'none'` (no
  fetch/XHR/WebSocket) and `img-src 'self'` (no remote images). No `default-src`/`style-src` on purpose:
  MathLive renders answers as HTML with inline `style="…"` attributes, which that would block. No `eval`, no
  `new Function`, no inline `<script>`, no inline `onclick=` handlers, no remote scripts. MV3 does not let
  you relax this — `'unsafe-eval'` is rejected in `content_security_policy.extension_pages`.
- `sandbox.html` is listed under `"sandbox"` in manifest.json. It may use `eval`/`new Function`, but it has
  **no `chrome.*` APIs, no storage, and a null origin**. It only computes and replies via `postMessage`.
- The sandbox has its own CSP in manifest.json (`content_security_policy.sandbox`): `default-src 'none'`, so no
  fetch/XHR, images, fonts, styles, frames or workers; no popups, forms or modals. Only its two script files load.
  Compute Engine contains a `fetch()` to oeis.org (sequence lookup); this is what stops it. A new sandbox
  feature that needs another resource type must allow that type explicitly, never network.
- If something is on the wrong side, Chrome refuses it loudly: an `EvalError` / CSP violation in the
  panel's DevTools console. It does not half-work silently.
- Compute Engine uses `new Function` for `compile()` (fast numeric evaluation — the thing a future
  graphing feature would want). That is exactly why it lives in the sandbox.
- MathLive does not use `eval` (checked: no `eval(` / `new Function` in mathlive.min.js), so it runs in the panel.

Verified when this was built: a probe script on a normal extension page gets `EvalError`; the sandboxed
engine evaluates fine.

### Engine protocol (sandbox.js)

```
panel → engine  { type: 'ping' }
panel → engine  { type: 'eval', id, mode: 'arith' | 'full', lines: [latex, …],
                  angle: 'rad' | 'deg', places: 'auto' | n, skip: [index, …] }
engine → panel  { type: 'ready' } | { type: 'error', message }
engine → panel  { type: 'progress', id, line }           before each line
engine → panel  { type: 'line', id, line, result }       each line's answer as soon as it's known
engine → panel  { type: 'result', id, results: [ null | { invalid: code } | { slow: true }
                                                  | { exact, approx, approxIsExact, group } ] }
```

The panel sends the whole pad on every (debounced, 220 ms) change and ignores any answer whose `id`
isn't the latest, so a slow old answer can never overwrite a newer one. The engine builds a fresh
ComputeEngine per request so `:=` assignments flow strictly top to bottom, and `ans` is assigned after
each line that has a value. `group` means the answer needs brackets when put into another line.

**Slow lines.** Each line runs inside `ce.withTimeLimit` (1.5 s) and comes back `{ slow: true }` if it
runs over. Some operations never check the deadline (`\gcd(2^{300000}-1,3^{300000}-1)` runs ~15 s), so
the panel also has a watchdog: 3 s with no message from the engine and it replaces the iframe, which kills
the busy frame's process. Either way the line is remembered (`slowKeys` in panel.js, keyed by the line, the
`:=` lines above it, and everything above when it uses `ans`) and sent as `skip` from then on, shown as
"took too long".

**A busy frame's messages arrive late.** `postMessage` from the sandbox reaches the panel only when the
sandbox task that posted it ends (tested: five `progress` messages around two 1.4 s lines all arrived
together at the end). So sandbox.js works out one line per task (a `MessageChannel` tick): post
`progress`, yield, evaluate. That's how the watchdog knows which line hung, and how a newer request
replaces an older one between lines (each tick carries its job's `gen`, so a replaced job's ticks stop). The panel's own thread is not blocked by a busy engine frame (it's
out of process).

To add a new engine feature (e.g. plotting): add a new message `type` in sandbox.js, return plain data
(strings / numbers / arrays — anything structured-clonable), and render it in panel.js.

## Behaviour decisions (so they don't get "fixed" by accident)

- **Answers modes:** Off / Arithmetic / Algebra. Arithmetic answers a line only if it has no unknowns
  (`expr.unknowns` is empty *before* evaluating, so letters assigned earlier with `:=` count as known).
  Algebra also simplifies symbolic lines (2x+3x → 5x). `:=` lines are evaluated in every mode.
- **Answers default to Off**, and turning them on from Off shows a warning dialog (`#ans-warn`) suggesting
  learners keep them off; "Keep answers off" is the focused default and Esc cancels. Deliberate: the pad is
  meant for learning. No warning when switching Arithmetic ↔ Algebra or when a saved mode is restored.
- Decimal shown with `=` when the value is rational (½ = 0.5, 22/7 = 3.\overline{142857}), `≈` only when
  rounded (√2, π, 1/97 whose repetend is too long to find). A repetend Compute Engine finds is parsed back
  and checked against the exact value before it gets `=`. With fixed **Decimals**, rationals are rounded
  exactly in BigInt, half away from zero (1/8 ≈ 0.13); values that would round to 0 (with Decimals ≥ 1),
  or are ≥ 10¹⁵, get scientific notation; a decimal result (100·1.07¹⁰) is shown rounded instead of in
  full. Exact numbers longer than 200 characters (10000!) show only the decimal.
- Relations (`=`, `<`, `:=`, `⊃`, `∣`, …) and other true/false lines never get an answer column, and
  equations are not solved.
- **Answer options** (shown only when answers are on): Rad/Deg (`ce.angularUnit`, so d/dx sin x in Deg is
  π cos x / 180), Decimals (auto, 0–10), and exact first / decimal first. The second form is dimmed.
- **Click an answer** to insert that part (exact or decimal) at the caret of the line last edited, in
  brackets if it's a sum, complex or negative and the line isn't empty. Clicking a line's own answer (or
  with no line edited yet) starts a new line below with it. Shift+click copies it as LaTeX. Each part is
  also a focusable button (Tab, then Enter / Shift+Enter).
- **`ans`** (typed `ans`, an inline shortcut for `\mathrm{ans}`) is the value of the nearest line above that
  has one: any line the mode evaluates, even one with no answer column (`7`). A `:=` line counts with its
  value; a `f(x):=…` definition and true/false lines don't. In Arithmetic, lines with unknowns don't.
- **User functions:** `f(x) := x^2+1`, then `f(3)` = 10; `f(a+1)` in Algebra, several arguments, nesting and
  d/dx f(x) work. Plain CE behaviour, nothing special in sandbox.js. A definition with `=` instead of `:=` is
  just an equation. Two sample lines show it.
- **Markers:** "can't read" for lines CE can't parse (tooltip from the parse error code; a line that parses
  but makes no sense, like `\sin(\infty)`, gets nothing), "took too long" for slow lines (CE's `timeout`
  cancellations only, not e.g. `recursion-depth-exceeded`). Only when answers are on. They fade in after
  0.8 s so a half-typed line doesn't flash.
- **Undo** is one history for the whole pad (typing, new/deleted lines, clear, import, inserted answers),
  so Ctrl+Z goes back in order whichever line has the focus. MathLive's per-line undo bindings are removed
  in `makeRow`, and the on-screen keyboard's undo/redo buttons are captured and sent to the same history.
  Keystrokes in one line less than 1 s apart are one step; undo puts the focus on the line that changed.
  Deleting a non-empty line with ×, clearing and importing also show an Undo toast, which only ever undoes
  that one step: any later step or undo takes the toast away.
- **Copy all…** (☰) copies as LaTeX or plain text, with or without answers (none when answers are Off).
  Plain text is MathLive's `convertLatexToAsciiMath` with fixes in `toText()` for `\coloneq`, `\mathrm{ans}`,
  repeating decimals, digit-group spaces, `\vert` and `^\circ`. Every LaTeX copy (line, answer, Copy all)
  goes through `portable()`, which turns CE's `\exponentialE` / `\imaginaryI` into plain `e` / `i`.
- **Keyboard labels:** stock MathLive keycaps show placeholder boxes (■², √□). `prettyCap()` rewrites the
  *displayed* LaTeX to calculator-style labels (x², √x, ∫f(x)dx) while keeping the original `insert`.
- **Letter colors** (toggle): same letter = same color on every line and in answers; e, i, π stay white.
  Implemented by a MutationObserver on each math-field's (open) shadow root, recoloring `.ML__mathit`.
- **Shortcuts:** Enter new line · ↑/↓ and ←/→ at edges move between lines · Backspace on empty line deletes
  it · Esc Esc clears the pad (with Undo toast) · Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo and redo across the
  pad · Ctrl+/ opens the shortcut guide. `?` must stay typeable (it's a normal character in math), which is
  why the guide is on Ctrl+/.
- **No read-aloud.** MathLive's Ctrl+Alt+↑/↓ `speak` keybindings are removed in `makeRow`: they send the line
  to Chrome TTS, which may be an online voice, breaking "nothing leaves the device" in PRIVACY.md. People
  who need speech use a screen reader.
- Esc is *not* intercepted while a `\command` is being typed (MathLive's LaTeX mode), or when a dialog/menu is open.
- Theme: libadwaita dark only (GNOME). Fonts: Adwaita Sans / Adwaita Mono with fallbacks.
- Storage: `chrome.storage.local`, key `mathslop.v1` → `{ lines, mode, varColors, angle, places, order,
  copyFmt, copyAns }`. Missing fields fall back to defaults, so older saved data still loads.
  Falls back to localStorage if panel.html is opened outside the extension.

## Versioning

`version` in manifest.json follows semver: **major.minor.patch**.

- **minor** (x.**y**.0) for new features or behaviour changes, e.g. 1.1.0 = answers default to Off.
- **patch** (x.y.**z**) for bugfixes only.
- **major** for breaking changes: removing a feature, or a change that leaves users' saved data behind.
  A storage format change that ships with a migration (see `mathslop.v1` below) is not by itself major.
- Bump it in the same branch/PR as the change. Unpacked loads don't need it, but keep it accurate anyway.
- Chrome only accepts 1–4 dot-separated integers (0–65535). No `-beta` / `+build` suffixes; use the
  display-only `version_name` field if a pre-release label is ever needed.

## Publishing (Chrome Web Store)

- `scripts/package.sh` builds `dist/mathslop-<version>.zip` (gitignored) from an allowlist of runtime files.
  It fails if a file referenced by manifest.json, the HTML or CSS is missing, or if a shipped file other than a
  license is referenced by none of them. A new top-level runtime file must be added to `TOP_FILES` *and* be
  referenced from manifest.json, an HTML page or a CSS file (references from JS aren't checked); files under
  `icons/` and `vendor/` are picked up automatically.
- `store/listing.md` has every dashboard field (description, permission justifications, privacy answers,
  reviewer test instructions); `store/*.png` are the screenshots and promo tiles. Keep them in step with
  features, and keep `PRIVACY.md` true: its URL on GitHub `main` is the listing's privacy policy.
- Permissions are only `sidePanel` and `storage`. `clipboardWrite` was dropped in 1.2.0: extension pages can
  write the clipboard from a click without it (tested), and it added an install warning. Adding a permission
  that shows an install warning makes Chrome disable the extension until users re-approve, so don't add one
  lightly.
- `icons/icon128.png` has 16 px transparent padding (96 px artwork), as the store asks; 16/32/48 stay full-bleed.
- Every upload needs a higher `version` than the last one uploaded.

## Vendored versions

- MathLive 0.111.1 (MIT) — `vendor/mathlive/` (stock, unpatched; the artifact/web version needed a patch
  to keep the virtual keyboard inside an iframe, the side panel does not). Since 0.111.0 `<math-field>`
  has no default `aria-label`; `renumber()` sets "Line N".
- @cortex-js/compute-engine 0.161.0 (MIT) — `vendor/compute-engine/compute-engine.min.js` is
  `dist/umd-min/compute-engine.cjs` renamed to `.js` (classic script, exposes `globalThis.ComputeEngine`).
  A classic script is used on purpose: the sandbox has a null origin, and ES module loading there needs CORS.

To update: `npm pack mathlive @cortex-js/compute-engine`, copy the same files over, reload, and check the
sample lines still produce answers. CE changes fast (0.133 → 0.161 in a month) and its changelog is long;
read its Breaking Changes sections. 0.161 needed `repeatingDecimal: 'vinculum'` to keep 22/7 = 3.\overline{142857}
and writes big integers in MathJSON as `{ num: "…e+2499" }`.

## Renaming / moving the folder

- An unpacked extension's ID is derived from its folder path. Renaming or moving the folder makes Chrome
  treat it as a new extension, and `chrome.storage` data (the saved pad) stays with the old ID.
  Before moving: ☰ → Copy all as LaTeX, then Import afterwards.
- The storage key `mathslop.v1` in panel.js is internal. Changing it looks like a fresh install to users,
  so bump the `.v1` suffix only for a real data-format change, with a migration from the old key.
- User-visible name lives in: manifest.json (`name`, `action.default_title`), panel.html (`<title>`, `<h1>`).

## License

Dual licensed `MIT OR WTFPL` (LICENSE, LICENSE-MIT, LICENSE-WTFPL). Files under `vendor/` keep their own
licenses (both MIT, see each LICENSE.txt) — keep those files when updating vendored libraries.

## Related

The same scratchpad also exists as a standalone web page / claude.ai artifact (single HTML file, loads
Compute Engine from jsDelivr). It is not generated from this folder; changes here don't flow back.
