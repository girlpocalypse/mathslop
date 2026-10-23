# Changelog

What changed in each version of mathslop. Version numbers follow semver (see "Versioning" in CLAUDE.md).
The Chrome Web Store has no release-notes field, so the latest entry is also summarized at the top of the
store description (store/listing.md).

## 1.3.0 (2026-10-23)

### New

- **Reuse answers.** Click an answer to put it into the line you were editing, at the cursor, in brackets
  when it needs them (2·(x+1), not 2·x+1). Shift+click copies it. From the keyboard, Tab goes from a line to
  its answer, and Enter uses it.
- **`ans`**: type `ans` for the answer of the nearest line above.
- **User functions.** `f(x) := x² + 1`, then `f(3)` = 10 (and `f(a+1)` in Algebra). The sample pad shows it.
- **Answer options**, shown when answers are on: degrees or radians, decimal places (auto, 0–6, 8 or 10), and
  exact or decimal first. Rounding is exact (1/8 ≈ 0.13); values too small or too big for the places get
  scientific notation.
- **Copy all…** in the ☰ menu: copy the pad as LaTeX or plain text, with or without answers.
- **Undo for the whole pad.** Ctrl+Z steps back through typing, new and deleted lines, clearing and import,
  in order, whichever line has the focus (Ctrl+Shift+Z or Ctrl+Y redoes). The on-screen keyboard's undo
  buttons do the same. Deleting a line with × shows an Undo toast.
- On the on-screen keyboard, ↵ adds a line and ⌫ on an empty line deletes it, like Enter and Backspace.
- **Markers** (with answers on): "can't read" on lines with a typo or an empty box, and "took too long" on a
  line that was skipped after 1.5 s.

### Changed

- Clicking an answer inserts it instead of copying it; copying is Shift+click.
- Copied LaTeX writes e and i as plain `e` and `i`, so it works in other LaTeX tools.
- Each line is labeled "Line N" for screen readers, and Tab moves through the page in order (a line, its
  answer, its tex and × buttons, the next line) instead of jumping from line to line; ↑/↓ and ←/→ at the
  edges still do that.
- MathLive 0.110.0 → 0.111.1 (fixes XSS and CSS-injection bugs with crafted LaTeX), Compute Engine 0.133.0 →
  0.161.0.

### Fixed

- A heavy line (a huge sum or factorial) no longer stops every answer below it. The engine stops a slow line
  itself, and the panel restarts the engine if it stops responding for 3 s.
- Very large or very small answers are shown in scientific notation instead of as thousands of digits.
- An answer no longer just repeats what you typed (typing 1/3 showed = 1/3 = 0.3̅; now just = 0.3̅).
- A decimal result that uses all of the engine's digits (√2.5, 10²⁰ + 0.5) is marked ≈, not =.
- Esc Esc no longer clears the pad when you only meant to close the menu inside a line.
- The Keyboard button opens the on-screen keyboard on the line you were in, not the last line.

## 1.2.0 (2026-10-19)

First version submitted to the Chrome Web Store.

- Dropped the `clipboardWrite` permission (copying works without it), so installing shows no warning.
- Removed MathLive's read-aloud shortcuts, which could send a line to an online voice.
- Store listing, privacy policy, icons and screenshots.

## 1.1.0 (2026-09-23)

- Answers default to Off. Turning them on asks first and suggests keeping them off while you're learning.
- No network access: the side panel's and the math engine frame's Content Security Policies block all
  connections, remote images and frames.

## 1.0.0 (2026-09-23)

- A multiline math pad in Chrome's side panel, built on MathLive, with an on-screen math keyboard.
- Answers from Compute Engine in Arithmetic or Algebra mode, with `:=` assignments.
- A color per letter, copy and import as LaTeX, and keyboard shortcuts.
