// Math engine, running inside the sandboxed page.
//
// Protocol (all messages via postMessage, parent <-> this frame):
//   parent -> engine  { type: 'ping' }
//   parent -> engine  { type: 'eval', id, mode: 'arith' | 'full', lines: [latex, ...] }
//   engine -> parent  { type: 'ready' } | { type: 'error', message }
//   engine -> parent  { type: 'result', id, results: [ null | { exact, approx, approxIsExact } ] }
//
// exact / approx are LaTeX strings (or null). The panel turns them into markup.
(() => {
  const CE = globalThis.ComputeEngine && globalThis.ComputeEngine.ComputeEngine;

  const REL = new Set(['Equal', 'NotEqual', 'Less', 'LessEqual', 'Greater', 'GreaterEqual', 'Assign',
    'Element', 'NotElement', 'Subset', 'SubsetEqual', 'Equivalent', 'Approx']);
  const norm = x => x.replace(/\s|\\,/g, '');

  function evalLine(ce, src, mode) {
    src = (src || '').trim();
    if (!src) return null;
    const e = ce.parse(src);
    // Unknowns are checked before evaluate(): letters assigned on earlier lines are already known.
    const numeric = (e.unknowns || []).length === 0;
    const val = e.evaluate();                       // always run, so ":=" lines take effect in every mode
    if (!(mode === 'full' || numeric)) return null;
    if (!e.isValid || REL.has(e.operator) || (val.has && val.has('Error'))) return null;

    const same = x => norm(x) === norm(src) || (norm(x) === norm(e.latex) && norm(e.latex) === norm(src));
    const exactL = val.latex, approxV = val.N();
    const exact = same(exactL) ? null : exactL;
    let approx = null;
    if (approxV.isNumberLiteral && approxV.latex !== exactL && !same(approxV.latex)) approx = approxV.latex;
    if (!exact && !approx) return null;
    return { exact, approx, approxIsExact: val.isRational === true };
  }

  function evalAll(lines, mode) {
    const ce = new CE();                             // fresh engine: assignments flow strictly top to bottom
    return lines.map(src => { try { return evalLine(ce, src, mode); } catch { return null; } });
  }

  function hello() {
    parent.postMessage(CE ? { type: 'ready' } : { type: 'error', message: 'Compute Engine did not load' }, '*');
  }

  window.addEventListener('message', ev => {
    if (ev.source !== parent) return;
    const m = ev.data || {};
    if (m.type === 'ping') return hello();
    if (m.type !== 'eval' || !CE || !Array.isArray(m.lines)) return;
    let results;
    try { results = evalAll(m.lines, m.mode); } catch { results = m.lines.map(() => null); }
    parent.postMessage({ type: 'result', id: m.id, results }, '*');
  });

  hello();
})();
