// Undo-history scenarios as data (CLAUDE.md "Undo"). Each case: { name, start, mode, steps }.
// start: the pad's lines. steps: [op, ...args]; ops are run by a driver (today test/browser/history-driver.mjs,
// with trusted input in a real panel; after the split also a Node driver on a fake pad):
//   ['click', line, 'end'|'start']  click into a line, caret to its end or start
//   ['type', text]  ['key', name, opts]  ['left', n]  ['backspace']  ['enter']  ['fastEnter', n]  ['shiftTab', n]
//   ['del', line]  × on that line         ['toastUndo']  the toast's Undo button
//   ['repeat', n, steps]                  ['wait', ms]
//   ['undo', expect]  ['redo', expect]    Ctrl+Z / Ctrl+Shift+Z; expect = { lines, focus, caret, toast } (any subset)
//   ['expect', expect]                    check without undoing
// lines are as MathLive writes them; focus is the focused line's index; caret is its position.

export const HISTORY = [
  { name: 'keystrokes in one line less than 1 s apart are one step', start: ['1'], steps: [
    ['click', 0], ['type', 'ab'],
    ['undo', { lines: ['1'], focus: 0, caret: 1 }],
    ['redo', { lines: ['1ab'], focus: 0, caret: 3 }],
  ] },
  { name: 'keystrokes 1 s or more apart are two steps', start: ['1'], steps: [
    ['click', 0], ['type', 'a'], ['wait', 1100], ['type', 'b'],
    ['undo', { lines: ['1a'] }], ['undo', { lines: ['1'] }],
  ] },
  { name: 'typing in another line is another step, and undo focuses the line that changed', start: ['1', '2'], steps: [
    ['click', 0], ['type', 'a'], ['click', 1], ['type', 'b'],
    ['undo', { lines: ['1a', '2'], focus: 1 }],
    ['undo', { lines: ['1', '2'], focus: 0 }],
  ] },
  { name: 'type 9, then Backspace within 1 s: no step', start: ['1'], steps: [
    ['click', 0], ['type', '9'], ['backspace'],
    ['undo', { lines: ['1'], toast: 'Nothing to undo' }],
  ] },
  { name: 'Enter, then undo: back on the old line, at the old caret', start: ['12'], steps: [
    ['click', 0], ['left', 1], ['enter'],
    ['expect', { lines: ['12', ''], focus: 1 }],
    ['undo', { lines: ['12'], focus: 0, caret: 1 }],
  ] },
  { name: 'edit mid-line, move the caret, undo, redo, undo', start: ['12345'], steps: [
    ['click', 0], ['left', 2], ['type', 'a'], ['key', 'End'],
    ['undo', { lines: ['12345'], caret: 3 }],
    ['redo', { lines: ['123a45'], caret: 4 }],
    ['undo', { lines: ['12345'], caret: 3 }],
  ] },
  { name: 'Z Z Y Y Z on 12345 (a after 2, b after 4) leaves the caret at 5', start: ['12345'], steps: [
    ['click', 0, 'start'], ['key', 'ArrowRight'], ['key', 'ArrowRight'], ['type', 'a'], ['wait', 1100],
    ['key', 'ArrowRight'], ['key', 'ArrowRight'], ['type', 'b'],
    ['expect', { lines: ['12a34b5'] }],
    ['undo', {}], ['undo', { lines: ['12345'] }], ['redo', {}], ['redo', { lines: ['12a34b5'] }],
    ['undo', { lines: ['12a345'], caret: 5 }],
  ] },
  { name: 'redo after two undos lands after that step\'s edit', start: ['1+1', '2+5+6'], steps: [
    ['click', 1], ['type', '9'], ['wait', 1100], ['left', 3], ['type', '0'],
    ['expect', { lines: ['1+1', '2+50+69'] }],
    ['undo', { lines: ['1+1', '2+5+69'], caret: 3 }],
    ['undo', { lines: ['1+1', '2+5+6'], caret: 5 }],
    ['redo', { lines: ['1+1', '2+5+69'], caret: 6 }],
  ] },
  { name: 'an answer reached by Tab and inserted with Enter, then undo: the pre-Tab caret', start: ['1+1', 'x'], mode: 'arith', steps: [
    ['click', 1, 'start'], ['shiftTab', 3], ['key', 'Enter'],
    ['expect', { lines: ['1+1', '2x'] }],
    ['undo', { lines: ['1+1', 'x'], focus: 1, caret: 0 }],
  ] },
  { name: 'a fast Enter ×2, then undo ×2: each undo focuses the line above the one it removes', start: ['1'], steps: [
    ['click', 0], ['fastEnter', 2],
    ['expect', { lines: ['1', '', ''], focus: 2 }],
    ['undo', { lines: ['1', ''], focus: 1 }],
    ['undo', { lines: ['1'], focus: 0 }],
  ] },
  { name: '× on the only line, then an inline shortcut, doesn\'t bring the text back', start: ['ab'], steps: [
    ['del', 0], ['expect', { lines: [''] }], ['type', 'pi'],
    ['expect', { lines: ['\\pi'] }],
  ] },
  { name: 'after an undo, x then x doesn\'t roll the line back (forgetTyping)', start: [''], steps: [
    ['click', 0], ['type', 'x'], ['undo', { lines: [''] }], ['type', 'x'],
    ['expect', { lines: ['x'] }],
  ] },
  { name: '× then the toast\'s Undo, after more than 200 steps', start: ['a', 'b'], steps: [
    ['click', 0], ['repeat', 101, [['enter'], ['backspace']]],
    ['expect', { lines: ['a', 'b'] }],
    ['del', 1], ['expect', { lines: ['a'], toast: 'Line 2 deleted' }],
    ['toastUndo'], ['expect', { lines: ['a', 'b'] }],
  ] },
  { name: '201 steps: the oldest is dropped', start: ['1'], steps: [
    ['click', 0], ['repeat', 101, [['enter'], ['backspace']]],   // 202 steps
    ['repeat', 200, [['undo', {}]]],
    ['undo', { toast: 'Nothing to undo' }],
  ] },
  { name: 'nothing to undo or redo on a fresh pad', start: ['1'], steps: [
    ['click', 0], ['undo', { lines: ['1'], toast: 'Nothing to undo' }], ['redo', { lines: ['1'], toast: 'Nothing to redo' }],
  ] },
];
