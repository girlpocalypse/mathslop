// Engine-bridge scripts (CLAUDE.md "Engine protocol", "Slow lines"), played against the fake engine.
// { name, start: { lines, mode }, auto, steps }. auto: false keeps the fake engine quiet (no 'ready').
// Ops:
//   ['send', msg]           the engine posts msg; an id of '$last' / '$prev' is the latest / the one before
//                           eval id the panel sent
//   ['evals', n]            the panel has sent n evals so far       ['eval', partial]   the latest eval matches
//   ['status', text]        the status line                          ['answers', [...]]  each row as shown
//   ['edit', line, text]    type at the end of a line                ['mode', 'off'|'arith'|'full']
//   ['wait', ms]            ['frame', 'same'|'replaced']             ['slowKeys', n]     ['inflight', n]
//   ['fill', n]             put n made-up keys in slowKeys (the > 500 rule)
export const BRIDGE = [
  { name: 'ready clears the status and sends the whole pad', start: { lines: ['1+1', 'x'], mode: 'arith' }, steps: [
    ['wait', 400], ['status', ''],
    ['eval', { type: 'eval', mode: 'arith', angle: 'rad', places: 'auto', lines: ['1+1', 'x'], skip: [] }],
  ] },
  { name: 'before ready: "starting math engine…" and nothing sent; then ready sends it', start: { lines: ['1+1'], mode: 'arith' }, auto: false, steps: [
    ['wait', 400], ['status', 'starting math engine…'], ['evals', 0],
    ['send', { type: 'ready' }], ['wait', 400], ['status', ''], ['evals', 1],
  ] },
  { name: 'an engine error is shown', start: { lines: ['1'], mode: 'arith' }, auto: false, steps: [
    ['send', { type: 'error', message: 'Compute Engine did not load' }], ['wait', 100],
    ['status', 'Math engine failed to start: Compute Engine did not load'],
  ] },
  { name: 'a line answer for the latest request is shown at once; a stale one or a row past the end is ignored', start: { lines: ['1+1', '2+2'], mode: 'arith' }, steps: [
    ['wait', 400],
    ['send', { type: 'line', id: '$last', line: 0, result: { exact: '2', approx: null, approxIsExact: false, group: false } }],
    ['send', { type: 'line', id: '$last', line: 7, result: { exact: '9', approx: null, approxIsExact: false, group: false } }],
    ['wait', 100], ['answers', ['=2', '']],
    ['edit', 1, '+1'], ['wait', 400], ['evals', 2],
    ['send', { type: 'line', id: '$prev', line: 1, result: { exact: '4', approx: null, approxIsExact: false, group: false } }],
    ['wait', 100], ['answers', ['=2', '']],
  ] },
  { name: 'an older result clears the requests up to it but isn\'t shown; the latest is', start: { lines: ['1+1'], mode: 'arith' }, steps: [
    ['wait', 400], ['edit', 0, '+1'], ['wait', 400], ['evals', 2], ['inflight', 2],
    ['send', { type: 'result', id: '$prev', results: [{ exact: '2', approx: null, approxIsExact: false, group: false }] }],
    ['wait', 100], ['inflight', 1], ['answers', ['']],
    ['send', { type: 'result', id: '$last', results: [{ exact: '3', approx: null, approxIsExact: false, group: false }] }],
    ['wait', 100], ['inflight', 0], ['answers', ['=3']],
  ] },
  { name: 'answers Off clears them, and a late result is ignored', start: { lines: ['1+1'], mode: 'arith' }, steps: [
    ['wait', 400],
    ['send', { type: 'result', id: '$last', results: [{ exact: '2', approx: null, approxIsExact: false, group: false }] }],
    ['wait', 100], ['answers', ['=2']],
    ['edit', 0, '+1'], ['wait', 400], ['mode', 'off'], ['wait', 400], ['answers', ['']],
    ['send', { type: 'result', id: '$last', results: [{ exact: '3', approx: null, approxIsExact: false, group: false }] }],
    ['wait', 100], ['answers', ['']],
  ] },
  { name: 'watchdog: silence after progress replaces the frame and skips that line from then on', start: { lines: ['1+1', '2+2'], mode: 'arith' }, steps: [
    ['wait', 400], ['send', { type: 'progress', id: '$last', line: 1 }],
    ['wait', 3300], ['frame', 'replaced'], ['slowKeys', 1],
    ['wait', 500], ['eval', { lines: ['1+1', '2+2'], skip: [1] }],
    ['send', { type: 'result', id: '$last', results: [{ exact: '2', approx: null, approxIsExact: false, group: false }, null] }],
    ['wait', 100], ['answers', ['=2', '[took too long]']],
    ['edit', 1, '+1'], ['wait', 400], ['eval', { lines: ['1+1', '2+2+1'], skip: [] }],
  ] },
  { name: 'watchdog without progress: every line in flight is marked', start: { lines: ['1+1', '2+2', '3+3'], mode: 'arith' }, steps: [
    ['wait', 3700], ['frame', 'replaced'], ['slowKeys', 3],
  ] },
  { name: 'any message keeps the watchdog quiet; nothing in flight, no watchdog', start: { lines: ['1+1'], mode: 'arith' }, steps: [
    ['wait', 400],
    ['wait', 2000], ['send', { type: 'progress', id: '$last', line: 0 }],
    ['wait', 2000], ['send', { type: 'progress', id: '$last', line: 0 }],
    ['wait', 2000], ['frame', 'same'],
    ['send', { type: 'result', id: '$last', results: [null] }],
    ['wait', 3500], ['frame', 'same'], ['slowKeys', 0],
  ] },
  { name: 'more than 500 remembered slow lines are forgotten at the next request', start: { lines: ['1+1'], mode: 'arith' }, steps: [
    ['wait', 400], ['fill', 501], ['slowKeys', 501], ['edit', 0, '+1'], ['wait', 400], ['slowKeys', 0],
  ] },
];

// lineKey(req, i): what a slow line's answer depends on. Same key ⇒ skipped again.
const R = (mode, lines) => ({ mode, lines, skip: [] });
export const LINE_KEY_SAME = [
  [[R('arith', ['1', '2', 'x']), 2], [R('arith', ['5', '7', 'x']), 2]],                         // lines above don't matter…
  [[R('arith', ['a\\coloneq1', 'x']), 1], [R('arith', ['a\\coloneq1', '9', 'x']), 2]],           // …except := lines
];
export const LINE_KEY_DIFFERENT = [
  [[R('arith', ['a\\coloneq1', 'x']), 1], [R('arith', ['a\\coloneq2', 'x']), 1]],                // a different :=
  [[R('arith', ['1', '\\mathrm{ans}']), 1], [R('arith', ['2', '\\mathrm{ans}']), 1]],            // ans: everything above
  [[R('arith', ['x']), 0], [R('full', ['x']), 0]],                                               // the mode
  [[R('arith', ['a:=1', 'x']), 1], [R('arith', ['a:=2', 'x']), 1]],                              // := typed as text
];
