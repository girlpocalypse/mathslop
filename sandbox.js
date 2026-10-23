// Math engine, running inside the sandboxed page.
//
// Protocol (all messages via postMessage, parent <-> this frame):
//   parent -> engine  { type: 'ping' }
//   parent -> engine  { type: 'eval', id, mode: 'arith' | 'full', lines: [latex, ...],
//                       angle: 'rad' | 'deg', places: 'auto' | n, skip: [index, ...] }
//   engine -> parent  { type: 'ready' } | { type: 'error', message }
//   engine -> parent  { type: 'progress', id, line }     just before each line is worked out
//   engine -> parent  { type: 'line', id, line, result } as soon as one line's answer is known
//   engine -> parent  { type: 'result', id, results: [ null | { invalid: code } | { slow: true }
//                                                     | { exact, approx, approxIsExact, group } ] }
//
// exact / approx are LaTeX strings (or null). The panel turns them into markup.
// `skip` lines are not evaluated (the panel remembers lines that took too long).
// `progress` lets the panel tell which line hung if this frame stops answering.
// A new 'eval' replaces the one being worked on, which then gets no reply.
(() => {
  const CE = globalThis.ComputeEngine && globalThis.ComputeEngine.ComputeEngine;

  const LINE_MS = 1500;          // a line that takes longer gets { slow: true }
  const MAX_EXACT_NUMBER = 200;  // longer exact numbers (10000!) are shown as a decimal only
  const PRECISION = 21;          // significant digits Compute Engine shows by default

  const REL = new Set(['Equal', 'NotEqual', 'Less', 'LessEqual', 'Greater', 'GreaterEqual', 'Assign',
    'Element', 'NotElement', 'Subset', 'SubsetEqual', 'NotSubset', 'Superset', 'SupersetEqual', 'NotSuperset',
    'Equivalent', 'Approx', 'Divides', 'Congruent']);
  const norm = x => x.replace(/\s|\\,/g, '');

  // [p, q] for an exact rational value, as BigInts. MathJSON writes big integers as
  // { num: "28462…008e+2499" } and small ones as plain numbers.
  function intOf(x){
    const m = /^(-?)(\d+)(?:\.(\d*))?(?:e\+?(\d+))?$/.exec(String(typeof x === 'object' && x ? x.num : x));
    if (!m || /[1-9]/.test(m[3] || '')) throw new Error('not an integer');
    return BigInt(m[1] + m[2]) * 10n ** BigInt(m[4] || 0);
  }
  function rationalOf(val){
    if (val.isRational !== true) return null;
    try {
      const j = val.json;
      if (!Array.isArray(j)) return [intOf(j), 1n];
      return j[0] === 'Rational' ? [intOf(j[1]), intOf(j[2])] : null;
    } catch { return null; }
  }
  const sameRational = (a, b) => !!(a && b) && a[0] * b[1] === b[0] * a[1];
  // Decimal places of p/q when its decimal ends and fits in the digits shown, else -1.
  function exactPlaces([p, q]){
    if (String(q).length > 60) return -1;            // and the loops below would get slow (q = 10^100000)
    let d = q, a = 0, b = 0;
    while (d % 2n === 0n) { d /= 2n; a++; }
    while (d % 5n === 0n) { d /= 5n; b++; }
    if (d !== 1n) return -1;
    const k = Math.max(a, b), digits = String((p < 0n ? -p : p) * 10n ** BigInt(k) / q).replace(/0+$/, '');
    return digits.length <= PRECISION ? k : -1;
  }
  // Digits laid out the way Compute Engine does it: 5\,050.123\,4
  const grouped = (int, frac) => int.replace(/\B(?=(\d{3})+$)/g, '\\,') + (frac ? '.' + frac.replace(/(\d{3})(?=\d)/g, '$1\\,') : '');
  // p/q rounded half away from zero (1/8 → 0.13) to n places, exactly.
  function fixed([p, q], n){
    const a = (p < 0n ? -p : p) * 10n ** BigInt(n);
    let m = a / q; if ((a % q) * 2n >= q) m++;
    const d = String(m).padStart(n + 1, '0');
    return (p < 0n && m ? '-' : '') + grouped(d.slice(0, d.length - n), d.slice(d.length - n));
  }
  // p/q in scientific notation with s significant digits.
  function sci([p, q], s){
    const a = p < 0n ? -p : p;
    let e = String(a).length - String(q).length;
    if (e >= 0 ? a < q * 10n ** BigInt(e) : a * 10n ** BigInt(-e) < q) e--;    // 10^e <= a/q < 10^(e+1)
    const k = s - 1 - e, num = k >= 0 ? a * 10n ** BigInt(k) : a, den = k >= 0 ? q : q * 10n ** BigInt(-k);
    let m = num / den; if ((num % den) * 2n >= den) m++;
    if (String(m).length > s) { m /= 10n; e++; }                                // 9.99… rounded up to 10
    const d = String(m);
    return (p < 0n ? '-' : '') + grouped(d[0], d.slice(1)) + '\\cdot10^{' + e + '}';
  }
  function sciFloat(x, n){
    const [m, e] = x.toExponential(n).split('e'), [i, f] = m.split('.');
    return grouped(i, f || '') + '\\cdot10^{' + Number(e) + '}';
  }
  // The decimal answer: { latex, exact } where exact means "=" rather than "≈".
  // places 'auto' keeps Compute Engine's digits; a number rounds to that many places, except values
  // that would round to 0 (with places > 0) or are 10^15 or more, which get scientific notation.
  function decimal(ce, val, approxV, places){
    const auto = places === 'auto', r = rationalOf(val), x = Math.abs(approxV.re);
    if (r) {
      const k = exactPlaces(r), a = r[0] < 0n ? -r[0] : r[0];
      if (k >= 0 && (auto || k <= places)) return { latex: k <= 20 ? fixed(r, k) : approxV.latex, exact: true };
      if (auto) {
        // 22/7 = 3.\overline{142857}, if the repetend Compute Engine finds in its digits really is p/q
        const rep = approxV.toLatex({ repeatingDecimal: 'vinculum' });
        if (rep.includes('\\overline')) {
          let back = null; try { back = rationalOf(ce.parse(rep).evaluate()); } catch {}
          if (sameRational(back, r)) return { latex: rep, exact: true };
        }
        return { latex: a < r[1] * 10n ** 21n ? approxV.latex : sci(r, PRECISION), exact: false };
      }
      const tiny = places > 0 && a !== 0n && 2n * a * 10n ** BigInt(places) < r[1], huge = a >= r[1] * 10n ** 15n;
      return { latex: tiny || huge ? sci(r, places + 1) : fixed(r, places), exact: false };
    }
    // Beyond a double (e^{1000}) or below one (10^{-400}): Compute Engine's own scientific form.
    if (auto || !Number.isFinite(x) || (x === 0 && norm(approxV.latex) !== '0')) return { latex: approxV.latex, exact: false };
    if (approxV.im === 0 && (x >= 1e15 || (places > 0 && x < 0.5 * 10 ** -places))) return { latex: sciFloat(approxV.re, places), exact: false };
    return { latex: approxV.toLatex({ digits: { fractional: places } }), exact: false };
  }

  // A parse error's code ('missing', 'unexpected-command', …), or null when the line parsed but doesn't
  // make sense (\sin(\infty) is an 'incompatible-type' error): that's not a typo, so it gets no marker.
  function parseError(e){
    const err = (e.errors || [])[0];
    return (err && err.op1 && err.op1.string) || null;
  }

  function evalLine(ce, src, m){
    src = (src || '').trim();
    if (!src) return null;
    const e = ce.parse(src);
    if (!e.isValid) { const code = parseError(e); return code ? { invalid: code } : null; }
    // Unknowns are checked before evaluate(): letters assigned on earlier lines are already known.
    // For a := line, only its right-hand side counts (the letter being assigned is new).
    const numeric = ((e.operator === 'Assign' ? e.op2 : e)?.unknowns || []).length === 0;
    const val = e.evaluate();                       // always run, so ":=" lines take effect in every mode
    if (!(m.mode === 'full' || numeric) || (val.has && val.has('Error'))) return null;
    const bool = val.symbol === 'True' || val.symbol === 'False';
    // ans is the value of the nearest line above that has one (a := line counts, with its value).
    if ((e.operator === 'Assign' || !REL.has(e.operator)) && val.operator !== 'Function' && !bool) {
      try { ce.assign('ans', val); } catch {}
    }
    if (REL.has(e.operator) || bool) return null;   // relations (and other true/false lines) get no answer

    const same = x => norm(x) === norm(src) || (norm(x) === norm(e.latex) && norm(e.latex) === norm(src));
    const exactL = val.latex, approxV = val.N();
    let exact = same(exactL) ? null : exactL;
    const tooLong = val.isNumberLiteral && exactL.length > MAX_EXACT_NUMBER;
    if (tooLong) exact = null;
    let approx = null, approxIsExact = false;
    // No decimal for a value that already is one (5050, 0.3), unless it was too long to show.
    if (approxV.isNumberLiteral && (tooLong || approxV.latex !== exactL)) {
      const d = decimal(ce, val, approxV, m.places);
      if (norm(d.latex) !== norm(exactL) && !same(d.latex)) { approx = d.latex; approxIsExact = d.exact; }
    }
    // A decimal result (100·1.07^{10}) with more places than Decimals asks for is shown rounded instead.
    const dec = norm(exactL).match(/^-?\d+(?:\.(\d+))?$/);
    if (exact && m.places !== 'auto' && val.isNumberLiteral && val.im === 0 && !rationalOf(val) && !(dec && (dec[1] || '').length <= m.places)) {
      const d = decimal(ce, val, approxV, m.places);
      if (norm(d.latex) !== norm(exactL)) { exact = null; approx = d.latex; approxIsExact = false; }
    }
    if (!exact && !approx) return null;
    // group: a sum, a complex number or something negative, which needs brackets in another line.
    const group = ['Add', 'Subtract', 'Negate'].includes(val.operator) || exactL.startsWith('-') ||
      (val.operator === 'Complex' && val.re !== 0);
    return { exact, approx, approxIsExact, group };
  }

  // One request at a time, one line per task. Messages from this frame only reach the panel when the
  // task that posted them ends, so 'progress' for a line is posted, then the frame yields, then the line
  // is worked out: if it hangs, the panel already knows which line it is. A newer request replaces the
  // current one between lines.
  let job = null, gen = 0;
  const tick = new MessageChannel();              // each tick carries its job's gen; a replaced job's ticks stop
  tick.port1.onmessage = step;
  function start(m){
    const ce = new CE();                             // fresh engine: assignments flow strictly top to bottom
    if (m.angle === 'deg') ce.angularUnit = 'deg';
    const places = Number.isInteger(m.places) && m.places >= 0 && m.places <= 20 ? m.places : 'auto';
    job = { m, ce, gen: ++gen, opts: { mode: m.mode, places }, skip: new Set(Array.isArray(m.skip) ? m.skip : []), results: [] };
    next();
  }
  function next(){
    const j = job, i = j.results.length;
    if (i < j.m.lines.length && !j.skip.has(i)) parent.postMessage({ type: 'progress', id: j.m.id, line: i }, '*');
    tick.port2.postMessage(j.gen);
  }
  function step(ev){
    const j = job; if (!j || ev.data !== j.gen) return;
    const i = j.results.length;
    if (i === j.m.lines.length) {
      job = null;
      parent.postMessage({ type: 'result', id: j.m.id, results: j.results }, '*');
      return;
    }
    let r = null;
    if (!j.skip.has(i)) {
      try { r = j.ce.withTimeLimit({ ms: LINE_MS, label: 'mathslop:line' }, () => evalLine(j.ce, j.m.lines[i], j.opts)); }
      catch (err) { r = err && err.cause === 'timeout' ? { slow: true } : null; }   // not 'recursion-depth-exceeded'
    }
    j.results.push(r);
    parent.postMessage({ type: 'line', id: j.m.id, line: i, result: r }, '*');
    next();
  }

  function hello(){
    parent.postMessage(CE ? { type: 'ready' } : { type: 'error', message: 'Compute Engine did not load' }, '*');
  }

  window.addEventListener('message', ev => {
    if (ev.source !== parent) return;
    const m = ev.data || {};
    if (m.type === 'ping') return hello();
    if (m.type !== 'eval' || !CE || !Array.isArray(m.lines)) return;
    try { start(m); } catch { parent.postMessage({ type: 'result', id: m.id, results: m.lines.map(() => null) }, '*'); }
  });

  hello();
})();
