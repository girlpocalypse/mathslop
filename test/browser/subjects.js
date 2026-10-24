// The panel as the tests see it: S.<module>.<name>. Injected by test/browser/cdp.mjs before panel.js runs,
// right after `globalThis.__mathslopTest = {}`. Only this file reads panel.js's test hook; after the split into
// modules it imports panel.js's `app` instead, and no test changes. (Filled in with the panel hook.)
(() => {
  const T = () => globalThis.__mathslopTest.panel;
  globalThis.S = {
    get ready(){ return !!T(); },
  };
})();
