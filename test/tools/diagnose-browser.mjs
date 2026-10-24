// What the test browser sees, for when browser tests fail on a new machine or browser build:
//   node test/tools/diagnose-browser.mjs
// Prints the browser version, the extension's targets, the chrome.* APIs its worker and panel get, and the
// panel's state after loading. Exits 1 if the panel doesn't boot.
import { Browser } from '../browser/cdp.mjs';

const b = await Browser.start();
let ok = false;
try {
  console.log('browser:', (await b.send('Browser.getVersion')).product);
  console.log('targets:', (await b.targets()).map(t => `${t.type} ${t.url}`));
  const sw = await b.serviceWorker();
  console.log('worker chrome.*:', await sw.eval('Object.keys(globalThis.chrome || {}).join(" ")'));
  const p = await b.openPage(await b.panelUrl());
  await new Promise(r => setTimeout(r, 4000));
  const state = await p.eval(`({ chrome: Object.keys(globalThis.chrome || {}).join(' '), MathfieldElement: typeof MathfieldElement,
    rows: document.querySelectorAll('.row').length, status: document.getElementById('status')?.textContent,
    body: document.body.innerText.slice(0, 200) })`);
  console.log('panel:', state);
  console.log('panel console:', p.log.slice(0, 10));
  ok = state.rows > 0;
} finally { await b.close(); }
process.exit(ok ? 0 : 1);
