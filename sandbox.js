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
  // For telling an answer from the line as typed: MathLive writes \frac13, the engine \frac{1}{3}.
  // MathLive also writes \sin\left(1\right) where the engine writes \sin(1).
  const key = x => norm(x).replace(/\\(left|right)(?![a-zA-Z])/g, '').replace(/\\exponentialE/g, 'e').replace(/\\imaginaryI/g, 'i')
    .replace(/\{([0-9a-zA-Z])\}/g, '$1').replace(/[\^_]\{\}/g, '');   // and 2^{}, drawn as 2
  // Compute Engine 0.161 writes a float that happens to be whole as 3.0 (1.5·2) and 1.0\cdot10^{30}.
  const tidy = x => x.replace(/(\d)\.0+(?!\d|\\,)/g, '$1').replace(/(^|[+-])1\\imaginaryI/g, '$1\\imaginaryI');   // and 1i for (-1)^{0.5}
  const numOf = v => String(typeof v === 'object' && v ? v.num : v);

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
    const qs = String(q);
    if (/^10*$/.test(qs)) {                          // 10^{-70}: no need for the loops below
      const k = qs.length - 1, digits = String(p < 0n ? -p : p).replace(/0+$/, '');
      return digits.length <= PRECISION ? k : -1;
    }
    if (qs.length > 60) return -1;                   // and the loops below would get slow (q = 3·10^100000)
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
    let m = num / den; const rem = num % den; if (rem * 2n >= den) m++;
    sci.exact = rem === 0n;                                                      // nothing was rounded off
    if (String(m).length > s) { m /= 10n; e++; }                                // 9.99… rounded up to 10
    const d = String(m);
    return (p < 0n ? '-' : '') + grouped(d[0], d.slice(1)) + '\\cdot10^{' + e + '}';
  }
  function sciFloat(x, n){
    const [m, e] = x.toExponential(n).split('e'), [i, f] = m.split('.');
    return grouped(i, f || '') + '\\cdot10^{' + Number(e) + '}';
  }
  // A number the way MathJSON writes it beyond a double ("1.970…89e+434", "5.07…e-435") in scientific
  // notation, the mantissa rounded half away from zero to n decimals ('auto': the engine's digits).
  // null if it isn't in that form.
  function sciNum(num, n){
    const m = /^(-?)([1-9])(?:\.(\d*))?e([+-]?\d+)$/.exec(num);
    if (!m) return null;
    const d = m[2] + (m[3] || ''), k = n === 'auto' ? Math.min(d.length, PRECISION) : n + 1;
    let e = +m[4], r = BigInt(d.slice(0, k).padEnd(k, '0'));
    if ((d[k] || '0') >= '5') r++;
    let s = String(r);
    if (s.length > k) { s = s.slice(0, k); e++; }                                // 9.99… rounded up to 10
    if (n === 'auto') s = s.replace(/(?<=.)0+$/, '');
    return m[1] + grouped(s[0], s.slice(1)) + '\\cdot10^{' + e + '}';
  }
  // Significant digits and decimal places of a float's value, as the engine holds it in MathJSON
  // ({ num: "1.0000000000000000000000000000005e+30" } for 10^{30}+0.5), or null.
  function floatDigits(val){
    const m = /^-?(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/.exec(numOf(val.json));
    if (!m) return null;
    const frac = (m[2] || '').replace(/0+$/, '');
    const e = +(m[3] || 0), digits = BigInt(m[1] + frac), shift = frac.length - e;
    // and its exact value [p, q], for rounding it the same way as a rational (0.125 → 0.13)
    const r = Math.abs(shift) > 1000 ? null : shift > 0 ? [digits, 10n ** BigInt(shift)] : [digits * 10n ** BigInt(-shift), 1n];
    if (r && numOf(val.json).startsWith('-')) r[0] = -r[0];
    return { sig: (m[1] + frac).replace(/^0+/, '').replace(/0+$/, '').length, places: Math.max(0, shift), r };
  }
  // The same for a complex float, part by part (null if a part isn't a float).
  function floatParts(val){
    const j = val.json;
    if (!(Array.isArray(j) && j[0] === 'Complex')) return val.im === 0 ? floatDigits(val) : null;
    const [a, b] = [j[1], j[2]].map(x => floatDigits({ json: x }));
    return a && b ? { sig: Math.max(a.sig, b.sig), places: Math.max(a.places, b.places), r: null } : null;
  }
  // [p, q] for a value whose decimal is known exactly: a rational, or a float the engine holds fewer than
  // 16 significant digits of, which is rounded the same way (0.5·0.25 → 0.13).
  function exactValue(val){
    const r = rationalOf(val);
    if (r || !val.isNumberLiteral || val.isExact !== false || val.im !== 0) return r;
    const f = floatDigits(val);
    return f && f.sig < 16 ? f.r : null;
  }
  // The decimal answer: { latex, exact } where exact means "=" rather than "≈".
  // places 'auto' keeps Compute Engine's digits; a number rounds to that many places, except values
  // that would round to 0 (with places > 0) or are 10^15 or more, which get scientific notation.
  function decimal(ce, val, approxV, places, r = exactValue(val)){
    const auto = places === 'auto', aL = tidy(approxV.latex), j = approxV.json;
    // A complex value: each part by the rules below (\frac{1}{8}i ≈ 0.13i at 2 places, i·e^{1000}).
    if (Array.isArray(j) && j[0] === 'Complex') {
      const ps = ['Real', 'Imaginary'].map((op, k) => {
        let p = null, pa = null;
        try { p = ce.box([op, val]).evaluate(); pa = p.N(); } catch {}
        if (!(pa && pa.isNumberLiteral && pa.im === 0)) p = pa = ce.box(j[k + 1]);   // \sqrt{-2}: no exact parts
        return decimal(ce, p, pa, places);
      });
      const [re, im] = ps.map(d => /^-?0(\.0*)?$/.test(norm(d.latex)) ? null : d.latex);
      const imL = im === null ? null : (im === '1' ? '' : im === '-1' ? '-' : im) + '\\imaginaryI';
      return { latex: re && imL ? re + (imL.startsWith('-') ? '' : '+') + imL : re || imL || '0', exact: ps.every(d => d.exact) };
    }
    if (r) {
      const k = exactPlaces(r), a = r[0] < 0n ? -r[0] : r[0];
      if (k >= 0 && (auto || k <= places)) return { latex: k <= 20 ? fixed(r, k) : aL, exact: true };
      if (auto) {
        // 22/7 = 3.\overline{142857}, if the repetend Compute Engine finds in its digits really is p/q
        const rep = approxV.toLatex({ repeatingDecimal: 'vinculum' });
        if (rep.includes('\\overline')) {
          let back = null; try { back = rationalOf(ce.parse(rep).evaluate()); } catch {}
          if (sameRational(back, r)) return { latex: rep, exact: true };
        }
        return { latex: a < r[1] * 10n ** 21n ? aL : sci(r, PRECISION), exact: false };
      }
      const tiny = places > 0 && a !== 0n && 2n * a * 10n ** BigInt(places) < r[1], huge = a >= r[1] * 10n ** 15n;
      if (tiny || huge) { const l = sci(r, places + 1); return { latex: l, exact: sci.exact }; }   // 10^{-5} = 1.00·10^{-5}
      return { latex: fixed(r, places), exact: false };
    }
    // Beyond a double (e^{1000}) or underflowed to 0 (e^{-1000}): from the engine's own digits in MathJSON,
    // rounded like the rest.
    const x = Math.abs(approxV.re);
    if (!Number.isFinite(x) || x === 0) {
      const big = sciNum(numOf(j), places);
      return { latex: big === null ? aL : !auto && places === 0 && x === 0 ? '0' : big, exact: false };
    }
    if (auto) return { latex: aL, exact: false };
    if (x >= 1e15 || (places > 0 && x < 0.5 * 10 ** -places)) return { latex: sciFloat(approxV.re, places), exact: false };
    // The engine's digits rounded exactly, like a rational (its own toLatex writes 1.0 for 1.00).
    const f = floatDigits(approxV);
    return { latex: f && f.r ? fixed(f.r, places) : approxV.toLatex({ digits: { fractional: places } }), exact: false };
  }

  // A parse error's code ('missing', 'unexpected-command', …), or null when the line parsed but doesn't
  // make sense (\sin(\infty) is an 'incompatible-type' error): that's not a typo, so it gets no marker.
  function parseError(e){
    const err = (e.errors || [])[0];
    return (err && err.op1 && err.op1.string) || null;
  }

  // Names Compute Engine itself defines (Add, Sin, Pi…), looked up in an engine no line has touched.
  let library = null;
  const libraryHas = name => { library ??= new CE(); try { return !!library.lookupDefinition(name); } catch { return true; } };

  function evalLine(ce, src, m){
    // MathLive's dx shortcut writes \differentialD, which the engine reads in \int but not in \frac{d}{dx}.
    // And an empty ^{} or _{} (2^ then →) is drawn as nothing: 2^{}3 looks like 23, so it is 23.
    src = (src || '').trim().replace(/\\differentialD(?![a-zA-Z])/g, '\\mathrm{d}').replace(/[\^_]\{\}/g, '');
    if (!src) return null;
    const e = ce.parse(src);
    if (!e.isValid) { const code = parseError(e); return code ? { invalid: code } : null; }
    if (e.latex.includes('\\square')) return { invalid: 'missing' };   // typed log(100) is \log_{100}(\square)
    // Only a name of the user's own (x, price as \mathrm{price}, Δ) or a function f(x, y) can be given a value.
    // The parser reads a+b := 5 as a new definition of Add, and area := 12 (a·r·e·a) as one of the invisible
    // ×, which would change every line below it; π := 3 is quietly ignored.
    if (e.operator === 'Assign') {
      let nc = null; try { nc = ce.parse(src, { canonical: false }).json; } catch {}
      const name = Array.isArray(nc) && nc[0] === 'Assign' ? nc[1] : null, rhs = Array.isArray(nc) ? nc[2] : null;
      const params = Array.isArray(rhs) && rhs[0] === 'Function' ? rhs.slice(2) : [];
      if (typeof name === 'string' ? libraryHas(name) || !params.every(p => typeof p === 'string') : !(Array.isArray(name) && name[0] === 'Subscript'))
        return { invalid: 'assign' };
    }
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

    const same = x => key(x) === key(src);
    const exactL = tidy(val.latex), approxV = val.N();
    let exact = same(exactL) ? null : exactL;
    // Too long to show: a number like 10000!, or a radical over one (\sqrt{2^{2001}}).
    const tooLong = exactL.length > MAX_EXACT_NUMBER && (val.isNumberLiteral || /\d{100}/.test(norm(exactL)));
    if (tooLong) exact = null;
    let approx = null, approxIsExact = false;
    // An exact complex number with whole parts (2i, 1+3i) needs no decimal.
    const gaussian = val.operator === 'Complex' && Number.isInteger(val.re) && Number.isInteger(val.im);
    // No decimal for a value that already is one (5050, 0.3), unless it was too long to show.
    if (approxV.isNumberLiteral && !approxV.isNaN && !gaussian && (tooLong || tidy(approxV.latex) !== exactL)) {
      const d = decimal(ce, val, approxV, m.places);
      if (norm(d.latex) !== norm(exactL) && !same(d.latex)) { approx = d.latex; approxIsExact = d.exact; }
    }
    // A float result (√2.5, 1.5·2, 10^{30}+0.5) is "=" only if the engine has few enough digits of it that
    // nothing was rounded off: with 16 or more significant digits it has probably been rounded to the
    // engine's precision, so it's "≈". With Decimals set, one with more places than that is rounded.
    const fd = exact && val.isNumberLiteral && val.isExact === false ? floatParts(val) : null;
    if (fd && (fd.sig >= 16 || (m.places !== 'auto' && fd.places > m.places))) {
      const d = m.places === 'auto' ? { latex: exactL, exact: false } : decimal(ce, val, approxV, m.places);
      // (5·10^{-7} at 2 places is 5.00·10^{-7} exactly: only rounded off digits make it ≈)
      if (fd.sig >= 16 || norm(d.latex) !== norm(exactL)) { exact = null; approx = d.latex; approxIsExact = fd.sig < 16 && d.exact; }
    }
    // An exact form with a rounded float inside it (\frac{94.247…}{\pi} for \frac{180}{\pi}\arcsin(0.5)) isn't
    // exact: shown with ≈ when there's no decimal (1.581…x for \sqrt{2.5}x in Algebra), else not at all.
    if (exact && !val.isNumberLiteral && (norm(exactL).match(/\d+\.\d+/g) || []).some(n => n.replace('.', '').replace(/^0+/, '').length >= 16)) {
      if (!approx) { approx = exact; approxIsExact = false; }
      exact = null;
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
