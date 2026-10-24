# CLAUDE.md "Behaviour decisions" → tests

Every bullet of CLAUDE.md's "Behaviour decisions" and the tests that pin it (file › describe or test name).
Update this when a rule changes or a test moves.

| Rule | Tests |
|---|---|
| **Answers modes** (Off / Arithmetic / Algebra; unknowns checked before evaluating; `:=` only for letters and functions, `assignable`, subscripts refused) | engine/lines › modes and angles; engine/assign (all); engine/lines › libraryHas, assignable, GREEK, CONSTANTS; browser/panel-controls › answers mode |
| **Answers default to Off**, the `#ans-warn` dialog, no warning Arithmetic ↔ Algebra or for a restored mode | browser/e2e-flows › a first run …; browser/panel-controls › answers mode; browser/e2e-flows › every setting survives a reload |
| `=` vs `≈`, repetends checked, float digits, fixed Decimals rounding, scientific notation, beyond a double, complex part by part, long exact numbers, rounded floats inside exact forms, NaN | engine/decimal (all); engine/numbers (all); engine/lines › numbers |
| No answer that repeats the line (`key`), empty `^{}`/`_{}` | engine/lines › key; echoes; empty boxes and rewriting |
| Relations and true/false lines get no answer | engine/lines › relations and true/false lines |
| **Answer options**: Rad/Deg, Decimals, exact/decimal first, the second form dimmed | engine/lines › modes and angles; engine/protocol › places 0–20 …, angle deg; browser/panel-answers › the second form is dimmed; the same result again … a new order re-renders; browser/panel-controls › Decimals |
| **Click an answer**: insert at the caret of the line last edited, brackets (`group`, `isSum`), own line → new line, Shift+click copies, keyboard reachable, labels, what counts as "last edited" | browser/panel-pad › inserting an answer; browser/e2e-import › Tab order; browser/e2e-flows › an answer clicked into another line …; browser/panel-latex › isSum, answerParts; browser/panel-answers › labels; browser/panel-toast › Shift+click copies; browser/e2e-keyboard › typing with the on-screen keyboard … |
| **Inline shortcuts** removed (`NO_SHORTCUT`) | browser/e2e-typing › MathLive shortcuts this pad removes …; browser/panel-pad › each line field |
| **`ans`** (shortcut, `ansOut`, which lines set it) | engine/lines › ans; browser/e2e-typing › ans, ans*2 and :=; browser/panel-pad › ansOut |
| **User functions** | engine/lines › user functions; engine/assign › QA cases; engine/lines › relations (`f(x)=…` is an equation) |
| **Markers** ("can't read" with tips, "took too long", fade-in, empty boxes, `\differentialD`) | browser/panel-answers › markers; engine/lines › empty boxes and rewriting; engine/protocol › failures; browser/panel-bridge (watchdog); browser/e2e-flows › a hung line … |
| **Undo** (one history, grouping, carets, `done`, `forgetTyping`, Undo toast, inert toast, focus after ×, toasts above the keyboard) | browser/panel-history (all cases in test/cases/history.mjs); browser/panel-toast › toasts; browser/e2e-typing › undo across the pad; browser/e2e-flows › × deletes a line …; browser/e2e-keyboard › … page makes room |
| **Copy all…** (LaTeX / text, answers, `toText` fixes, `portable`) | browser/panel-controls › Copy all…; browser/panel-latex › toText, portable |
| **Keyboard labels** (`prettyCap`, `spokenKey` relabelling) | browser/panel-latex › keycaps; browser/e2e-keyboard › keycaps show calculator labels …; keys are relabelled … |
| **Letter colors** (same letter same color, e and i stay uncolored, answers too) | browser/e2e-flows › Colors paints letters …; browser/panel-latex › colors |
| **Shortcuts** (Enter, arrows, Backspace, Esc Esc, undo keys, Ctrl+/, Tab order, on-screen ↵/⌫ at pointerup, `pendingRow`, Keyboard button, line menu: `menuBlocks`, scrim, ☰ hidden with color, `?` typeable) | browser/e2e-typing (all); browser/e2e-keyboard (all); browser/e2e-menu › the menu in a line; browser/panel-toast › with a menu open in a line; browser/panel-controls › Keyboard button |
| **No read-aloud** | browser/panel-pad › Ctrl+Alt+↑ doesn't read the line aloud; each line field (no `speak` binding) |
| Esc not intercepted in a `\command` or with a dialog/menu open; `menuEscAt` | browser/e2e-typing › Esc Esc; browser/e2e-menu › a right-click opens it; Esc closes it and doesn't count toward Esc Esc |
| Theme and fonts | not tested (visual; the store screenshots are checked by hand) |
| **Storage** (`mathslop.v1`, defaults for missing fields, localStorage fallback) | browser/panel-settings (all) |

Also outside "Behaviour decisions": the engine protocol and job scheduling (engine/protocol), the CSP and no
network (browser/zip › CSP …, … no console errors), packaging (browser/zip), the side panel (browser/e2e-menu ›
side panel; engine/background).
