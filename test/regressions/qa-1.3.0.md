# QA regressions from 1.3.0

Every failing check from the 1.3.0 code review, QA rounds 1–9 and the final check, extracted from the
QA workflow journals so the cases no longer depend on transcript files. Scratch paths in the original
reports are replaced by "[scratch file]"; those files no longer exist.

`Test:` names the test that covers an entry, or `todo` (with the issue) for one still open. Entries the
verifier could not reproduce are marked "not reproduced" and need no test.

## Code review before QA (wf_ee74d5f9-ef0)

### review-1: With fixed Decimals, a non-rational value too big for a double (above about 1.8e308) is printed in full positional notation, padded with mad

- Severity: medium
- Where: `sandbox.js:82`
- Repro: Set Decimals to 3 and type `1000000!` (CLAUDE.md's own heavy-line example). The approx answer is a 9,276,185-character LaTeX string: 5.5 million digits, all but 21 of them fake zeros. In the panel, MathLive.convertLatexToMarkup throws RangeError (stack overflow), so the 'line' handler throws and the row is left blank. With plain text plus answers, Copy all… also throws in toText (convertLatexToAsciiMath overflows at about 1M chars), so its dialog never opens. Smaller cases: `e^{1000}` at Decimals 2 gives a 435-digit integer ending in 414 zeros, and `10^{400}\sqrt{2}` likewise, even though the docs say values ≥ 10^15 get scientific notation.
- Verifier: Reproduced. In the Node harness at Decimals 3, e^{1000} returns a 435-digit positional number ending in long runs of zeros, and 1000000! returns a 9,276,185-char approx (sandbox.js:81-82,95: x = |re| = Infinity, so `outside` is false and toLatex({digits:{fractional}}) is used). I loaded a private headless Chromium with a scratch copy of the extension, using lines 1+1 / 1000000! / 2+2 / 1/3 in arith at places 3. The 1000000! row stays blank and an uncaught exception from mathlive.min.js appears in the console. The other rows still render because showResult sets data-key before the throw, so the 'result' pass returns early. No restart loop happened. This contradicts the CLAUDE.md rule that values >= 10^15 get scientific notation.
- Test: pending

### review-2: Each new 'eval' starts another MessageChannel tick chain while the old one's tick is still queued. Chains only die when a job finishes, so w

- Severity: medium
- Where: `sandbox.js:147`
- Repro: In a pad whose lines take 100 ms–1.4 s (sums, integrals), keep typing so a request goes out every few hundred ms before the previous job finishes. Each replacement adds a permanent tick chain: start() calls next(), which always posts a tick, and every step re-posts one. Ticks and incoming window messages share a FIFO task queue, so request N is received only after about N-1 more lines of the abandoned job have run. Answers lag further behind with each edit (seconds with ~1 s lines), and the claim that a newer request replaces the current one between lines stops holding.
- Verifier: Confirmed from the code. start() always calls next(), which always posts a tick (sandbox.js:147,152). The previous job's queued tick is never cancelled, and step() acts on whatever `job` currently is. So every replacement adds another permanent tick chain, and all chains die only when some job finishes. Incoming 'eval' messages queue behind k ticks, so k stale lines run before each new request is received. The reviewer's Chrome timing shows the delay growing linearly. Results stay correct, but latency and CPU grow while you edit a busy pad. This undoes the documented claim that a new request replaces the old one between lines.
- Test: pending

### review-3: The new Decimals setting (and '≈') is ignored on any line that contains a decimal number. A float result has approxV.latex === exactL, so de

- Severity: medium
- Where: `sandbox.js:125`
- Repro: Set Decimals to 2 and type `100\cdot1.07^{10}`. You get '= 196.715135728956532249' instead of '≈ 196.72'. Likewise `\sqrt{2.5}` gives '= 1.581138830084189666', `\sin(0.5)` gives '= 0.479425538604203000273', `\frac{1}{3.0}` gives '= 0.333333333333333333333', and in Deg `\arccos(0.3)` gives '= 72.5423968762779077098'. Decimals 0 changes nothing either. The 'decimal first' order has no effect on these lines.
- Verifier: Reproduced at places 2: 100·1.07^{10} gives exact '196.715135728956532249' with approx null, and √2.5 and sin(0.5) behave the same. The cause is sandbox.js:125. When the result is already a float literal, approxV.latex === exactL, so decimal() never runs and the Decimals setting is ignored. These values are shown with '=' at full precision. Compound interest at 2 decimals is a realistic case.
- Test: pending

### review-4: In Arithmetic, whether a `:=` line sets ans depends on whether its left-hand symbol was assigned before. A first-time `r:=4` counts r as an 

- Severity: medium
- Where: `sandbox.js:111`
- Repro: Arithmetic mode, lines `2+3`, `r:=4`, `\mathrm{ans}^2`. The third line shows 25 (ans is still 5). The same pad in Algebra shows 16, which matches the docs ('a := line counts with its value'). Add `r:=6`, `\mathrm{ans}^2` and Arithmetic now shows 36, so the second assignment counts and the first doesn't. `y:=x+1` with x known also doesn't set ans. The wrong number appears without any warning.
- Verifier: Reproduced. In arith, 2+3 / r:=4 / ans^2 gives 25, but full mode gives 16. A re-assignment r:=6 then does set ans, giving 36. So whether a := line sets ans depends on whether its LHS was assigned before. The reason is that `numeric` (sandbox.js:109) counts the not-yet-assigned LHS as an unknown, and line 111 returns before ce.assign('ans'). The user gets a wrong number with no sign that anything is off.
- Test: pending

### review-5: In auto, exactPlaces only limits significant digits (≤ 21), not decimal places, so exact tiny decimals such as 10^{-k} are written out with 

- Severity: low
- Where: `sandbox.js:51`
- Repro: `10^{-30}` shows '= 0.000 000 000 000 000 000 000 000 000 001' where CE's own digits are 1.0·10^{-30}. That contradicts the comment that auto keeps Compute Engine's digits. `10^{-1000}` produces a 1,668-char answer and `10^{-10000}` a 16,668-char one. `10^{-100000}` spends about 18 s in the sandbox's own while-loops, so in the panel the 3 s watchdog kills the frame and marks a line CE evaluates instantly as 'took too long'.
- Verifier: The long positional output for 10^{-30} is exact and correct (it shows '='), so on its own that is only cosmetic. The real defect is in exactPlaces (sandbox.js:46-51). It strips 2/5 factors one at a time on a BigInt the size of q, which is O(k^2), and CE's time limit doesn't cover it. The reviewer measured about 18 s for 10^{-100000}, which trips the 3 s watchdog and kills the frame for a line CE evaluates instantly. Only contrived inputs hit this.
- Test: pending

### review-6: Contrary to the docs ('values that would round to 0 … get scientific notation'), values that round to 0 show as 0 when Decimals is 0 (the `p

- Severity: low
- Where: `sandbox.js:82`
- Repro: Decimals 0: `\frac{1}{3}`, `\frac{1}{1000}`, `2^{-100}` and `10^{-20}\sqrt{2}` all show '≈ 0', while Decimals 1 gives 1.0·10^{-3} and so on. Decimals 3: `2^{-30000}`, `\frac{3}{2^{100000}}` and `\frac{1}{10000!}` show '≈ 0.000', and `10^{-400}\sqrt{2}` at Decimals 2 shows '≈ 0.00'. The exact form is hidden as too long for several of these, so '≈ 0.000' is the only answer shown.
- Verifier: Reproduced. At places 0, 1/3 and 1/1000 give approx '0'. That comes from the `places > 0` guard in sandbox.js:82, and CLAUDE.md says values that would round to 0 get scientific notation. Separately, for tiny rationals such as 2^{-30000} at places 3, re underflows to 0, so `x !== 0` fails and fixed() prints '0.000' as the only answer shown. These are edge cases, and the docs contradict the code.
- Test: pending

### review-7: A rational is marked exact (`=` with an overline) whenever CE's vinculum heuristic finds a repetend in its 21-digit N() value, even when the

- Severity: low
- Where: `sandbox.js:88`
- Repro: `\frac{1}{3}+10^{-30}` shows '= 0.\overline{3}', `\frac{2}{3}-10^{-25}` shows '= 0.\overline{6}', `\frac{1}{7}+\frac{1}{10^{25}}` shows '= 0.\overline{142857}', and `\frac{12121212121212121212121}{10^{23}}` (a terminating decimal) shows '= 0.\overline{12}'. Each claims equality with a different number.
- Verifier: The code confirms it (sandbox.js:87-88). The '=' is decided by CE's vinculum heuristic on the 21-digit float, not from [p, q], so 1/3+10^{-30} and 12121212121212121212121/10^{23} get '= 0.\overline{…}' for a different number. It only shows up with contrived inputs. The old code was worse (approxIsExact = isRational for every rational), but the new code now asserts the false equality explicitly.
- Test: pending

### review-8: Every CancellationError is reported as { slow: true }, including CE's instant 'recursion-depth-exceeded'. The panel then shows 'took too lon

- Severity: low
- Where: `sandbox.js:165`
- Repro: Algebra mode: `f(x):=f(x)+1`, then `f(3)`. f(3) fails after about 50 ms with cause 'recursion-depth-exceeded' but is marked 'took too long … more than 1.5 seconds', added to slowKeys, and skipped until edited. `g(x):=g(x-1)` / `g(2)` behaves the same.
- Verifier: Reproduced: f(x):=f(x)+1 then f(3) gives {slow:true} in a request that took about 300 ms in total. CE's CancellationError has the causes 'timeout', 'recursion-depth-exceeded' and 'iteration-limit-exceeded' (found by grepping the vendored build). sandbox.js:165 maps every one of them to slow. The panel then shows the 'more than 1.5 seconds' tooltip and puts the line in slowKeys.
- Test: pending

### review-9: `group` is false for complex number literals such as 1+3i, whose operator is 'Complex', not 'Add'. Clicking that exact answer into a non-emp

- Severity: low
- Where: `sandbox.js:131`
- Repro: `(2+i)(1+i)` answers '= 1+3i' with group:false. Clicking it into a line holding `2\cdot` gives `2\cdot1+3i` (= 2+3i) instead of 2(1+3i). Same for `\sqrt{-4}+1` and `\frac{1}{3}+i`. The approx part is fine because the panel uses its own regex.
- Verifier: Reproduced: (2+i)(1+i) and √-4+1 give group:false because val.operator is 'Complex', not Add (sandbox.js:131). Clicking that exact answer into a non-empty line such as `2\cdot` inserts it without brackets, which changes the value. You need a complex answer inserted where operator precedence matters, and the result is visible in the line.
- Test: pending

### review-10: Type errors make the parse invalid, so lines that parse fine get the 'can't read' marker with code 'invalid', and the panel's tooltip says '

- Severity: low
- Where: `sandbox.js:100`
- Repro: Type `\sin(\infty)`, `\cos(\infty)` or `\tan(\infty)`. CE returns ['Sin', ['Error', ['ErrorCode', 'incompatible-type', …]]], so isValid is false, and err.op1 is an ErrorCode, not a string, so the code is 'invalid'. The row says 'can't read … Check for a typo.' for a correctly typed line. The old code showed nothing.
- Verifier: Reproduced: \sin(\infty) gives {invalid:'invalid'}. CE parses it fine, but a type error (ErrorCode 'incompatible-type') makes isValid false. err.op1 is an ErrorCode expression, not a string, so the panel says 'can't read … Check for a typo.' for a correctly typed line. CLAUDE.md says the marker is for lines CE can't parse.
- Test: pending

### review-11: The REL list lacks several relations that CE 0.161 evaluates to booleans (Superset, SupersetEqual, NotSubset, Divides, \cong). Those lines g

- Severity: low
- Where: `sandbox.js:113`
- Repro: Arithmetic: `\{1,2\}\supset\{1\}`, `3\mid 6` or `5\cong 5` each show '= ⊤', and a following `\mathrm{ans}` line shows ⊤. The answers already appeared before this change; the ans assignment is new.
- Verifier: Reproduced: 3\mid 6, 5\cong 5 (TildeFullEqual), \supset (Superset), \supseteq and \not\subset (NotSubset) all give '= ⊤', and a following ans line shows ⊤. Their operators are not in REL (sandbox.js:25). The answer column for these was already there before this change; the new part is that they now set ans. Rare input, and it contradicts 'Relations never get an answer column'.
- Test: pending

### review-12: Copy all… in LaTeX with answers (and Shift+click 'copies it as LaTeX') writes Compute Engine-only macros such as \exponentialE and \imaginar

- Severity: high
- Where: `panel.js:550`
- Repro: Algebra mode, lines `e^x+e^x`, `e\cdot e`, `\sqrt{-1}`. Choose ☰ → Copy all… → LaTeX → Include answers → Copy, then paste into Overleaf, KaTeX, MathJax, Obsidian or Anki. You get `e^x+e^x = 2\exponentialE^{x}`, `\exponentialE^{2} \approx 7.389…` and `\sqrt{-1} = \imaginaryI \approx 1.0\imaginaryI`, and each one fails as an undefined control sequence. Any answer containing e or i is affected, which is common in Algebra (derivatives of e^x, complex roots). The plain-text path gets this right ('2e^x', 'i') because MathLive's AsciiMath converter knows these macros. The LaTeX path passes `p.latex` (CE's `val.latex`) through unchanged.
- Verifier: I reproduced it independently on my own private headless Chromium with a scratch copy of the extension. Steps: answers on, then ☰ → Import, then Replace using real mouse clicks. After that, neither keyDown+text nor insertText puts characters into lines 1 or 2. Clicking the field leaves document.getSelection().rangeCount at 0, the sink stays contenteditable/read-write, and clicking elsewhere first doesn't help. With Answers Off the same flow works and rangeCount is 1. Swapping to dlg.close() before hist.change(setLines) on the scratch copy fixed it in 2 of 2 runs. It reproduces only in headless Blink, but it is deterministic and depends on the DOM, not on window activation, since Off mode works in the same environment. The effect is that you can't type in imported lines (Import is the documented migration path) until the panel is reloaded.
- Test: pending

### review-13: undoToast stores `n = hist.size` after hist.change(). So the toast's Undo removes the wrong steps in two cases: when the change was a no-op 

- Severity: medium
- Where: `panel.js:305`
- Repro: (a) Type `+2` into line 1 (pad `1+1+2`). Open ☰ → Import LaTeX… (it is prefilled with the current lines) and click 'Replace pad' without editing. The toast says 'Pad replaced'. Clicking its Undo reverts your earlier typing to `1+1` and reports 'Pad restored', though the import changed nothing. Append with an empty textarea does the same. (b) After 200 or more history steps in a session, press Esc Esc and type one character within 5 s, then click Undo in the toast. Only the character is undone, the pad stays cleared, and the toast still says 'Pad restored'. Ctrl+Z or Ctrl+Shift+Z can still recover in both cases, so nothing is lost permanently.
- Verifier: Reproduced: edit line 1, wait over 1 s, edit line 4, then Ctrl+Z. Line 4 is reverted but focus moves to line 1 (focus=0), and the next typed '5' went into line 1 (1+175). undo() restores the popped snapshot's focus (panel.js:275-276,297), and that snapshot recorded the focus after the earlier edit.
- Test: pending

### review-14: The 'took too long' tooltip (SLOW_TIP) and the shortcut guide (panel.html:84) say editing the line or any line above it retries it. In the c

- Severity: medium
- Where: `panel.js:379`
- Repro: Arithmetic mode, lines `1+1`, `\sum_{n=1}^{10^9} n`, `2+2`. Line 2 shows 'took too long'. Following the tooltip, edit line 1 to `1+1+5`. Line 2 is still skipped and never re-evaluated, because lineKey() only includes := lines above it, plus all lines above when the line contains \mathrm{ans}. Switching Arithmetic/Algebra does retry it, which the text doesn't mention.
- Verifier: Reproduced: delete line 3 with ×, type +5 in line 1, then click the toast's Undo. Line 3 comes back, but 1+1+5 also reverts to 1+1, and the toast only says 'Line restored'. undoTo(n) (panel.js:301) undoes every step after the action. Edits made while the toast is up are silently thrown away, and redo can't keep both.
- Test: pending

### review-15: CLAUDE.md's `ans` rule says 'a := line counts with its value' and 'In Arithmetic only answered lines set it'. In Arithmetic, both parts are  — not reproduced

- Severity: low
- Where: `CLAUDE.md:118`
- Repro: Arithmetic mode, lines `7`, `f(x)\coloneq x^2`, `\mathrm{ans}+1`, `a\coloneq 3`, `\mathrm{ans}`. `ans+1` = 8, so the unanswered line `7` did set ans. The last line also shows 8, not 3, so `a := 3` did not set ans. In Algebra the same pad gives 8 and 3. sandbox.js:111 returns before the assignment at line 114 when `a` is still an unknown (Arithmetic and not numeric), while a plain number with no answer column is numeric and does assign. The shortcut guide's 'The answer of the nearest line above that has one' is also misleading in Arithmetic after an assignment.
- Verifier: Duplicate of #8: same root cause (sandbox.js:131 doesn't set group for the 'Complex' operator), with the same panel effect.
- Test: none needed

### review-16: CLAUDE.md says that with fixed Decimals, 'values that would round to 0 … get scientific notation'. That isn't true when Decimals is 0, becau

- Severity: low
- Where: `CLAUDE.md:110`
- Repro: Decimals = 0, Algebra mode, line `\frac{1}{10^{20}}`. The answer is `≈ 0` (and `\frac{1}{3}` gives `≈ 0`), not scientific notation as documented.
- Verifier: Reproduced: type 5 in line 2, wait, then ☰ → Import → Replace with the prefilled text. The pad is unchanged, but the toast still says 'Pad replaced', and its Undo reverted 2+25 to 2+2 with 'Pad restored'. change() pops the no-op step (panel.js:294), but undoToast still uses hist.size, which now points at the previous real step. push() has also already cleared the redo stack.
- Test: pending

### review-17: Plain-text export turns CE's `\vert x\vert` answers into U+2223 ('∣x∣', the 'divides' sign) instead of ASCII '|x|'. toText() doesn't fix \ve

- Severity: low
- Where: `panel.js:541`
- Repro: Algebra mode, line `|x|+|x|`. Copy all… → Plain text → Include answers gives `|x|+|x| = 2∣x∣`. The answer side uses U+2223, which is not an ASCII bar, and AsciiMath or plain-text destinations show it as a divides symbol or mojibake. The input side gives '|x|' correctly only because the user typed '|'.
- Verifier: Confirmed from the code: at MAX=200, push() shifts (panel.js:264), so past.length stays 200 and undoTo(200) stops after one undo. With one edit after a deletion, the toast's Undo removes only that edit, leaves the line deleted, and says 'Line restored'. The reviewer reproduced it with 205 steps. It needs a long session.
- Test: pending

### review-18: Answers can be used only with a mouse. `.res` is a plain div with a click handler: no tabindex, role or key handler. Keyboard and screen-rea

- Severity: low
- Where: `panel.js:202`
- Repro: Using only the keyboard (Tab or arrow keys) there is no way to reach an answer and put it into a line or copy it. Tab moves between math fields and the tex/× buttons and skips `.res` entirely. The old 'click to copy result' had the same gap, but the new insert feature is a headline feature of this release.
- Verifier: Confirmed: lineKey (panel.js:318-322) only depends on the line itself, the := lines above it, and all lines above only when it uses ans. Both SLOW_TIP (panel.js:379) and the shortcut guide (panel.html:84) say that editing any line above retries it, which is false for ordinary lines. CLAUDE.md describes the key correctly.
- Test: pending

### review-19: The Copy all dialog's Copy button carries aria-pressed="true" only to get the blue suggested-action style. Assistive technology announces it

- Severity: medium
- Where: `panel.html:113`
- Repro: Open Copy all… with a screen reader and Tab to Copy. It is announced as 'Copy, toggle button, pressed', which suggests a state that doesn't exist. The new dialog copies the existing #imp-ok pattern.
- Verifier: Confirmed: exportText (panel.js:550) and Shift+click (panel.js:206) pass CE's latex through unchanged, so answers carry \exponentialE and \imaginaryI. In the harness, e^x+e^x gives exact '2\exponentialE^{x}'. Standard LaTeX, KaTeX and MathJax don't define these macros, so pasting a 'LaTeX with answers' export breaks there. Input lines typed with the virtual keyboard's e key had this before, but answers now bring it in all the time in Algebra.
- Test: pending

### review-20: This is store-facing text, which you asked to leave until after testing, so it is not urgent. PRIVACY.md and store/listing.md now contradict — not reproduced

- Severity: low
- Where: `PRIVACY.md:10`
- Repro: PRIVACY.md:10 lists what is stored as lines, the Answers setting and Colors. The code now also saves angle, places, order, copyFmt and copyAns (panel.js persist()). PRIVACY.md:22-23 says 'clicking an answer' writes the clipboard. Clicking now inserts the answer, Shift+click copies, and the new Copy all… dialog also writes the clipboard but isn't listed. store/listing.md:48 says 'Click an answer to copy it.' store/listing.md:155 still names MathLive 0.110.0 and Compute Engine 0.133.0.
- Verifier: Duplicate of #15 (no-op Import toast) and #16 (200-step cap). Same root cause in undoToast/undoTo, and the same scenarios.
- Test: none needed

### review-21: With answers on, Import → Replace (and Append, line 528) leaves the imported lines unable to take typed characters. The pad is rebuilt with  — not reproduced

- Severity: low
- Where: `panel.js:524`
- Repro: 1. Set Answers to Arithmetic or Algebra, so the Rad/Deg / Decimals / order row is shown. 2. Open ☰ → Import LaTeX…, add a line in the textarea, click Replace. 3. Click line 1 and type. Arrows and Backspace still work, but no digits, letters or operators go in, so the line can't be edited. Lines added afterwards (and in one run the last imported line) can still be typed into. The same steps with Answers Off work, and Clear (setLines without a dialog) works.
- Verifier: Duplicate of #17 (the SLOW_TIP and panel.html:84 wording don't match lineKey).
- Test: none needed

### review-22: Undo puts the caret back where it was after the previous step, not on the line whose change was undone. undo() restores focus from the poppe — not reproduced

- Severity: low
- Where: `panel.js:297`
- Repro: Lines 1+1, 2+2, 3+3, 4+4. Click line 1 and type 7. Wait over 1 s, click line 4 and type 8. Press Ctrl+Z: line 4 goes back to 4+4 (correct), but the focus jumps to line 1. If the user keeps typing to fix line 4, the text goes into line 1, which may be scrolled out of view.
- Verifier: Duplicate of #3 for the substantive part: in Arithmetic, `a:=3` with a new LHS doesn't set ans. The other part, that an unanswered numeric line like `7` sets ans, matches the evident intent (lines Arithmetic evaluates), so it is only CLAUDE.md wording. That wording fix is folded into #3's suggested fix.
- Test: none needed

### review-23: The Undo button on a toast (line deleted, pad cleared, pad replaced) undoes every step made after that action as well, so edits made while t — not reproduced

- Severity: low
- Where: `panel.js:301`
- Repro: Lines 1+1, 2+2, 3+3. Click × on line 3, and the toast 'Line 3 deleted [Undo]' appears. Within 5 s, type +5 in line 1. Click Undo on the toast: line 3 comes back, but line 1 also goes back from 1+1+5 to 1+1, and the toast says only 'Line restored'. Pressing redo once re-deletes line 3, so there's no way to keep both the restored line and the typing.
- Verifier: Duplicate of #5 (the `places > 0` guard means Decimals 0 shows '≈ 0' instead of the documented scientific notation).
- Test: none needed

### review-24: Complex answers are not flagged `group`, so clicking one into another line inserts it without brackets and changes the value. Only Add, Subt

- Severity: low
- Where: `sandbox.js:131`
- Repro: Algebra or Arithmetic, line 1 `\sqrt{-4}+1` (answer = 1+2i), line 3 `2\cdot`. Focus line 3 and click line 1's exact answer. The line becomes `2\cdot1+2\imaginaryI` = 2+2i, not 2(1+2i) = 2+4i. Same for 1/(1+i), whose answer ½−½i went in unbracketed.
- Verifier: Reproduced in headless Chromium against the vendored MathLive: convertLatexToAsciiMath('\\vert x\\vert') returns U+2223 bars, while '|x|' and '\\left\\vert…\\right\\vert' return ASCII '|'. CE writes Abs answers as '2\vert x\vert', so plain-text export with answers puts the 'divides' sign in the output. toText() (panel.js:533-543) doesn't fix it.
- Test: pending

### review-25: When an Import Replace or Append changes nothing, change() drops the step (past.pop()) but still shows the undo toast, using the previous st — not reproduced

- Severity: low
- Where: `panel.js:294`
- Repro: Type 5 in line 2 (2+2 → 2+25) and wait over 1 s. Open ☰ → Import (it's prefilled with the current lines) and click Replace without changing anything, or Append with an empty box. The toast says 'Pad replaced [Undo]'. Clicking Undo turns 2+25 back into 2+2, and the toast says 'Pad restored'. Any redo history from before is also gone.
- Verifier: Missing keyboard access to answers is an enhancement request, not a defect in this change. The old click-to-copy had the same gap, and the guide's 'Click an answer' describes accurately what exists. The instructions exclude 'consider adding' items.
- Test: none needed

### review-26: Once the history is full (MAX 200), push() shifts out the oldest entry, so the index captured by undoToast stops pointing at the right step. — not reproduced

- Severity: low
- Where: `panel.js:264`
- Repro: After 200+ undo steps (a long session), click × on a non-empty line, type one character elsewhere, then click Undo on the toast. Only that character is undone, the deleted line stays gone, and the toast says 'Line restored'.
- Verifier: Nit. It repeats the existing convention (#imp-ok at panel.html:99 uses aria-pressed='true' for the accent style). It isn't a new kind of bug and nothing breaks.
- Test: none needed

### review-27: The 'took too long' tooltip (and the shortcut guide in panel.html) says editing a line above will retry it. lineKey (lines 318-322) only dep — not reproduced

- Severity: low
- Where: `panel.js:379`
- Repro: Arithmetic, lines `1+1` and `\gcd(2^{300000}-1,3^{300000}-1)`. Line 2 shows 'took too long'. Following the tooltip, edit line 1 to 1+1+1: line 2 keeps showing 'took too long' and is never retried.
- Verifier: It's accurate that PRIVACY.md and store/listing.md are now stale. But the user explicitly asked to test first, before any work on preparing the store submission, and CLAUDE.md classes PRIVACY.md and store/ as store-listing material. The privacy policy that is live (PRIVACY.md on main) still matches the shipped 1.2.0, so nothing is wrong in production today. It should be tracked for the store-prep pass after the user has tested, not fixed now.
- Test: none needed

## QA round 1 (wf_8ece76cf-167)

### r1-1: Answer options: Decimals

- Severity: low · source: answers-1
- Repro: Turn on Arithmetic (or Algebra) and set Decimals to 0 or 2. Add lines \sqrt{-2}, \frac{i}{3}, \sqrt{2}i, i\pi, e^{1000}, 1000000!.
- Expected: The decimal is rounded to the chosen places, as it is for \sqrt{2} (≈1.41) and for complex numbers with a real part (1+\sqrt{-2} gives ≈1.00+1.41i). The CHANGELOG promises 'decimal places (auto, 0–6, 8 or 10)'.
- Found: Answers that are purely imaginary ignore the setting. At 2 places, √−2 gives ≈1.4142135623730950488i, i/3 gives ≈0.333333333333333333333i and iπ gives ≈3.14159265358979323846i. Values too big for a double also keep 21 digits at every setting, including 0 places: e^{1000} gives ≈1.97007111401704699389·10^434 and 1000000! gives ≈8.26393168833124006238·10^5565708. Cause in sandbox.js decimal(): a real part of 0 (`x === 0 && …`) and `!Number.isFinite(x)` both return approxV.latex without rounding.
- Verifier: Reproduced at Decimals 0 and 2: √−2, i/3, √2·i and iπ keep about 20 digits, and e^{1000} and 1000000! keep 21 significant digits even at 0 places, while √2 and 1+√−2 round correctly. Cause: sandbox.js:100 returns approxV.latex unrounded when `x === 0 && latex !== '0'` (x = |re|, so every purely imaginary value matches; the check was meant for values that underflow a double) and when `!Number.isFinite(x)` (values beyond a double; the bignum is in approxV.json.num, e.g. '1.97007111401704699389e+434'). The answers are still correct; only the promised rounding is missing.
- Test: pending

### r1-2: Reuse answers from the keyboard (Tab to an answer, then Enter)

- Severity: low · source: answers-2
- Repro: Pad: line 1 '3-5' (answer −2), line 2 '2\cdot'. Click line 2 and press End, so the caret is after the ·. Press Shift+Tab until the focus is on line 1's answer: it takes 4 presses. The 1st press stays in line 2 and moves its caret to position 0; the next ones go to ×, tex, then the answer. Press Enter.
- Expected: −2 goes into line 2 at the cursor where the user left it, giving 2·(−2) = −4. The CHANGELOG says 'put it into the line you were editing, at the cursor'.
- Found: Line 2 becomes '\left(-2\right)2\cdot' (shown as (−2)2·), and the line gets the can't read marker. The first Shift+Tab moved the caret to the start of the line before focus left it (position 2 became 0), so the answer goes in at the front. Shift+Tab is the only keyboard way to reach an earlier line's answer, because going forward with Tab passes through the next line's field and makes that the target. Clicking with the mouse works correctly.
- Verifier: Reproduced with real keys: line 2 '2+2' with the caret at the end (pos 3). The first Shift+Tab is handled by MathLive inside the field and moves the caret to pos 0. Later presses leave the field, Enter on line 1's answer runs useAnswer (panel.js:251-258), and it inserts at the current caret, giving '22+2' (or '(−2)2·' in the tester's case). makeRow (panel.js:176-178, 189-190) lets Tab through, but nothing remembers where the caret was before the Tab moved it. Clicking with the mouse works.
- Test: pending

### r1-3: Typing powers (^) — not reproduced

- Severity: low · source: answers-3
- Repro: With answers on, type 2^10-1 on a line, or 10^12, the way a user would.
- Expected: 2^{10}−1 = 1023 and 10^{12}. The guide and store text say '^' makes a superscript.
- Found: MathLive's smartSuperscript (true by default; panel.js leaves it on) leaves the superscript after the first digit. 2^10-1 becomes 2¹0−1 and the answer shows = −1. 10^12 becomes 10¹2 and shows = 20. The display matches the answer, but this is a trap for calculator-style input. It is stock MathLive behaviour and could be turned off with mf.smartSuperscript = false.
- Verifier: Reproduced (2^10-1 shows 2¹0−1 = −1, and 10^12 shows 10¹2 = 20), but this is not a defect. It is MathLive's documented smartSuperscript: after a digit in an empty superscript, the caret leaves the superscript. The display shows exactly what is computed, and the guide's '^ = superscript' is still true. The suggested fix would make things worse: with smartSuperscript off, the common case x^2+1 (typed in the same test and shown correctly as x²+1) would put '+1' in the exponent. Multi-digit exponents need ^{…} or → to leave the slot.
- Test: none needed

### r1-4: Answer display: the answer repeats the line for typed input

- Severity: low · source: answers-4
- Repro: With Arithmetic on, type 1/3 and, on another line, sqrt2 using the keys.
- Expected: The same as importing \frac{1}{3} or \sqrt{2}: no exact part that only repeats the line (imported, they show '= 0.3̅' and '≈ 1.414…').
- Found: Typed input shows '= 1/3 = 0.3̅' and '= √2 ≈ 1.414…'. MathLive's value is \frac13 or \sqrt2, which same() in sandbox.js doesn't match against Compute Engine's \frac{1}{3} or \sqrt{2}. So the repeat is only hidden for pasted or imported LaTeX, not for what users type. A related case: \int_0^1\sin(\frac{1}{x})\,dx gets the unevaluated integral back as '= ∫…'.
- Verifier: Reproduced with real keys: typing 1/3 stores '\frac13' and shows '= 1/3 = 0.3̅'; typing sqrt2 stores '\sqrt2' and shows '= √2 ≈ 1.414…'. Imported \frac{1}{3} hides the repeat. Cause: same() at sandbox.js:129 compares text. MathLive writes single-digit arguments without braces, so CE's '\frac{1}{3}' never matches src, and the e.latex branch also requires e.latex === src. This is cosmetic, but it affects the most common input path.
- Test: pending

### r1-5: Answer display: ≈ on exact complex values

- Severity: low · source: answers-5
- Repro: Add the lines \sqrt{-4}, e^{i\frac{\pi}{2}}, (1+i)^2.
- Expected: CLAUDE.md says ≈ is used only when a value is rounded, so an exact 2i or i gets no '≈ 2.0i'.
- Found: '= 2i ≈ 2.0i', '= i ≈ 1.0i', '= 2i ≈ 2.0i'. A second part that adds nothing and is marked as approximate.
- Verifier: Reproduced: √−4 → '= 2i ≈ 2.0i', e^{iπ/2} → '= i ≈ 1.0i', (1+i)^2 → '= 2i ≈ 2.0i'. The store listing (line 73) and CLAUDE.md say ≈ is used only when a value is rounded. Cause: sandbox.js:136-138. For an exact Complex literal, approxV.latex ('2.0\imaginaryI') differs from exactL ('2\imaginaryI'), and decimal() returns it with exact:false (line 100 in auto mode, line 102 otherwise), so a redundant ≈ part is added.
- Test: pending

### r1-6: Answers: precision beyond 21 digits

- Severity: low · source: answers-6
- Repro: Add the line 10^{20}+0.5 (Decimals auto or 2).
- Expected: 100000000000000000000.5, or a value marked ≈.
- Found: '= 100000000000000000000.0'. The .5 is lost and the answer is shown with '=' as if exact. At 0 places it gives ≈1·10^20. This is Compute Engine's 21-digit precision, shown as an exact answer.
- Verifier: Reproduced: 10^{20}+0.5 shows '= 100000000000000000000.0' at auto and 2 places, a wrong value presented as exact. Cause: ce.precision is 21 (confirmed in Node). The decimal literal 0.5 makes the sum a float Real rounded to 21 significant digits, and evalLine (sandbox.js:131, with the rounding rule at 142 skipped because '.0' fits in the places) shows that Real as the exact '=' part. This is a contrived input, but the '=' claims an exactness the engine doesn't have.
- Test: pending

### r1-7: Arithmetic mode: symbolic answers through := — not reproduced

- Severity: low · source: answers-7
- Repro: In Arithmetic: (a) 'x\coloneq 2' then '\frac{d}{dx}x^3'. (b) 'y\coloneq t+1' then '3y'.
- Expected: Arithmetic answers only numeric lines ('Lines with unknowns like 2x+3x are left for you'), or for (a) a consistent 12.
- Found: (a) '= 3x² ≈ 12': a symbolic exact part, and an approximation that is really exact. (b) '= 3(t+1)': algebra done in Arithmetic mode, because y counts as known even though its value contains an unknown. The same happens in the sample-style 'a·b' with b := x+1, giving 4(x+1).
- Verifier: Reproduced ('= 3x² ≈ 12' after x := 2, and '= 3(t+1)' after y := t+1), but it follows the documented rules. CLAUDE.md (Behaviour decisions) says Arithmetic checks expr.unknowns before evaluating, 'so letters assigned earlier with := count as known'. Store listing line 70: 'Letters you give a value with := … count as known on the lines below.' So 3y with y := t+1 is answered by design, and it is substitution, not simplification. Case (a), differentiating with respect to a variable already set to a number, is unusual input. 3x² is correct, and 12 is its value at x = 2; only the ≈ on an integer is imprecise.
- Test: none needed

### r1-8: Very large answers

- Severity: low · source: answers-8
- Repro: Add the line \sqrt{2^{2001}}, or \sqrt{2^{100001}}.
- Expected: CHANGELOG 1.3.0: 'Very large or very small answers are shown in scientific notation instead of as thousands of digits.'
- Found: The exact part is a radical over the whole integer: about 600 digits for 2^2001, and about 30,000 digits (284,609 px wide, scrolling sideways) for 2^100001, which also has no decimal part. MAX_EXACT_NUMBER in sandbox.js only applies to plain number literals.
- Verifier: Reproduced: \sqrt{2^{2001}} shows a radical over a 603-digit integer, and \sqrt{2^{100001}} shows about 30,000 digits (.res scrollWidth 284609) with no decimal. \sqrt{100!} does the same at 158 digits. This contradicts the 1.3.0 CHANGELOG line 'Very large or very small answers are shown in scientific notation instead of as thousands of digits.' Cause: sandbox.js:132 only applies MAX_EXACT_NUMBER when val.isNumberLiteral, and these values are Sqrt expressions.
- Test: pending

### r1-9: Reuse answers: where a click counts

- Severity: low · source: answers-9
- Repro: Pad '1+1' and '2+2'. Click into line 1, then click empty space at the far right of line 2's answer row, about 390 px from the '= 4'.
- Expected: Only a click on the answer itself inserts it.
- Found: The whole width of .res (428 px) inserts the answer and shows a pointer cursor, so line 1 became '1+14'. Clicking empty space under a line easily inserts by accident (Ctrl+Z undoes it).
- Verifier: Reproduced: pad '1+1', '2+2'. Click into line 1, then click empty space 20 px from the right edge of line 2's answer row (.res 428 px wide, the '= 4' part 26 px), and line 1 becomes '1+14'. In the side-panel layout (panel.css:103, max-width 640px) .res is a full-width row under each line. The click listener is on the whole .res (panel.js:219), pick() falls back to parts[0] when the click isn't on a .part (panel.js:215), and panel.css:138 gives the whole row a pointer cursor. A click in the blank space under a line, which looks like a way to focus that line, silently edits another line (Ctrl+Z undoes it). The docs say 'Click an answer'.
- Test: pending

### r1-10: Esc Esc clear vs MathLive's in-line menu

- Severity: high · source: editing-1
- Repro: Any pad. Click into line 1, then click the ☰ icon that appears at the right end of the line, or right-click the line. MathLive's menu opens (Insert Matrix, Insert, Mode, Font Style, Color, Background, Cut, Copy, Paste, Select All). Press Esc to close it, then press Esc again.
- Expected: CLAUDE.md says Esc is not intercepted "when a dialog/menu is open", so Esc should close MathLive's menu and leave the pad alone.
- Found: The first Esc leaves the menu open and shows the toast "Press Esc again to clear the pad". The second Esc clears the whole pad ("Pad cleared / Undo"). Reproduced on a clean restart, both with right-click and with the ☰ toggle. Cause: the window keydown capture handler in panel.js (around lines 609-620) only checks `dialog[open]` and the app's own ☰ menu (`menu.hidden`). MathLive's `menu.ui-menu-container` lives in the math-field's shadow root, so the handler never sees it.
- Verifier: Reproduced on a clean profile: real right-click, then Esc. The menu stayed open, the toast 'Press Esc again to clear the pad' appeared, and a second Esc cleared the pad. Screenshot: [scratch file] Cause: the window keydown capture handler at panel.js:609-620 runs before MathLive's menu and calls preventDefault/stopPropagation on Esc. It only checks dialog[open] and the app's own menu (line 611). MathLive's menu is .ui-menu-container inside the math-field's open shadow root, which the handler never checks. Because the first Esc can never close the menu, pressing Esc a second time is the natural thing to do, and that wipes the pad. It also triggers editing-2. The same blind spot affects the row keydown handler at panel.js:177-187: Enter inside MathLive's menu adds a pad line instead of choosing the menu item, and Backspace on an empty line deletes the row while its menu is open.
- Test: pending

### r1-11: Console errors: MathLive menu broken after the pad is rebuilt while it is open

- Severity: medium · source: editing-2
- Repro: Import three lines 1, 2, 3 (☰ > Import LaTeX… > Replace pad). Right-click line 1; MathLive's menu opens. Press Ctrl+Z: the pad goes back to its previous lines and the menu disappears. Right-click any line, or click its ☰ icon. Esc Esc with the menu open (see the previous failure) causes the same thing.
- Expected: MathLive's menu opens normally and the console stays clean.
- Found: No menu appears on any line for the rest of the session. Every attempt throws an uncaught "InvalidStateError: Failed to execute 'showPopover' on 'HTMLElement': Invalid on disconnected popover elements." at qs.show (vendor/mathlive/mathlive.min.js:3221). The only fix is reopening the panel. If the menu is closed before a line is deleted, it keeps working, so the trigger is the pad removing the field (clear, undo/redo or import via setLines) while its menu is open. Global Ctrl+Z, Ctrl+Y and Esc all fire while that menu is open.
- Verifier: Reproduced: open MathLive's menu on line 1, press Ctrl+Z (or Esc Esc). After that, every right-click or ☰ throws 'InvalidStateError: Failed to execute showPopover … disconnected popover' at mathlive.min.js:3221 and no menu appears. Worse, document.body.style.overflow stays 'hidden', so the panel can no longer be scrolled: a wheel scroll on a 40-line pad left scrollY at 0, against 600 after a fresh reload. Both last until the panel is reopened. Cause: MathLive's menu uses one shared Scrim (Te). Its open() returns early when state !== 'closed', and it sets body overflow:hidden. The pad's global shortcuts at panel.js:609-631 (Esc Esc → clearAll → setLines, and Ctrl+Z/Ctrl+Y → hist.restore → setLines at line 288) remove the math field that hosts the open menu. The scrim is never closed: its state stays 'open', its element is detached and the overflow is never restored. Closing the menu first (click elsewhere) and then deleting lines is fine.
- Test: pending

### r1-12: On-screen keyboard: Keyboard button

- Severity: medium · source: editing-3
- Repro: Pad with 5 lines (1-5, 7+8, empty, 2+2, 3+3), on-screen keyboard hidden. Click into line 1 (caret at its end), then click the "Keyboard" button in the header. Press 9 on the on-screen keyboard.
- Expected: The keyboard types into line 1, the line being edited.
- Found: The caret jumps to the last line, and the 9 goes there: line 5 "3+3" becomes "3+39" (= 42) and line 1 is unchanged. It happens every time, because the only way to open the keyboard is this button. Cause: the bKbd click handler in panel.js checks `document.activeElement`, which is the button by the time of the click, so it always falls back to `fields().at(-1)`. `lastField` would give the right line.
- Verifier: Reproduced: caret in line 1 (pos 3/3), click the Keyboard button, and focus jumps to the last line ('line 4 pos 3/3'). VK 9 then makes '3+39'. Cause: panel.js:503 tests document.activeElement, but the click has already focused the #btn-kbd button, so it always falls back to fields().at(-1). The Keyboard button is the only way to open the on-screen keyboard.
- Test: pending

### r1-13: Inserting answers from the keyboard (Tab to an answer, then Enter)

- Severity: medium · source: editing-4
- Repro: Arithmetic mode, pad: 1+1, 2+2, 3+3, 4+4, 5\cdot. Click into line 5. Press Shift+Tab until line 2's answer "= 4" has focus (this passes through the math fields of lines 4 and 3). Press Enter.
- Expected: The shortcut guide says "Click an answer: Put it in the line you were editing (or a new line)… From the keyboard: Tab to it, then Enter", so 4 should go into line 5.
- Found: Line 3, which was only tabbed through, becomes "43+3" (= 46). The 4 goes in at the caret, which Shift+Tab had left at the start of line 3, so a line's value changes silently. Line 5 is unchanged. Cause: the pad's focusin listener sets `lastField` for every math field that gets focus, including ones passed through with Tab or Shift+Tab. With the keyboard you can only reach the answer of the line just above the one you are editing. Ctrl+Z does undo it.
- Verifier: Reproduced with real Shift+Tab: from line 5 ('5\cdot'), Shift+Tab to line 2's answer and press Enter, and line 3 becomes '43+3' (=46) while line 5 is unchanged. Cause: panel.js:153 sets lastField on every focusin of a math field, including fields that Tab/Shift+Tab only passes through. So the guide's 'From the keyboard: Tab to it, then Enter' puts the answer into whichever line was tabbed through last, and a line the user never edited changes.
- Test: pending

### r1-14: Undo toast: focus after clicking Undo

- Severity: low · source: editing-5
- Repro: Delete a line that has content with × (or clear with Esc Esc, or Import > Replace pad). Click "Undo" in the toast. Start typing.
- Expected: The restored line gets the caret, as it does when you press Ctrl+Z ("active: line N").
- Found: The pad is restored correctly, but no line has focus (document.activeElement is BODY), so typing does nothing until you click a line. A focus trace shows only focusin on the toast BUTTON, then focusout to null, and never a focusin on a math field. Cause: restore() calls mf.focus(), which MathLive carries out later. toast(done) then replaces the toast's textContent and removes the focused Undo button, and the pending focus is lost. Probe: focus a button, call mf.focus(), remove the button, and activeElement ends up as BODY.
- Verifier: Reproduced with real clicks, both after × delete → Undo and after Esc Esc → Undo: the pad is restored but activeElement is BODY and typing goes nowhere. Cause: MathLive's onFocus records the active element (the Undo button) and finishes the focus in a setTimeout, which it abandons if the active element has changed. Here undoToast's run (panel.js:324) calls hist.undo() and then mf.focus(), and only then calls toast(done). toast() replaces toastEl.textContent (panel.js:125), which removes the focused button, so activeElement becomes BODY and MathLive drops the focus. A probe confirmed it: mf.focus() and then removing the focused button leaves BODY; keeping the button lets the field take focus.
- Test: pending

### r1-15: On-screen keyboard: return and backspace keys

- Severity: low · source: editing-6
- Repro: Open the on-screen keyboard with the Keyboard button. With the caret in a line, press the ↵ key at the bottom right. Then empty a line with the keyboard's ⌫ key and press ⌫ once more.
- Expected: On the physical keyboard, Enter adds a line below and Backspace on an empty line deletes it (shortcut guide, store listing). The matching on-screen keys would be expected to do the same, or at least do something.
- Found: ↵ (performWithFeedback(commit)) does nothing: same line count, no new line. ⌫ on an empty line does nothing. Someone using only the on-screen keyboard can add lines only with "+ add line" and delete them only with ×.
- Verifier: Reproduced by clicking the on-screen keys. ↵ (data-command '"performWithFeedback(commit)"') does nothing: same lines, no new line. ⌫ ('"performWithFeedback(deleteBackward)"') on an empty line does nothing either, and the empty line stays. No doc promises this explicitly; the guide and listing describe the physical Enter/Backspace. Still, a visible ↵ key that does nothing in a line-based pad looks broken. Cause: the window click-capture handler at panel.js:602-607 only redirects the VK's undo/redo, and MathLive's commit has no meaning in this pad.
- Test: pending

## QA round 2 (wf_533db979-573)

### r2-1: Other common answers unchanged from 1.2.0

- Severity: unrated · source: retest:regressions
- Found: Compared the 1.2.0 zip engine against 1.3.0 in Node and confirmed in the panel (lost.png, floats.png). Four regressions. (1) Percent lines get no answer: 3\% and 10\% were '= 0.03' and '= 0.1', now blank. (2) The exact form is dropped and only the decimal shown for 7\div 2 (was = 7/2 = 3.5), 1\div 3, 3\cdot\frac{1}{4}, \frac{1}{4}\cdot 3, 4\cdot\frac{1}{3}, \frac{1}{3}\cdot 2, \frac{1}{7}\cdot 2 (was = 2/7) and \pi\cdot 2 (was = 2π ≈ 6.283…). Cause for (1) and (2): the 1.3.0 echo check in sandbox.js evalLine, `typed = ce.parse(src, { canonical: false }).latex` around lines 140–143. CE 0.161 already folds these in non-canonical output ('7\div 2' → '\frac{7}{2}', '\pi\cdot 2' → '2\pi', '3\%' → '0.03'), so the real answer is taken for an echo of the input. (3) Decimal arithmetic with a whole-number result now shows a trailing .0: 1.5·2 = 3.0, 2.5+0.5 = 3.0, 0.2·5 = 1.0, 25%·80 = 20.0, 50%·200 = 100.0 (1.2.0 showed 3, 3, 1, 20, 100). (4) 2^{0.5} lost '= √2' and now shows only ≈1.414…. Both (3) and (4) come from how CE 0.161 evaluates.
- Test: pending

### r2-2: Break 1 (new code): stale remembered caret after a mouse click inside the already-focused line

- Severity: unrated · source: retest:fixes
- Found: Pad 3+4, 2+5+6. Click line 2, End, then one Shift+Tab: MathLive moves the caret to the line start and focus stays in the line. Click just after '5' (pos 3), then click line 1's answer: the result is 2+5+67, expected 2+57+6. The keyboard route fails the same way (Shift+Tab out to the answer, Enter: 2+5+67). The reverse also fails: Home, Tab (caret jumps to the end), click after '2', click the answer gives 72+5+6, expected 27+5+6. Cause: caretBeforeTab is only cleared on a non-Tab focusin or a non-Tab keydown (panel.js:155-160, 197). A pointerdown in a field that already has focus fires neither. Scripts: refix/t-stale.js (S1), refix/t-stale2.js.
- Test: pending

### r2-3: Break 2 (new code): an answer goes to the wrong line after you Tab into a line and then click inside it

- Severity: unrated · source: retest:fixes
- Found: Pad 1+1, 2\cdot, 5+5. Click line 1, End. Tab three times into line 2 (Tab doesn't count as editing). Click inside line 2 with the mouse, then click line 3's answer: the result is 1+110 in line 1. The user just clicked into line 2, which is where it should have gone. Same cause as Break 1: no focusin, so lastField isn't updated. Suggested fix: in the window pointerdown capture listener (panel.js:156), when the target is a row's math-field, set lastField to it and clear its caretBeforeTab. Script: refix/t-stale3.js.
- Test: pending

### r2-4: Break 3 (fix for item 10 incomplete): the on-screen undo/redo buttons rebuild the pad under an open line menu

- Severity: unrated · source: retest:fixes
- Found: Real clicks only. Pad 1+1, 2+2. Click line 1, End, Enter (adds a line). Open the on-screen keyboard and open the menu in the new line 2. Tap the keyboard's undo: undo removes the line, so hist.restore calls setLines and rebuilds the pad while the menu is open. Hiding the keyboard then throws 'TypeError: Cannot read properties of undefined (reading classList) at onDismiss'. After that the menu never opens on any line ('InvalidStateError: showPopover … disconnected popover' on each try), and the page no longer scrolls (body left with inline overflow:hidden; wheel scrollY stays 0 with 835px available). Cause: the window click capture for undo/redo (panel.js:622-627) has no lineMenuOpen() check, unlike the Ctrl+Z path. Script: refix/t-vkundo-menu.js, then refix/t-scrollchk.js.
- Test: pending

### r2-5: Break 4 (also in 1.2.0, but it causes the item-10 symptoms): the line menu doesn't close when you click elsewhere

- Severity: unrated · source: retest:fixes
- Found: Open the menu in line 1, then click line 2: line 2 takes focus and the menu stays open. A plain MathLive page closes it. Esc then does nothing to the menu (it enters LaTeX mode in line 2), and clicking the header doesn't close it. While it is open, lineMenuOpen() keeps Esc Esc, Ctrl+Z, Ctrl+/ and the on-screen ↵/⌫ disabled for the whole pad. Next, ☰ → Import… → Replace (real clicks) rebuilds the pad under the menu. The toast says 'Nothing changed', but the result is the same InvalidStateError on every later open, the page doesn't scroll, and body keeps 'overflow:hidden; margin-right:15px'. Cause: panel.css's opacity 0 / .6 on math-field::part(menu-toggle) makes the toggle a stacking context. That traps MathLive's full-viewport scrim (a fixed div with z-index 10099, inside .ML__menu-toggle), so the following rows sit above it. Forcing opacity:1 in the live page made a click on line 2 close the menu as on the plain page. The 1.2.0 zip (MathLive 0.110) keeps the menu open the same way. Scripts: refix/t-hit4.js, refix/t-120.js, refix/t-import-break.js.
- Test: pending

### r2-6: Break 5 (rounding): huge sums the engine writes in scientific notation still get '=' and aren't rounded

- Severity: unrated · source: retest:fixes
- Found: In the panel at both auto and 2 places: 10^{30}+0.5 = 1.0·10^{30}, 1.5+10^{25} = 1.0·10^{25}, 10^{100}+0.5 = 1.0·10^{100}, and 2^{100}+0.5 = 1.2676506002282294015·10^{30} (20 significant digits even at 2 places). In the engine harness, 10^{400}+0.5 = 1.0·10^{400}. These values are rounded, so they need '≈' and should follow Decimals. Cause: the float test in sandbox.js:158 (/^-?\d+\.\d+$/) misses the engine's '…\cdot10^{n}' form, so the fix for item 6 never runs.
- Test: pending

### r2-7: Break 6 (rounding): e^{-1000} and imaginary values beyond a double ignore Decimals

- Severity: unrated · source: retest:fixes
- Found: At Decimals 0 or 2, e^{-1000} still shows ≈5.075958897549456765 29·10^{-435}. The 'beyond a double' regex at sandbox.js:101 only takes positive exponents, and the underflow branch at line 110 returns the engine's own digits. i·e^{1000} shows ≈197 007 111 401 704 699 389·10^{414} i, and \sqrt{-2}\cdot10^{400} shows ≈1 414 213 562 373 095 048 801 689·10^{376} i, both unrounded with a 22–25 digit mantissa (the branch requires approxV.im === 0). At auto, i·e^{1000} also shows a stray '.0' (…389.0·10^{414} i).
- Test: pending

### r2-8: Break 7 (minor): rapid ↵ leaves the caret on the first new line, not the last

- Severity: unrated · source: retest:fixes
- Found: A new math-field takes about 60 ms to get focus (focusin about 60 ms after the press). Four on-screen ↵ presses 30 ms apart, or four physical Enters (as with a held, repeating Enter), each insert after the original line, so the caret ends on line 2. The next typed character goes there. At 150 ms intervals it is correct (line 5). The physical-Enter case has the same pattern in 1.2.0's code; the on-screen ↵ is new. Rapid ⌫ on empty lines drops the presses that land in the focus gap (activeElement is body) but makes no wrong edits. Scripts: refix/t-13b.js, refix/t-13c.js.
- Test: pending

### r2-9: Break 8 (minor): on-screen ↵ and ⌫ act on press, so dragging off doesn't cancel them

- Severity: unrated · source: retest:fixes
- Found: Pressing 9 and dragging off (or onto 7) inserts nothing, as with every MathLive key. Pressing ↵ and dragging off still adds a line, ↵ dragged onto 9 adds a line, and ⌫ on an empty line dragged off still deletes it. This is because the panel acts at pointerdown (panel.js:631-639). Ordinary clicks work normally afterwards. With a line menu open, the on-screen ↵ and ⌫-on-empty do nothing (no new line), which is consistent with 'pad shortcuts wait'. Script: refix/t-drag.js.
- Test: pending

## QA round 3 (wf_760dda0a-eea)

### r3-1: Regression vs 1.2.0: focus after ☰ → Clear pad

- Severity: unrated · source: retest:regressions
- Found: Found during this pass, outside the listed items. In 1.2.0 (same steps on port 9472), ☰ → Clear pad left the caret in the new empty line 1. In 1.3.0 document.activeElement is BODY afterwards: focus events show btn-clear losing focus to null and the new math-field never receiving focusin, so typing goes nowhere until you click a line. Reproduced with real mouse clicks and with keyboard (☰, ArrowUp, Enter). Esc Esc still focuses line 1, and the toast's Undo still focuses the restored line. Likely cause: MathLive 0.111 math-field focus() is deferred (in my probe it was not focused synchronously, and was 50 ms later), and the menu-close path loses it. Minor.
- Test: pending

### r3-2: Engine comparison: changes outside the expected list

- Severity: unrated · source: retest:regressions
- Found: 1. (180/π)·arcsin(0.5) in Rad. 1.2.0: = 30. 1.3.0: = 94.247779607693797153 9/π ≈ 30. The '=' part has a rounded float numerator (30π = 94.2477796076937971538793…), so an '=' is shown on a value that isn't exact. This is the only changed answer I'd call wrong. With \frac{1}{2} instead of 0.5 it is still = 30. 2. Same Compute Engine 0.161 float-argument change as the known 2^{0.5} case. Each answer is right but the exact form is gone: - arcsin(0.5): 1.2.0 = π/6 ≈ …; 1.3.0 ≈ 0.523598775598298873077 only. - arccos(0.5): 1.2.0 = π/3; 1.3.0 ≈ only. - e^{0.5}: 1.2.0 = √e; 1.3.0 ≈ only. - 1/3+0.5: 1.2.0 = 0.8̅3; 1.3.0 ≈ 0.833333333333333333333. - 2/0.3: 1.2.0 = 6.̅6; 1.3.0 ≈ 6.66666666666666666667. 3. Cosmetic: 0^0 changed from '= NaN' to '= Indeterminate ≈ NaN'. The '≈ NaN' part is meaningless. 4. Cosmetic: \frac{-3}{4} now shows '= −3/4 = −0.75', where 1.2.0 showed '= −0.75'. Also still present in both versions, so not regressions: e, e^2 and \ln2 (typed) echo themselves ('= e²', '= ln(2)'), so the CHANGELOG line 'An answer no longer just repeats what you typed' does not cover them.
- Test: pending

### r3-3: 7. Rapid ↵ / Enter: caret ends on the last new line and the next character goes there

- Severity: unrated · source: retest:fixes
- Found: Physical Enter passes: 5 Enters 0 or 30 ms apart, or 6 autorepeat keydowns, end with focus on line 6 or 7 of 7 or 8, and a character typed 120 ms or more later lands there. On-screen ↵ fails at realistic press lengths. With 10 ms holds and 30 ms gaps it works (t7d.js, t7e.js), but with real-length presses (t7h.js) it does not: a double-tap with holds of 60–100 ms and gaps of 20–40 ms, then VK 5, gives ["1+1","5","","2+2"] with the caret on line 2; with gaps of 70 ms or more it gives the correct ["1+1","","5","2+2"]. t7g.js shows how it happens. pointerdown records the row that has focus (vkPress.row is still the old line). The new line's deferred focus lands about 60 ms after the previous release, during the next press, and its focusin clears pendingRow. At pointerup lineAt(p.row) then falls back to the stale row, so the next line is inserted in the middle. In one trace the 5th line went in after line 2 and focus ended on L3 of L2–L6. Suggested fix: at pointerup use the row that has focus then (lineAt(activeRow ?? p.row)), not the one recorded at pointerdown. Separately, and the same in 1.2.0 (t120.js): a character typed within about 60 ms after a physical Enter goes into the previous line (1+1 then 7 becomes 1+17).
- Test: pending

### r3-4: Break: answer goes to an old caret after typing with the on-screen keyboard

- Severity: unrated · source: retest:fixes
- Found: tstale.js, pad 3+4 / 2+5+6, on-screen keyboard open. Clicked after the 2 (pos 1), pressed Tab (caret moves to the end inside the line, and caretBeforeTab is saved as pos 1), tapped VK 9 → 2+5+69 with the caret at the end, then clicked line 1's answer. Result: 27+5+69, expected 2+5+697. Moving with the VK ← key, then 9 (2+59+6), then the answer gives 27+59+6. Tab out of the line, Shift+Tab back, VK 9 does the same. Cause: caretBeforeTab is only cleared by a non-Tab keydown or a pointerdown inside the math-field, and on-screen keys produce neither, so useAnswer puts back the stale pre-Tab caret. Clearing it on the field's input or selection-change would fix it.
- Test: pending

### r3-5: Break: complex answers don't follow the float and rounding rules

- Severity: unrated · source: retest:fixes
- Found: Engine and panel (tc.js, cmp.sh). \sqrt{-2.5} shows =1.581138830084189666i at every Decimals setting, while \sqrt{2.5} shows ≈ and is rounded. 0.1i+0.2i shows =0.30000000000000004i. 10^{20}i+0.5i shows =100000000000000000000i with =, while 10^{20}+0.5 gets ≈. 0.5+0.25i and 3\%·i are never rounded (=0.5+0.25i at Decimals 0). At fixed Decimals, complex rationals round half-to-even and not half away from zero: \frac18 i ≈0.12i (1/8 gives ≈0.13), \frac58 i ≈0.62i, \frac12 i ≈0 at Decimals 0 (½ gives ≈1), \frac52 i ≈2i at Decimals 0. A small imaginary value that rounds to 0 drops the i and isn't written in scientific notation: \frac{1}{20}i ≈0.0 at Decimals 1 and \frac{1}{200}i ≈0.00 at Decimals 2, while 3% gives ≈3.0·10^{-2}. At auto, exact complex decimals get ≈ (\frac18 i ≈0.125i, \frac12 i ≈0.5i), which is the same in 1.2.0. The = on long complex floats is also the same in 1.2.0; the Decimals rounding is new in 1.3.0.
- Test: pending

### r3-6: Break: on-screen ⌫ just after ↵ is dropped

- Severity: unrated · source: retest:fixes
- Found: t8a.js. Physical Enter then Backspace 0–100 ms later removes the new line, back to [1+1, 2+2]. On-screen ↵ then ⌫ 0–40 ms later (also with presses held 50/80 ms) leaves ["1+1","","2+2"] with nothing deleted anywhere, so the ⌫ is lost; at 100 ms it works. Physical Enter then on-screen ⌫ 20 ms later is lost the same way. The cause is that the ⌫ pointerdown handler checks the line that still has the focus (non-empty), not lineAt(). Not destructive, but it behaves differently from physical Backspace.
- Test: pending

### r3-7: Break: fast keys after physical Backspace/Enter (also in 1.2.0)

- Severity: unrated · source: retest:fixes
- Found: t-eb.js and t120.js. After Backspace deletes an empty line, about 60 ms pass before the previous line has the focus. Any key in that window is lost: Backspace+Backspace, Backspace+Enter and Backspace+'9' at 0, 20 or 50 ms all lose the second key; at 120 ms they work. Enter followed by a character within 60 ms puts the character in the previous line. 1.2.0 does exactly the same (Enter, 0 or 30 ms, '7' gives 1+17; Backspace, 0 or 30 ms, '9' loses the 9), so this is not a regression. It is reachable for fast typists.
- Test: pending

### r3-8: Break: exactly 10^{-70} gets ≈

- Severity: unrated · source: retest:fixes
- Found: Panel (tc.js): 10^{-30} shows = 1/(1·10^{30}) =1·10^{-30}, but 10^{-70} shows = 1/(1·10^{70}) ≈1·10^{-70}, although the decimal is exact. Cause: exactPlaces() returns -1 when the denominator has more than 60 digits. 1.2.0 showed no decimal for these.
- Test: pending

### r3-9: Cosmetic: the menu toggle's own hover color never applies

- Severity: unrated · source: retest:fixes
- Found: t4b.js. The rule math-field::part(menu-toggle):hover{color:var(--fg)} (specificity 0,1,2) loses to .row:hover math-field::part(menu-toggle) (0,2,2). With :hover matching on the toggle, its color stays accent at 60%; a test rule with .row:hover in front applied fine. The toggle is still visible, on MathLive's gray hover background.
- Test: pending

### r3-10: Cosmetic: odd exact forms and repeats (mostly Compute Engine 0.161 or already in 1.2.0)

- Severity: unrated · source: retest:fixes
- Found: From the engine and panel: \sqrt{-2}\cdot10^{400} gives =1·10^{400}√2 i (1.2.0: 10^{400}√−2); 10^{400} gives =1·10^{400} (1.2.0 showed nothing); 10^{-30} gives =1/(1·10^{30}); 1-10^{-25} has denominator 1·10^{25}; 1.5·10^{30}i gives =15·10^{29} i and 2·1.97·10^{434}i gives =394·10^{432} i (not normalized, same in 1.2.0); (-1)^{0.5} gives =1i (1.2.0: i). At Decimals 2, e^{1000}+i gives ≈1.97·10^{434}+1.00i but \sqrt2+i gives ≈1.41+i. These lines repeat what was typed: e = e ≈2.718…, e^{-1000} = e^{-1000} ≈…, 2i = 2i (all the same in 1.2.0 and 3f1e120).
- Test: pending

## QA round 4 (wf_dec1ffe8-a9c)

### r4-1: BUG: after a physical Tab in a line, the on-screen ←/→ at that line's edges no longer move to the next or previous line

- Severity: unrated · source: retest:fixes
- Found: Reproduced in t2b.js, t2d.js and t2e.js. Pad 3+4 / 2+5+6 / 8 with the on-screen keyboard open: click after the 2, press Tab (caret goes to the end of line 2). On-screen → at the end of line 2 stays at pos 5, even when tapped twice. Click before the 2 and tap on-screen ← at the start of line 2: it stays at pos 0. Line 3, where Tab was never pressed, works: ← at its start goes to line 2. Physical → at the end of line 2 does go to line 3. Tab only passing through a line (Tab from line 1 through line 2, answers off) is enough to break that line's on-screen arrows. They work again only after a physical non-Tab key is pressed in that line (physical 1 then Backspace). Cause: panel.js makeRow sets the per-line `tabbing` flag only in the keydown listener. The on-screen keys fire no keydown, so the flag stays true and the move-out handler returns early (`if (tabbing) return;`). 1.2.0's move-out had no such flag, so this is a 1.3.0 regression.
- Test: pending

### r4-2: BUG (regression in this commit): in Algebra, symbolic lines whose result contains a rounded float get no answer at all

- Severity: unrated · source: retest:fixes
- Found: These lines now show nothing in Algebra at every Decimals setting, in the engine and in the panel (t8.js): \sqrt{2.5}x, \sin(0.5)x, x\cdot\arcsin(0.5), 2^{0.5}+x, x+e^{0.5}. The previous commit a39b781's sandbox gave = 1.581138830084189666x, = 0.479425538604203000273x, and so on. 1.2.0 gave = 1.581…x, = πx/6, = x+√2 and = x+√e. Cause: the new line in evalLine (`if (exact && !val.isNumberLiteral && … 16+ digit decimal …) exact = null`) drops the exact form, and these lines have no decimal fallback because approxV is not a number. The commit message says such forms are only 'not shown with "="', and the CHANGELOG says a function of a decimal 'gives a decimal answer only', but here there is no answer at all. Numeric lines are fine: 180/π·arcsin(0.5) ≈ 30.
- Test: pending

### r4-3: BUG: the decimal of a complex sum is inserted without brackets when its real part ends in a repeating decimal or scientific notation

- Severity: unrated · source: retest:fixes
- Found: tgrp.js, with line 1 = 2\cdot and a click on line 2's decimal part. (1+i)/3 at auto ('= 0.3̅+0.3̅i') gave 2\cdot0.\overline{3}+0.\overline{3}\imaginaryI. (1+i)e^{1000} gave 2\cdot1.97…\cdot10^{434}+1.97…\cdot10^{434}\imaginaryI. 10^{-20}+i at 1 place ('≈ 1.0·10^-20+i') gave 2\cdot1.0\cdot10^{-20}+\imaginaryI. All three need brackets. Cases where the character before the '+' is a digit (3+0.3̅i, 0.33+0.33i at 2 places) and negative sums are bracketed correctly. Cause: panel.js answerParts computes the decimal part's group with /^-|\d[+-]/, which misses '}+' after \overline{…} or 10^{…}. The repeating-decimal form of complex parts is new in this commit: before, it was 0.333…+0.333…i, which the regex caught. The scientific-notation case already existed.
- Test: pending

### r4-4: BUG (minor, in 1.3.0 since d80adc4, not this round): undoing a new line puts the caret at the end of the line below, not where Enter was pre

- Severity: unrated · source: retest:fixes
- Found: tundo2.js: pad 1+1 / 2+2, caret at the end of line 1, Enter, then Ctrl+Z gave [1+1, 2+2] with the focus at the end of line 2 ('line 2 pos 3/3'). Typing 7 then gave 2+27 instead of continuing 1+1. The on-screen ↵ followed by on-screen undo behaves the same (tundo.js). Cause: hist.restore focuses fields()[firstDiff(from, to)], the index of the removed line, which is now the line below. It ignores the saved focus and position (s.focus=0, s.pos=3).
- Test: pending

### r4-5: Possible issue (low severity, spec is ambiguous): after Tab into a line and moving its caret with arrows, a clicked answer goes to another l

- Severity: unrated · source: retest:fixes
- Found: tb4.js: pad 3+4 / 2+5+6 / 10. Click the end of line 3, Shift+Tab into line 2 (passing through), then ← ← to pos 3 (physical or on-screen). Clicking line 1's answer gave 107 in line 3, and line 2 stayed unchanged. Arrows inside a line never update lastField, so a line reached by Tab whose caret the user then deliberately positioned is still treated as 'only passed through'. CLAUDE.md ('lines Tab only passes through don't count') arguably says this line should count. Judgement call; it's reproducible.
- Test: pending

### r4-6: Decimals: a float answer that is exactly 1 keeps the requested number of places

- Severity: unrated · source: retest:regressions
- Found: Minor, cosmetic, reproducible. With Arithmetic and Rad, the line \sin^2(1)+\cos^2(1) shows '= sin(1)²+cos(1)² ≈1.0' at Decimals 2, 3 and 10 (t-one.js in the panel). It should be 1.00 / 1.000 / 1.0000000000. cos(0.5)²+sin(0.5)², which N() returns as 0.999…, correctly shows 1.00 / 1.000. The same happens with v≔30, cos(v)²+sin(v)² at 2 places. Cause: CE 0.161's toLatex({digits:{fractional:n}}) returns '1.0' for the float {num:'1.0'} but '3.000' for 3.0 (ce-probe.js), and sandbox.js decimal() uses that output directly on the fixed-places path.
- Test: pending

### r4-7: No empty undo steps

- Severity: unrated · source: retest:regressions
- Found: Minor, reproducible (t-ans.js, twice, and t-vk.js). In line '34': type 5, wait more than 1 s, type 9, then Backspace within 1 s → '345'. The first Ctrl+Z leaves '345' unchanged (nothing visible happens), and only the second gives '34'. The on-screen keyboard does the same: VK 9 then VK ⌫ in a new line, then the second VK undo changes nothing. Cause: hist.typed() keeps the 9/Backspace in one group whose saved state equals the current state, so the step it pushed undoes to identical lines.
- Test: pending

### r4-8: A line's MathLive menu cannot be broken by removing its line while it is open

- Severity: unrated · source: retest:regressions
- Found: Low severity, reproducible with the keyboard only (n-scrimdel2.js, n-scrimkb2.js, after a page reload). Steps: click into line 2, right-click line 1 (MathLive's menu opens, but focus stays in line 1's field, not the menu), then Tab, Shift+Tab (focus lands on line 1's × with the menu still open), then Enter. Line 1 is deleted while its menu is open. A second path: in line 2, right-click line 1, Shift+Tab to ☰, Enter, ArrowUp to 'Clear pad', Enter. After either path, no line menu opens again for the session. Both the ☰ toggle and right-click throw 'InvalidStateError: Failed to execute showPopover on HTMLElement: Invalid on disconnected popover elements' (mathlive.min.js:3221), because MathLive's shared scrim stays attached to the removed field until the panel is reloaded. lineMenuOpen() guards the pad's shortcuts, but not the × button, the ☰ menu actions or the toast Undo when reached by Tab. Mouse clicks are safe: the scrim covers × and the toast, so a click only closes the menu.
- Test: pending

### r4-9: No answer repeats a typed function call (CHANGELOG: 'An answer no longer just repeats what you typed')

- Severity: unrated · source: retest:regressions
- Found: Not a regression: 1.2.0 is identical (cmp4-typed.json). The fix only covers part of the cases. Typing sin(1), ln(2), tan(1), cos(2), arctan(2) or sin(30) by keys (n-typed.js) makes MathLive write \sin\left(1\right) and so on. The answer then still starts with the line itself: '= sin(1) ≈0.841470984807896506653' and '= ln(2) ≈0.693…'. Typing sqrt(2) gives \sqrt{\left(2\right)}, which shows '= √2 ≈1.414…'. key() in sandbox.js normalizes \exponentialE, \imaginaryI and single-character braces, but not \left( / \right). This makes the most common typed form, a function call with brackets, keep repeating.
- Test: pending

## QA round 5 (wf_41bdaf3b-8b9)

### r5-1: Typing right after Ctrl+Z (or after × on the only line) brings back undone text

- Severity: medium · source: retest:regressions
- Found: This is a regression from 1.2.0. Repro: new line, type '3x' quickly, Ctrl+Z (the line becomes empty), type 'x^2'. The line becomes '3\times^2' (3×²): the undone '3' comes back and the x turns into ×. More cases from real keys: type 1+ (pause) p (pause), Ctrl+Z twice (empty), type i: the line becomes '1+\pi'. Type 2x, on-screen ↶ undo, type x: '2\times'. A single line '2x+3x', ×, Shift+Tab back into it, type x: '2x+3\times'. Likely cause: the pad's undo (hist.restore, panel.js line 333) and × on the only line (line 247) replace the value with mf.setValue, which leaves MathLive's inline-shortcut keystroke buffer in place. The next key that completes a shortcut (xx→×, pi→π) then rolls the field back to MathLive's own snapshot from before the shortcut. A click or caret move first avoids it: Backspace then i gave 'i'. In 1.2.0, which used MathLive's own undo, the same steps give '1x' and '1i'. Scripts: n-stale.js, n-stale2.js, n-stale4.js, n-stale5.js, n-stale120.js.
- Test: pending

### r5-2: Typing d/dx x^3 shows can't read in Algebra

- Severity: medium · source: retest:regressions
- Found: Not a regression in answers (1.2.0 gave no answer either); what is new is the can't-read marker. The Algebra hint says 'd/dx x³ becomes 3x²', and the sample line \frac{d}{dx}x^3 does show =3x². Typing d/dx x^3 with real keys makes MathLive's 'dx' shortcut write \frac{d}{\differentialD x}x^3. That renders almost the same as the sample line but shows 'can't read', with the tooltip 'This uses a command the engine doesn't know' (screenshot typed-dx.png). The engine returns {invalid:'unexpected-command'} for every \differentialD derivative. 1.2.0 returned null and showed nothing. The on-screen keyboard's \dfrac{\mathrm{d}}{\mathrm{d} x} key and \int…\differentialD x both still work in both versions.
- Test: pending

### r5-3: Typing log(100) gives an empty-box answer and no marker

- Severity: low · source: retest:regressions
- Found: This was already the same in 1.2.0: MathLive 0.110 has the same 'log' shortcut, and the engine gives the same result. Typing log(100) produces \log_{\left(100\right)}: the 100 goes into the base subscript. Algebra then shows '= log₁₀₀(□)', an answer containing an empty box (typed-dx.png). Arithmetic shows nothing, and neither mode gives the new can't-read marker that the changelog promises for 'an empty box'. log(2) behaves the same.
- Test: pending

### r5-4: Algebra ≈ answers that are sums are inserted into another line without brackets (new this round)

- Severity: high · source: retest:fixes
- Found: Algebra, pad ['2^{0.5}+x', '2\cdot']. Click the end of line 2, then click line 1's answer '≈ x+1.414…'. Line 2 becomes 2\cdot x+1.414\,213… with answer ≈2x+1.414…, when 2·(x+1.414) = 2x+2.828 was meant. The same happens with Tab to the answer and Enter, and in decimal-first order: x+e^{0.5} gives 2\cdot x+1.648…. Also affected: \sin(0.5)x+y gives 2\cdot0.479…x+y; x-\sin(0.5) gives 2\cdot x-0.479…; \sqrt{2.5}x-y gives 2\cdot1.581…x-y. e^{0.5}x^2+x is bracketed because a digit comes before '+'. Cause: panel.js line 456 sets the approx part's group from /^-|[\d}][+-]/ only, so a '+'/'-' after a letter (x+, x-) doesn't count. The engine sends group:true for these lines, but that flag is only used for the exact part. These lines had no answer before ee125fe, so this is new in this build. Script: r5fix/t2b.js, r5fix/t2c.js.
- Test: pending

### r5-5: Undo after editing in the middle of a line puts the caret at the end of the line (regression vs 1.2.0)

- Severity: medium · source: retest:fixes
- Found: r5fix/t14.js, pad 2+5+6. Click after 5, press Backspace (2++6), then Ctrl+Z: 2+5+6 with the caret at pos 5/5 (end). Typing 8 then gives 2+5+68. Typing 9 after 5 then Ctrl+Z behaves the same, as do ← ← then 9, the on-screen 9 with on-screen undo, and typing 7 at the end, then 9 after 5, then Ctrl+Z (caret at 6/6, 8 gives 2+5+678). The 1.2.0 zip (r5fix/t14old.js, same port, separate profile) puts the caret back at pos 3/5, and typing 8 gives 2+58+6. Cause: hist.typed() pushes `cur`, whose caret comes from the last recorded step, and clicks or arrows don't update it. ee125fe added a caret snapshot to change() (Enter, ×, …) but not to typed(). Redo restores the caret correctly.
- Test: pending

### r5-6: The faded Undo toast's button is still focusable and still works

- Severity: low · source: retest:fixes
- Found: r5fix/t13.js. Delete line 2 with × and wait 5.6 s: the toast has class show removed and opacity 0, but its innerHTML still has <button>Undo</button>. Tab from line 2 goes BUTTON > BUTTON > + add line > the invisible Undo button (opacity 0). Enter on it restores line 2 and shows 'Line restored'. Keyboard and screen-reader users land on an invisible control after '+ add line', and activating it undoes the step. When the step is no longer the latest it does nothing, but it still takes focus.
- Test: pending

### r5-7: Screen-reader label of an ≈ answer that starts with a letter drops '≈ x'

- Severity: low · source: retest:fixes
- Found: Algebra, line x+e^{0.5}. Tabbing to the answer gives aria-label ' plus 1.64872127070012814685. Enter puts it in the line…', which leaves out 'approximately x'. panel.js line 477 calls convertLatexToSpeakableText(parts[i].rel + parts[i].latex), and '\approx' + 'x+…' becomes the unknown command '\approxx'. The visible markup at line 474 has a space and renders correctly. Only reachable with this round's symbolic ≈ answers (x+…, x-…). Script: r5fix/t2c.js.
- Test: pending

### r5-8: Keyboard button after Tab into a line opens the on-screen keyboard on the previously clicked line

- Severity: low · source: retest:fixes
- Found: r5fix/t17.js, pad 11/22/33. Click line 1, Tab ×3 into line 2 (caret visible in line 2 pos 2), then click Keyboard: focus jumps to line 1 pos 2, and on-screen 5 gives 115 in line 1. CHANGELOG says the button opens the keyboard 'on the line you were in'. If a physical ← is pressed in line 2 first, it opens on line 2 correctly. Keyboard-only path: click line 2 end, Shift+Tab to the Keyboard button, Enter: line 2 opens at pos 0, not its pre-Tab caret (end), because MathLive's Shift+Tab moved the caret and caretBeforeTab isn't restored here. This existed before this round's change (lastField rule).
- Test: pending

### r5-9: A right-click menu on a line without focus can't be closed with Esc, and the pad's shortcuts are silently dead while it stays open

- Severity: low · source: retest:fixes
- Found: r5fix/n-rclick2.js and r5fix/t8c.js. Focus in line 1, right-click line 2: the menu opens (menus [1]) but focus stays in line 2's textbox. Typing 7 edits line 2 under the menu (347). Esc does nothing. ArrowDown moves focus to line 3 with line 2's menu still open, and Enter there adds a line. Ctrl+Z does nothing and shows no toast until a click elsewhere closes the menu, after which it works. Right-clicking the line that already has focus puts focus in the menu, and Esc closes it (fine). A standalone MathfieldElement behaves the same for Esc and typing, so part of this is stock MathLive. The arrow move-out to other lines and the dead Ctrl+Z without feedback come from the pad.
- Test: pending

### r5-10: Replace/Append blocked while a line menu is open leaves the user in the modal Import dialog with no way to close the menu

- Severity: low · source: retest:fixes
- Found: r5fix/t16.js and r5fix/t16-import-blocked.png. Open the menu by right-click, Shift+Tab to ☰ → Import…, paste 'x+1\ny+2', press Replace pad. The dialog stays open and the toast 'Close the menu in the line first' shows dimmed under the backdrop. The line menu can't be reached because the modal dialog makes the page inert. Esc closes the dialog, and reopening Import resets the textarea to the pad ('11\n22\n33'), so the pasted text is lost. This path is only reachable with the keyboard, so it is rare.
- Test: pending

### r5-11: A complex answer at fixed Decimals mixes precision between its parts

- Severity: low · source: retest:fixes
- Found: Arithmetic, \sin(0.3)-0.3i at Decimals 2 shows ≈0.30−0.3i (screenshot r5fix/t18-algebra.png; engine output r5fix/cmp4.txt). The float real part is padded by ee125fe's fixed() change, but the exact imaginary part keeps its own 1 place. Cosmetic.
- Test: pending

## QA round 6 (wf_371e4d80-692)

### r6-1: Right-click on a line other than the focused one, then Esc

- Severity: low · source: retest:regressions
- Found: Repro (n-rc6b.js): set the pad to 12/34/56, click into line 2, right-click line 1. MathLive's menu opens on line 1, but keyboard focus is in line 1's keyboard sink, not in the menu. Esc then doesn't close the menu; instead line 1 switches to LaTeX mode (mode=latex, pos 3/4). A second Esc switches it back. End and Enter do nothing while the menu stays open, and only a click elsewhere closes it. No text is lost and the pad is not cleared. Not a regression: standalone math-fields and the 1.2.0 build (MathLive 0.110) also leave the focus in the sink in this case, and in 1.2.0 the second Esc even cleared the pad. The LaTeX-mode switch shows up only because 1.3.0 correctly passes Esc to MathLive while a menu is open.
- Test: pending

### r6-2: Fix 4b: faded toast's Undo button with prefers-reduced-motion: reduce

- Severity: medium · source: retest:fixes
- Found: The fix does not hold here. Repro (t4.js, with emulated prefers-reduced-motion: reduce): × on line 2, wait 5.6 s. The toast is invisible (opacity 0, no .show) but still has its button (btn:true). Tab from '+ add line' lands on the invisible 'Undo' button, and Enter restores the deleted line (['1+1','3+3'] → ['1+1','2+2','3+3']). Cause: the button is removed only on transitionend, and panel.css has '@media (prefers-reduced-motion:reduce){*{transition:none!important}}', so that event never fires. This affects anyone with the OS reduce-motion or animations-off setting (on Linux likely including GNOME's Animations off, not checked here).
- Test: pending

### r6-3: Fix 8b: typed log(100) in Arithmetic mode

- Severity: medium · source: retest:fixes
- Found: In Arithmetic, typed log(100) (\log_{\left(100\right)}) and log_10(100) show no answer and no "can't read" marker (t8.js: '6: \log_{\left(100\right)} → ·'). The engine returns null before its \square check because the line counts as having unknowns. CHANGELOG 1.3.0 says a line with an empty box 'such as typed log(100) is marked "can't read"', but that only happens in Algebra. It is also inconsistent: an empty \sqrt{} is marked in Arithmetic. 1.2.0 showed nothing here too, so this is not a new regression.
- Test: pending

### r6-4: New: redo after moving the caret puts the caret in the wrong place (regression this round)

- Severity: low · source: retest:fixes
- Found: Script t12.js, pad 2+5+6. Click after 5, type 9, then move the caret (click line 1, End, ↓, or Tab), Ctrl+Z, Ctrl+Shift+Z. The caret lands at the end of line 2 (pos 6), or wherever it was moved within the line (Home → pos 0). Typing 8 then gives 2+59+68 or 82+59+6. The previous commit (ee125fe build, same test) always put it after the redone 9 (pos 4 → 2+598+6). Cause: hist.moved overwrites cur, which is the state redo returns to, with the moved caret. Redo straight after undo with no caret move is still correct.
- Test: pending

### r6-5: New: screen-reader label drops repeating decimals

- Severity: medium · source: retest:fixes
- Found: The answer aria-labels added in 1.3.0 go through MathLive.convertLatexToSpeakableText, which drops \overline. 1/3 is announced 'equals 0..', 22/7 'equals 3..', and '= 0.1\overline{6}' (1/6) 'equals 0.1' (t5.js and the panel eval). A screen-reader user hears a wrong value. 1.2.0 had no such labels.
- Test: pending

### r6-6: New: undo after inserting an answer with Tab+Enter puts the caret at the end of the line (not new this round)

- Severity: low · source: retest:fixes
- Found: Pad 2+5+6 / 3+4. Click after 2 in line 1, Tab to line 2's answer, Enter → 27+5+6. Ctrl+Z restores 2+5+6 with the caret at pos 5 (end), not pos 1 where the answer went. With a click instead of Tab+Enter, undo returns to pos 1. The previous commit's build does the same, so it is not new this round.
- Test: pending

## QA round 7 (wf_35b3aae9-493)

### r7-1: Redo caret after a mid-line edit followed by another edit

- Severity: low · source: retest:regressions
- Found: Repro (r7reg/n-redoc.js): pad 12345 / 678. Click line 1, Home → →, type 9 (129345), wait 1.2 s. Click line 2, End, type 0. Then Ctrl+Z, Ctrl+Z, Ctrl+Y. The redo restores 129345 but puts the caret at the end of line 1 (pos 6/6) instead of after the 9 (pos 3), so a following 7 gives 1293457. The same happens if the second edit is in the same line after End (129345 → End → 0). Cause: the state redo returns to is recorded when the next edit is pushed, together with the caret moved for that edit (hist.moved/caret). restore() then sends a caret on another line or position to the line end. CLAUDE.md now says redo 'still lands after the redone edit'. The t12 cases (caret moved after undo) are fixed, but this one is not. Not a regression: the previous build (094f018, run in its own profile on 9512) does exactly the same.
- Test: pending

### r7-2: ≈ shown on exact values in scientific notation at fixed Decimals

- Severity: low · source: retest:regressions
- Found: At Decimals 2, 1/100000 shows '≈ 1.00·10^−5' in the panel (t-opts2). In the engine, 10^{−3} = 1/1000 → '≈ 1.00·10^{−3}', 10^{−5} and 10^{−20} likewise. I found 12 such results in cmp7-out.json, all with approxIsExact false. These values are exact, and other exact fixed-decimal values get '=' (1/2 = 0.5 at 2 places). So this contradicts the documented '≈ only when rounded'. Cosmetic and not a regression: the sandbox code behind it is unchanged since the previous build (the previous vs current engine diff shows only the typed-log change).
- Test: pending

### r7-3: The Undo toast is hidden behind the on-screen keyboard

- Severity: medium · source: retest:fixes
- Found: c-vktoast.js, screenshot r7fix/vk-toast.png. With the keyboard open, × on line 1 shows 'Line 1 deleted · Undo' at y=750–793 (bottom: 20px, z-index 20). The keyboard covers y 600–813 (z-index 105), so the toast can't be seen. At the Undo button's position, elementFromPoint hits the keyboard's ∫ key. A real click there did not undo, and the toast stayed. In the fuzz (seed 3, vk) a click at that position hit the keyboard's '+' and typed '+' into the line instead of undoing Clear pad. Every toast is affected ('Pad cleared · Undo', 'Pad replaced · Undo', 'Press Esc again to clear the pad', 'Close the menu in the line first', 'Nothing to undo', copy confirmations). For plain toasts this already happens in 1.2.0, but in 1.3.0 it hides the new Undo feature for anyone using the on-screen keyboard. Ctrl+Z and the keyboard's own undo key still work, so no work is lost.
- Test: pending

### r7-4: Redo of an earlier step (after two or more undos) puts the caret where it was before the next edit, not after the redone edit

- Severity: low · source: retest:fixes
- Found: c3b.js (output c3b.out). Pad 1+1 / 2+5+6 / 3: type 9 after the 5, wait 1.2 s, press ←←← and type 0, giving 20+59+6. Ctrl+Z, Ctrl+Z gives 2+5+6. Ctrl+Shift+Z gives 2+59+6 with the caret at line 2 pos 1/6 (after the leading 2), and typing 8 gives 28+59+6 instead of 2+598+6. Same pattern: a click after the + in line 1 before typing 4, then Z Z Y, leaves the caret at line 2 pos 6/6 and 8 gives 2+59+68; End and Enter before the next step does the same. The cause: after a caret move, the state stored for the next edit to return to (the moved caret) is also what redo of the previous step returns to. The undo side is right in all cases. Fix 3's single-step redo is unaffected.
- Test: pending

### r7-5: When a focused toast Undo times out, the focus drops to <body>

- Severity: low · source: retest:fixes
- Found: c1-toast.js part D, both motion settings. × on line 1, then Tab from '+ add line' reaches 'TOAST BUTTON Undo'. Waiting the 5 s makes hideToast() set inert=true while the button has focus, and document.activeElement becomes BODY. Enter then does nothing (correct). The next Tab starts at the first header button, so a keyboard user loses their place. The focus could go back to a line, or '+ add line', before the toast is made inert.
- Test: pending

### r7-6: After a click on a line's left padding, an answer goes into a line that doesn't have the caret

- Severity: low · source: retest:fixes
- Found: c-pad.js. With the caret visibly in line 2 (2·|), a click 4–11 px from the left edge of line 1 (MathLive's 12 px padding) doesn't move the focus or caret: still line 2 pos 2. The pad's window pointerdown handler still records line 1 as the line last edited. Clicking line 3's answer (7) then inserts it into line 1, giving "1+7", not after 2· where the caret is shown. At 14 px the click focuses line 1 normally. The dead zone itself is stock MathLive.
- Test: pending

### r7-7: After ×, the focus drops to <body>

- Severity: low · source: retest:fixes
- Found: c-toast2.js and c3: after × on a line (mouse, or Enter on the Tab-reached × button), document.activeElement is BODY. Typed keys go nowhere (c-toast2 §5e: typing 5 after × changed nothing), and the next Tab starts from the top of the page. The same happens in 1.2.0 (c120.js: Enter on × gives focus BODY), so this is older than 1.3.0. Also, the Undo toast's button is then reachable only by tabbing through the whole page.
- Test: pending

### r7-8: An empty superscript or subscript left behind gives an answer that repeats the line

- Severity: low · source: retest:fixes
- Found: c-empty.js and screenshot r7fix/empty-boxes.png. Typing 2^ then → stores 2^{}, which MathLive draws as plain '2' with no box, and the answer column shows '= 2', the line repeated, which 1.3.0 otherwise avoids. The same for 2_ → (2_{} = 2) and in Algebra x^ → (x^{} = x). 2^{}+1 = 3 is fine. Typed empty boxes that are visible (1/□, √□, □/□, log(100), sin()) correctly show can't read. Cosmetic and rare.
- Test: pending

## QA round 8 (wf_3b1796de-1c7)

### r8-1: Decimals: '=' on exact values in scientific notation

- Severity: low · source: retest:regressions
- Found: Reproduced in the panel (Arithmetic, Rad, Decimals 2) and in eng.js. Commit 9524b37 says exact values in scientific notation at fixed Decimals get '='. That holds for rationals: 1/400 → '= 2.50·10^−3', 10^−6 → '= 1.00·10^−6', 1/800 → '= 1.25·10^−3'. It does not hold for the same values as floats (lines typed with decimals or %). 0.05·0.05 → '≈ 2.50·10^−3', 1.25·10^−3 → '≈ 1.25·10^−3', 5·10^−7 → '≈ 5.00·10^−7', 0.1^10 → '≈ 1.00·10^−10', 0.000001·0.000001 → '≈ 1.00·10^−12', 5%·5% → '≈ 2.50·10^−3'. At Decimals auto all of these show '=' (e.g. 0.05·0.05 = 0.0025), so nothing is rounded off. Cause: the float override in sandbox.js evalLine (approx = decimal(...).latex; approxIsExact = false) ignores the exact flag decimal() now returns. The number is right; only the sign wrongly suggests rounding. Not in 1.2.0, which had no Decimals option.
- Test: pending

### r8-2: NEW: an assignment whose left side isn't a single letter (a+b := 5, ab := 5, area := 12, price := 19.99, a·b := 5) redefines that operation 

- Severity: high · source: retest:fixes
- Found: Wrong math, reproduced by typing in the panel (Arithmetic). Lines '1+1', 'a+b:=5', '1+1', '3+4', '10+20' show =2, nothing, =5, =5, =5 (r8fix/stu/s16-aplusb.png). Compute Engine reads a+b := 5 as defining Add(a,b) := 5. Juxtaposition breaks the same way: after 'ab:=5', '2(3+4)' shows '=5' and so do ½(4) and 2^10. After 'area:=12' (letters a·r·e·a), 2(3+4), ½(4) and 2³(5) all show '= (_1,_2) ↦ 12' (s11-01-area.png). In Algebra, 2π, 5√2 and 3x show the same. After 'a·b:=5', 2·3 = 5. After 'sin(x):=1', sin(0) = 1. In the student session, typing 'price:=19.99' and 'qty:=3' broke every later product (6.02·10²3·2 lost its answer, '2(3+4) = _1 ↦ 3'), and the assignment line itself shows no marker. The Add case is a regression: in 1.2.0 (engine 0.133), 1+1 stays 2 after a+b:=5. The juxtaposition and sin cases are the same in 1.2.0. Deleting the line fixes the pad.
- Test: pending

### r8-3: NEW: typing ans followed by * folds the × and everything after it into the upright 'ans' text, so the line gets no answer

- Severity: medium · source: retest:fixes
- Found: Real keys at about 220 ms per key. 'ans*2' gives '\mathrm{ans\cdot2}' and 'ans*1.08' gives '\mathrm{ans\cdot1}.08'. Both show no answer and no 'can't read' marker, and Copy all… plain text prints 'a n s * 2'. Pressing → after 'ans' before * changes nothing. After 'ans*' the value is already '\mathrm{ans\cdot}'. These work: ans+1=11, ans-1, ans^2, ans/2, (ans+1), 2*ans=20, and ans followed by the on-screen × key and 2 (=202). Multiplying the previous answer (ans × 1.08) is the most natural use of ans. Seen in the student session (s10) and reproduced in s12 and s13. 1.2.0 has no ans, so this is new in 1.3.0.
- Test: pending

### r8-4: NEW: an empty superscript followed by a digit draws as '23' but is answered as 2·3 = 6

- Severity: medium · source: retest:fixes
- Found: Typed 2, ^, →, 3. The value is '2^{}3', the line draws as '23' with no visible box (focused or not), and the answer is '= 6' (r8fix/c6-unfocused.png). The engine gives the same for 2_{}3 = 6, 10^{}2 = 20, x^{}5 = 5x (Algebra) and (2)^{}3 = 6. It is the neighbour of fix 6: the line no longer repeats, but the answer contradicts what is drawn. Same in 1.2.0.
- Test: pending

### r8-5: NEW: a value typed in scientific notation at a fixed Decimals setting shows ≈ although it is exact (2·10^{-5} ≈ 2.00·10^{-5})

- Severity: low · source: retest:fixes
- Found: At Decimals 2: 2\cdot10^{-5} shows only '≈ 2.00·10^{-5}'. Same pattern for 3×10^{-4} ≈ 3.00·10^{-4}, 2.5·10^{-3} ≈ 2.50·10^{-3}, 1.6·10^{-19}·5 ≈ 8.00·10^{-19} (seen in the student session), and (2·10^{-5})/4 ≈ 5.00·10^{-6}. It is the same symptom as fix 7, through the float path. Compute Engine parses these as floats; in evalLine the 'more places than Decimals' branch sets approxIsExact=false and ignores sci.exact. The exactness fuzz found only this kind of mismatch: 4–11 per 2,800 decimals, never '=' for an inexact value. 1.2.0 showed '= 0.000 02' at any Decimals.
- Test: pending

### r8-6: NEW: right-clicking a line that doesn't have the focus opens a menu that Esc can't close; Esc instead switches that line into LaTeX mode

- Severity: low · source: retest:fixes
- Found: Two starting states: caret in line 2, or nothing focused. Right-click line 1's text and the menu opens, but keyboard focus is in line 1's text sink, not in the menu. Esc, Esc, Esc leaves the menu open; the line's mode toggles latex/math and its position goes 2→3→2→3, and ArrowDown doesn't move in the menu. Clicking elsewhere closes the menu, but the line is left in LaTeX mode, and a typed 7 shows as a blue LaTeX '7' that isn't in the value (r8fix/rc3-nothingfocused-typed.png). Right-click on the focused line, and the ☰ toggle on any line, close fine with Esc (c-rcesc.js). Last round's right-click test covered key blocking only, not Esc.
- Test: pending

### r8-7: NEW: undo after a redo chain puts the caret where the redo left it, not where the undone edit was

- Severity: low · source: retest:fixes
- Found: Line '12345'. Click after 2, type a, wait, click after 4, type b, wait. Then Z Z Y Y Z: the text is right ('12a345'), but the caret is at pos 3 (after the a) instead of pos 5 (where b was), so a typed 7 gives '12a7345' (r8fix/c2c.js). With a single Z/Y/Z the caret is right. Cause: redo pushes entry() built from the caret left by the previous redo, and that replaces the original 'before' caret.
- Test: pending

### r8-8: NEW: undo after a held Enter (keyboard autorepeat) puts the caret in the first line each time

- Severity: low · source: retest:fixes
- Found: Enter ×4 as autorepeat 33 ms apart from line 1, then Ctrl+Z ×4. Each undo removes one empty line correctly, but the focus goes to line 1 pos 1 instead of the line above the removed one. At 120 ms and 400 ms between Enters, the focus goes to lines 4, 3, 2, 1 (r8fix/out/-rg2.out). The before-snapshot of each fast Enter still records line 1 as the focused line.
- Test: pending

### r8-9: NEW (a11y, stock MathLive): several on-screen keyboard keys have raw LaTeX or HTML entities as their aria-label

- Severity: low · source: retest:fixes
- Found: Visible keys read back aria-labels like '#@^2}' (x²), '#@^{#0}}' (xⁿ), '\sqrt{#0}', '&divide;', '&times;', '&#x2212;', '\exponentialE', '\imaginaryI' and '\int^{\infty}_{0}\!#?\,\mathrm{d}x'. prettyCap() changes only the displayed keycap, so a screen reader announces these strings. Not compared against 1.2.0.
- Test: pending

## QA round 9 (wf_591f79da-7f8)

### r9-1: REGRESSION: assigning to the letters D and N (and N(t), D(x), Γ, ζ) is now refused

- Severity: high · source: retest:regressions
- Found: The new 'assign' check in sandbox.js (libraryHas) rejects any name Compute Engine defines. That includes the plain capital letters D (derivative operator) and N (numeric evaluation), even though the CHANGELOG says only non-letters (sin(x):=1, ab:=5, area:=12) are refused. I typed it in the panel in Arithmetic with real keys (r9reg/n-assign9.js; screenshot r9reg/assign-D-N.png): a:=1, b:=-5, c:=6, then D:=b^2-4ac. The D line shows 'can't read' with the tooltip 'Only a letter (x := 5) or a function (f(x) := …) can be given a value', which is wrong because D is a letter, and the following line D gets no answer. N:=100 is also 'can't read', and N·2 gets no answer. Function form: N(t):=100·2^t is 'can't read' and the next line N(3) shows '= 3', a wrong answer (1.2.0 gives 800, and P(t) gives 800 in the current build). D(x):=7 then D(2)+1 shows '= 1+D(()↦2)'. In 1.2.0 (eng.js, r9reg/assign.js and assign2.js) D:=b^2-4ac gave D = 1 and (−b+√D)/(2a) = 3, N:=100 gave N·2 = 200, and N(3) = 800, with no side effects (d/dx still worked after D:=3). Now in Algebra (−b+√D)/(2a) shows (√D+5)/2. Γ, ζ and \mathrm{mean} are refused the same way, with the same tooltip. All 50 other single letters, both cases, worked in both versions. e, i, π, γ and φ were silently ignored in 1.2.0 and are now marked, which is an improvement. Writing D for the discriminant and N for a count or population is common, so a normal user can hit this.
- Test: pending

### r9-2: Fix 8: readable aria-labels on on-screen keyboard keys

- Severity: low · source: retest:fixes
- Found: The main layer is fixed. Script c8.js read the labels: ÷, ×, −, "'E'", "'I'", "pie" (π), "'X' squared", "'X' to the 'N';" (stray semicolon), "the square root of 'X' ," (stray comma), "the integral from 0 to infinity of 'F' of 'X' 'D' 'X'". No HTML entities and no raw LaTeX remain on that layer. The second (symbols) layer still has 3 keys labelled with raw LaTeX: "\\overrightarrow{#@}", "\\overline{#@}" and "\\Vert 'X'\\Vert". Two are garbled: "'A' 'B' 'S'Open paren. 'X' Close paren." (abs) and "expOpen paren. 'Y' Close paren.". The action keys (undo, redo, paste, ⌫, ←, →, ↵) and the space bar have no aria-label or text at all; this is stock MathLive.
- Test: pending

### r9-3: Regression: N := … and D := … are now marked can't read

- Severity: medium · source: retest:fixes
- Found: In 1.3.0, typing N:=100 then N+1 shows "can't read" on the first line and no answer on N+1. In the 1.2.0 panel, the same keys give N+1 = 101 and D:=4 then D+1 = 5 (r9fix/n120.js). Cause: the new name check (libraryHas) rejects N and D because Compute Engine defines functions with those names. N(t):=5t and \mathrm{N}:=… are also refused. In the session, a chemistry line N:=n·6.022·10^{23} (number of particles) showed "can't read" and 2N got nothing (stu9/p1b-01-N.png). The tooltip makes it worse: it says "Only a letter (x := 5) … can be given a value", and N is a letter. A scan of all single Latin and Greek letters (r9fix/letters.json) shows the only refused ones are e, i, π, γ, φ (\varphi), ζ, Γ, N and D. Only N and D worked in 1.2.0.
- Test: pending

### r9-4: An empty box from the keyboard's xⁿ key gets a wrong answer instead of can't read

- Severity: medium · source: retest:fixes
- Found: Script r9fix/ph.js, screenshot r9fix/ph.png: tap 2, tap xⁿ, leave the box empty, tap →, tap 3. The line is drawn 2^□3 and shows "= 6". 10, xⁿ, →, 2 is drawn 10^□2 and shows "= 20". 5 with an empty xⁿ box shows "= 5", and 2^□ shows "= 2" while the box is still empty. Compute Engine treats \placeholder{} as nothing, and the panel only flags \square. The CHANGELOG says lines with an empty box are marked "can't read", and √□ and ∫₀^∞□ are flagged, but an empty exponent is not. 1.2.0 gave the same wrong numbers, but it had no markers. The same gap appears in the session: the 'int' shortcut gives \int_{□}^{□} x² dx = x³/3 with two empty limit boxes showing, and the 'log' shortcut gives −log_□(1.0·10⁻³) = 3 with an empty base box (p2b-02-ph.png).
- Test: pending

### r9-5: Typing g·t as 'gt' becomes '>' (MathLive shortcut), which breaks ½gt²

- Severity: medium · source: retest:fixes
- Found: In the session, d(t):=1/2 g t^2 typed as letters came out as 'd(t):=½>²' (stu9/p2b-01-gt.png). That line is "can't read", with the misleading tip "Something is missing, like an empty box". The lines below still answered silently: d(3)=0.12 and d(1.5)=0.06, because d was 0.04 from an earlier line and the definition failed. The cause is MathLive's stock inline shortcuts gt→> and lt→<. Other letter pairs a student might type as products are also shortcuts: vv→∨, nn→∩, uu→∪, of→∘, ch/th/sh→operator names. This is the same in 1.2.0, but u+gt and ½gt² are everyday physics, and the panel already overrides inlineShortcuts (for ans) in makeRow.
- Test: pending

### r9-6: Subscripted names (v_0, N_A, x_1, k_B) given a value do nothing, silently

- Severity: medium · source: retest:fixes
- Found: In the session, v_0:=20 then v_0·sin θ gave no answer and no marker (stu9/p8-01-subscript.png). In the engine (r9fix/names2.js), x_1:=7 then x_1+1 gives nothing in Arithmetic and 'x_1+1' in Algebra. N_A:=6.022·10^{23} then 2N_A gives nothing; k_B behaves the same. 1.2.0 behaves the same, so this is pre-existing. But the new name check in sandbox.js explicitly accepts Subscript names as valid, so these lines get neither an answer nor "can't read". Subscripted given values are normal in physics homework.
- Test: pending

### r9-7: An upright multi-letter name absorbs the · or ^ typed after it

- Severity: low · source: retest:fixes
- Found: Type \mathrm{mass} in LaTeX mode, press Esc, then type *4: the value becomes \mathrm{mass\cdot4}. The same happens in a stock MathLive field (r9fix/mr2.js). In the session, ½·mass·speed² typed this way became \frac12\mathrm{mass\cdot speed}^2 or \frac12\mathrm{speed^2\cdot mass}. It is drawn correctly but gets no answer and no marker (stu9/p1-03b-upright.png), and plain-text copy writes '(1)/(2)m a s s * s p e e d^2'. This is the same problem ansOut() now fixes for ans, but it is fixed only for ans, so the documented \mathrm{price} := 19.99 route mostly fails as soon as an operator follows the name. \mathrm{mass}+1 and 2·\mathrm{mass} work.
- Test: pending

### r9-8: Hiding the on-screen keyboard with its button leaves the focus on the button

- Severity: low · source: retest:fixes
- Found: Click into line 3, click Keyboard (focus goes to line 3), click Keyboard again: document.activeElement is BUTTON#btn-kbd (r9fix/kbfocus.js; 1.2.0 does the same). In the session, the next lines I typed were lost, and Enter on the button reopened the keyboard. I had to click back into a line to go on.
- Test: pending

### r9-9: Import… Append duplicates the whole pad if you click into the box before pasting

- Severity: low · source: retest:fixes
- Found: The Import box opens pre-filled with the whole pad, all selected (panel.js line 682). In the session I clicked into the box (which drops the selection), pasted a 13-line worksheet and pressed Append. The pad went from 33 to 77 lines: a full second copy of the pad with the worksheet spliced into the middle of it. One worksheet comment line was also merged into an existing line (stu9/session.log, part p3). Ctrl+Z and the Undo toast restore the pad. Pasting over the selection appends correctly (45 lines). 1.2.0 behaves the same.
- Test: pending

### r9-10: An imported LaTeX comment line shows '= Nothing'

- Severity: low · source: retest:fixes
- Found: Importing a line '% algebra worksheet' gives a row that draws as empty but has the answer '= Nothing', read to screen readers as "equals capital N O T H I N G". Copy all… plain text then writes a line ' = Nothing'. A lone '%' does the same. 1.2.0 does the same. Pasted LaTeX, from Overleaf for example, often contains % comments.
- Test: pending

### r9-11: Misleading tip and odd display for Greek constants

- Severity: low · source: retest:fixes
- Found: γ:=1.5 and φ(\varphi):=… are refused with "Only a letter (x := 5) … can be given a value", though both are letters; e, i and π get the same tip. 1.2.0 silently ignored γ:=1.5. In Arithmetic, 2γ shows '= 2EulerGamma ≈ 1.154…', with Compute Engine's internal name EulerGamma written out instead of γ; 1.2.0 shows the same. A physics student using γ for a Lorentz factor gets a refusal whose tip contradicts itself.
- Test: pending

## Final check (wf_e63cee2e-92f)

### final-1: Fix 2 (related): x_1:=3 typed straight through without → gets a misleading tip

- Severity: low · source: check:final-four
- Found: If the := is typed without leaving the subscript, which is the natural way to type it, MathLive stores x_{1\coloneq3} and v_{0\coloneq20}. The line correctly shows [can't read], but the tip is 'A bracket isn't closed.' and the student sees no bracket. The engine returns invalid:'expected-closing-delimiter' for x_{1\coloneq3}, while x_1\coloneq3 returns 'subscript'. The marker is right and nothing below the line breaks, but the tip doesn't match what's on screen. A possible fix: map a coloneq inside a subscript to the 'subscript' tip. Script: [scratch file]
- Test: pending
