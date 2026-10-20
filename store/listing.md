# Chrome Web Store listing

Everything to paste into the Chrome Web Store developer dashboard, tab by tab. Name and summary come
from manifest.json and can't be edited in the dashboard; change them there and re-upload.

## Package (Build → Package)

Build it with `scripts/package.sh` (runnable from any directory). It writes `dist/mathslop-<version>.zip`
with manifest.json at the root, and contains only:

```
manifest.json  background.js  panel.html  panel.js  panel.css  sandbox.html  sandbox.js
icons/  vendor/  LICENSE  LICENSE-MIT  LICENSE-WTFPL  COPYING
```

It leaves out `.git/`, `docs/`, `store/`, `scripts/`, `dist/`, `CLAUDE.md`, `README.md` and `PRIVACY.md` (none of
them are loaded by the extension). Rebuild after every manifest or code change. Every upload needs a higher
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

Features:

- A multiline editor built on MathLive. Type / for a fraction, ^ and _ for superscripts and subscripts, and names like sqrt, pi or sin turn into symbols. A backslash starts a LaTeX command (\alpha, \int).
- An on-screen keyboard for fractions, roots, powers, integrals, Greek letters and more, with calculator-style labels (x², √x) instead of placeholder boxes.
- Optional answers next to each line, in three modes:
    Off: no answers, just writing. This is the default.
    Arithmetic: answers lines with no unknowns, like 1/3 + 1/6 or the integral of sin x from 0 to π. Letters you give a value with := (a := 3) count as known on the lines below.
    Algebra: also simplifies lines with unknowns, so 2x + 3x becomes 5x and d/dx x³ becomes 3x².
  Turning answers on asks first, and suggests keeping them off while you're still learning the material.
- Answers show the exact result and, where it helps, a decimal: = when the decimal is exact (1/2 = 0.5), ≈ when it's rounded (√2, π). Click an answer to copy it.
- Colors: give each letter its own color, the same on every line and in the answers, so you can follow a variable through your working.
- Copy one line or the whole pad as LaTeX, and import LaTeX to replace or add to the pad.
- Keyboard shortcuts: Enter for a new line, arrow keys to move between lines, Backspace on an empty line to delete it, Esc twice to clear the pad (with Undo). Ctrl+/ shows the full list.
- The pad saves itself and is still there next time you open the panel.

Privacy: everything stays on your device. The pad is kept in Chrome's local extension storage, nothing is synced or sent anywhere, and there are no accounts, ads or analytics. The extension has no network access at all, so it also works offline.

Good to know:
- Click the toolbar icon to open the side panel (pin it from the puzzle-piece menu first).
- Answers come from the Compute Engine library. Angles are in radians, and some lines just won't get an answer. Check anything that matters.
- Dark theme only.

Free and open source (MIT or WTFPL): https://github.com/girlpocalypse/mathslop
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

**Homepage URL:** https://github.com/girlpocalypse/mathslop

**Support URL:** https://github.com/girlpocalypse/mathslop/issues

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
Saves the user's pad (the lines of math they typed), the Answers mode and the Colors setting with chrome.storage.local, so the pad is still there the next time the panel opens. Stored only on the device; nothing is synced or sent anywhere.
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

**Privacy policy URL:** https://github.com/girlpocalypse/mathslop/blob/main/PRIVACY.md

## Distribution tab

Free, Public, all regions.

## Test instructions tab

Max 500 characters (this is 457). Re-count after any edit.

```
No account needed.
1. Click the mathslop toolbar icon (pin it from the puzzle menu). The side panel opens with sample lines.
2. Click Arithmetic, then Enable answers. Expect 5, 2, 5050, 1/2 = 0.5 and 0.
3. Click Algebra: d/dx x^3 shows 3x^2.

The engine runs in sandbox.html (manifest "sandbox") because Compute Engine uses new Function. It has no chrome.* APIs and its CSP blocks all network. Both libraries are unmodified npm builds; nothing remote loads.
```

## If review asks about the sandbox or remote code

Longer explanation to paste into a reply or appeal (doesn't fit in the test instructions).

```
About the sandbox page: the math engine (Compute Engine) uses new Function for compiling expressions, which the extension page CSP forbids. So it runs in sandbox.html, declared under "sandbox" in the manifest, inside a hidden iframe in the panel. It has no chrome.* APIs, and its CSP is "sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-eval'; base-uri 'none'; form-action 'none'", so it can only run its two packaged scripts and can't make network requests. It only receives the pad's LaTeX strings via postMessage and sends back results. This is the pattern from https://developer.chrome.com/docs/extensions/how-to/security/sandboxing-eval

Vendored libraries: vendor/mathlive/mathlive.min.js (MathLive 0.110.0) and vendor/compute-engine/compute-engine.min.js (@cortex-js/compute-engine 0.133.0) are the unmodified minified builds from npm. All code is in the package; nothing is fetched and no fetched string is evaluated. The panel's own CSP also sets connect-src 'none'.

URL strings you may see in them: Compute Engine contains a fetch to oeis.org inside its ce.lookupOEIS() method (an integer-sequence lookup). sandbox.js never calls it, and the sandbox CSP would block it anyway. MathLive mentions esm.run only in console error text. Neither library loads anything remote here.
```
