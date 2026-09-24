# mathslop — Chrome side panel extension

A multiline math scratchpad (MathLive editor + Compute Engine answers) that opens in Chrome's side panel.
Manifest V3, no build step, no network access at runtime — every library is vendored.

## Open items

- [ ] **(Optional) Restrict the panel's network access too.** The sandbox has no network (see Architecture),
      but `extension_pages` in manifest.json only adds `frame-src 'self'`, so panel.html can still `fetch` or load
      remote images. It only runs vendored code without `eval`, so this is hardening, not a known hole. If done:
      add `connect-src 'none'` and `img-src 'self'` (plus `data:` if the MathLive keyboard turns out to need it)
      to `extension_pages`, keeping `script-src 'self'; object-src 'self'; frame-src 'self'`. Don't use `default-src 'self'`/`'none'` there: MathLive renders answers as HTML with inline
      `style="…"` attributes, which a `style-src` fallback would block. Re-test answers, the virtual keyboard, fonts,
      and Copy/Import afterwards.

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
```

**The rule:** anything that uses `eval`, `new Function`, or a library that does, goes in the sandbox.
Everything else stays in the panel.

- Extension pages (panel.html) run under MV3's fixed CSP: `script-src 'self'` (manifest.json also adds
  `frame-src 'self'`, so the engine iframe can't be navigated to an outside URL). No `eval`, no
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
panel → engine  { type: 'eval', id, mode: 'arith' | 'full', lines: [latex, …] }
engine → panel  { type: 'ready' } | { type: 'error', message }
engine → panel  { type: 'result', id, results: [ null | { exact, approx, approxIsExact } ] }
```

The panel sends the whole pad on every (debounced, 220 ms) change and ignores any result whose `id`
isn't the latest, so a slow old answer can never overwrite a newer one. The engine builds a fresh
ComputeEngine per request so `:=` assignments flow strictly top to bottom.

To add a new engine feature (e.g. plotting): add a new message `type` in sandbox.js, return plain data
(strings / numbers / arrays — anything structured-clonable), and render it in panel.js.

## Behaviour decisions (so they don't get "fixed" by accident)

- **Answers modes:** Off / Arithmetic / Algebra. Arithmetic answers a line only if it has no unknowns
  (`expr.unknowns` is empty *before* evaluating, so letters assigned earlier with `:=` count as known).
  Algebra also simplifies symbolic lines (2x+3x → 5x). `:=` lines are evaluated in every mode.
- Decimal shown with `=` when the value is rational (½ = 0.5, 22/7 = 3.\overline{142857}), `≈` only when
  rounded (√2, π).
- Relations (`=`, `<`, `:=`, …) never get an answer column.
- **Keyboard labels:** stock MathLive keycaps show placeholder boxes (■², √□). `prettyCap()` rewrites the
  *displayed* LaTeX to calculator-style labels (x², √x, ∫f(x)dx) while keeping the original `insert`.
- **Letter colors** (toggle): same letter = same color on every line and in answers; e, i, π stay white.
  Implemented by a MutationObserver on each math-field's (open) shadow root, recoloring `.ML__mathit`.
- **Shortcuts:** Enter new line · ↑/↓ and ←/→ at edges move between lines · Backspace on empty line deletes
  it · Esc Esc clears the pad (with Undo toast) · Ctrl+/ opens the shortcut guide. `?` must stay typeable
  (it's a normal character in math), which is why the guide is on Ctrl+/.
- Esc is *not* intercepted while a `\command` is being typed (MathLive's LaTeX mode), or when a dialog/menu is open.
- Theme: libadwaita dark only (GNOME). Fonts: Adwaita Sans / Adwaita Mono with fallbacks.
- Storage: `chrome.storage.local`, key `mathslop.v1` → `{ lines, mode, varColors }`.
  Falls back to localStorage if panel.html is opened outside the extension.

## Vendored versions

- MathLive 0.110.0 (MIT) — `vendor/mathlive/` (stock, unpatched; the artifact/web version needed a patch
  to keep the virtual keyboard inside an iframe, the side panel does not).
- @cortex-js/compute-engine 0.133.0 (MIT) — `vendor/compute-engine/compute-engine.min.js` is
  `dist/umd-min/compute-engine.cjs` renamed to `.js` (classic script, exposes `globalThis.ComputeEngine`).
  A classic script is used on purpose: the sandbox has a null origin, and ES module loading there needs CORS.

To update: `npm pack mathlive @cortex-js/compute-engine`, copy the same files over, reload, and check the
sample lines still produce answers.

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
