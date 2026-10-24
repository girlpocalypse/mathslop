// Every top-level name in sandbox.js and panel.js, the module it will live in after the split into
// components (see CLAUDE.md "Tests"), and how the tests reach it:
//   'hook'          exported by the file's test hook and called directly through S.<module>.<name>
//   'via <what>'    reached through another name or the UI; not exported
// test/engine/modules.test.mjs and test/browser/panel-modules.test.mjs fail on a source name missing here,
// or on a 'hook' name the hook doesn't export. Add a new helper here when you write it.

export const ENGINE = {
  // engine/numbers.js
  PRECISION:       ['numbers', 'hook'],
  norm:            ['numbers', 'hook'],
  tidy:            ['numbers', 'hook'],
  numOf:           ['numbers', 'hook'],
  intOf:           ['numbers', 'hook'],
  rationalOf:      ['numbers', 'hook'],
  sameRational:    ['numbers', 'hook'],
  exactPlaces:     ['numbers', 'hook'],
  grouped:         ['numbers', 'hook'],
  fixed:           ['numbers', 'hook'],
  sci:             ['numbers', 'hook'],
  sciFloat:        ['numbers', 'hook'],
  sciNum:          ['numbers', 'hook'],
  floatDigits:     ['numbers', 'hook'],
  floatParts:      ['numbers', 'hook'],
  exactValue:      ['numbers', 'hook'],
  // engine/decimal.js
  decimal:         ['decimal', 'hook'],
  // engine/lines.js
  REL:             ['lines', 'hook'],
  MAX_EXACT_NUMBER:['lines', 'hook'],
  key:             ['lines', 'hook'],
  parseError:      ['lines', 'hook'],
  library:         ['lines', 'via libraryHas'],
  libraryHas:      ['lines', 'hook'],
  GREEK:           ['lines', 'hook'],
  CONSTANTS:       ['lines', 'hook'],
  assignable:      ['lines', 'hook'],
  evalLine:        ['lines', 'hook'],
  // sandbox.js (the protocol)
  CE:              ['protocol', 'via load.mjs (the ce option)'],
  LINE_MS:         ['protocol', 'via the slow-line canary'],
  job:             ['protocol', 'via the message handler'],
  gen:             ['protocol', 'via the message handler'],
  tick:            ['protocol', 'via the message handler'],
  start:           ['protocol', 'via the message handler'],
  next:            ['protocol', 'via the message handler'],
  step:            ['protocol', 'via the message handler'],
  hello:           ['protocol', 'via ping'],
};

// Top-level names declared directly in the body of a file's IIFE: function declarations and every
// declarator of a top-level const/let. A small scanner, enough for this code base: it skips strings,
// template literals, comments and regex literals, and tracks bracket depth.
export function topLevelNames(src){
  const names = [];
  let depth = 0, i = 0, prev = '';   // prev: last significant token, to tell a regex from a division
  const isId = c => /[A-Za-z0-9_$]/.test(c);
  const word = () => { const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i)); return m && m[0]; };
  let collecting = false;            // inside a top-level const/let declarator list
  let wantName = false;              // next identifier at this depth is a declared name
  const body = 2;                    // (() => {  /  (async () => {
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 2; continue; }
    if (c === '"' || c === "'") { const q = c; i++; while (src[i] !== q) i += src[i] === '\\' ? 2 : 1; i++; prev = 'x'; continue; }
    if (c === '`') {
      i++;
      while (src[i] !== '`') {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') { let d = 1; i += 2; while (d) { if (src[i] === '{') d++; else if (src[i] === '}') d--; i++; } continue; }
        i++;
      }
      i++; prev = 'x'; continue;
    }
    if (c === '/' && (/[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || prev === '' || prev === 'return')) {
      i++; let cls = false;
      while (src[i] !== '/' || cls) { if (src[i] === '\\') i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; i++; }
      i++; while (isId(src[i] || '')) i++;
      prev = 'x'; continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    if ('([{'.includes(c)) { depth++; i++; prev = c; continue; }
    if (')]}'.includes(c)) { depth--; i++; prev = c; continue; }
    const w = isId(c) ? word() : null;
    if (w) {
      if (depth === body) {
        if (w === 'function') { i += w.length; const m = /^\s*([A-Za-z_$][\w$]*)/.exec(src.slice(i)); names.push(m[1]); prev = 'x'; continue; }
        if (w === 'const' || w === 'let') { collecting = true; wantName = true; i += w.length; prev = 'x'; continue; }
        if (collecting && wantName) { names.push(w); wantName = false; }
      }
      i += w.length; prev = w === 'return' ? 'return' : 'x'; continue;
    }
    if (depth === body && collecting) {
      if (c === ',') wantName = true;
      if (c === ';') collecting = wantName = false;
    }
    prev = c; i++;
  }
  return names;
}
