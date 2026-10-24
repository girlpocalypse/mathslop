// The engine as the tests see it: S.<module>.<name>, named by the module each function will live in after
// the split (test/modules.mjs). Only this file reads sandbox.js's test hook; after the split it reads
// globalThis.MathslopEngine instead, and no test changes.
import { loadEngine } from './load.mjs';
import { ENGINE } from '../modules.mjs';

export function subjects(opts){
  const eng = loadEngine(opts), h = eng.hook, S = { numbers: {}, decimal: {}, lines: {}, protocol: eng };
  // Results come back as this realm's arrays and objects (the vm context has its own Array), so
  // assert.deepStrictEqual compares them as plain data.
  const plain = x => { try { return structuredClone(x); } catch { return x; } };
  for (const [name, [mod, reach]] of Object.entries(ENGINE)) {
    if (reach !== 'hook') continue;
    const v = h[name];
    S[mod][name] = typeof v === 'function' ? (...a) => plain(v(...a)) : v;
  }
  // sci() reports "nothing was rounded off" through sci.exact; after the split it returns it.
  S.numbers.sci = (r, s) => { const latex = h.sci(r, s); return { latex, exact: h.sci.exact }; };
  S.ce = () => new eng.CE();
  S.close = () => eng.close();
  return S;
}
