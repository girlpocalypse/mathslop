// The panel as the tests see it: S.<module>.<name>, named by the module each name will live in after the
// split (test/modules.mjs, injected as __mathslopModules). Injected by test/browser/cdp.mjs before panel.js
// runs, right after `globalThis.__mathslopTest = {}`. Only this file reads panel.js's test hook; after the split
// it imports panel.js's `app` instead, and no test changes.
(() => {
  const T = () => globalThis.__mathslopTest.panel;
  const map = globalThis.__mathslopModules || {};
  const S = globalThis.S = { get ready(){ return !!T(); } };
  for (const [name, [mod, reach]] of Object.entries(map)) {
    if (reach !== 'hook') continue;
    S[mod] ??= {};
    Object.defineProperty(S[mod], name, { enumerable: true, configurable: true, get: () => T()[name] });   // live, not copied
  }
  for (const m of ['settings', 'latex', 'keycaps', 'colors', 'history', 'bridge', 'answers', 'toast', 'focus', 'pad', 'controls']) S[m] ??= {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // answerParts(res, order): today it reads the order setting; the split passes it in. Shimmed through the select.
  Object.defineProperty(S.latex, 'answerParts', { enumerable: true, value: (res, order = T().order) => {
    if (order === T().order) return T().answerParts(res);
    const sel = document.getElementById('opt-order'), was = sel.value;
    sel.value = order; sel.dispatchEvent(new Event('change'));
    try { return T().answerParts(res); } finally { sel.value = was; sel.dispatchEvent(new Event('change')); }
  } });
  // Nothing waiting: the debounce has fired and every request has its result.
  S.bridge.idle = async (quiet = 300, timeout = 8000) => {
    const t0 = Date.now(); let id = T().reqId, since = Date.now();
    while (Date.now() - t0 < timeout) {
      await sleep(40);
      if (T().reqId !== id) { id = T().reqId; since = Date.now(); continue; }
      if (T().inflight.size === 0 && Date.now() - since >= quiet) return true;
    }
    return false;
  };
  S.sleep = sleep;
})();
