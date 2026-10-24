// Panel fuzzer (CLAUDE.md open item 4), in headless Chromium.
//   FUZZ_SEED=n FUZZ_ITERATIONS=n node test/fuzz/browser.fuzz.mjs [hostile|monkey|quota]
//   hostile  LaTeX built to exploit MathLive's renderer, imported and answered: nothing runs, nothing is fetched,
//            nothing navigates, nothing draws outside its line or over the header, ids stay unique, the panel
//            keeps answering
//   monkey   random keys, clicks, menus, keyboard presses and imports: no console errors, the pad stays
//            consistent, undo to the start and redo to the end round-trip, a reload keeps lines and settings
//   quota    chrome.storage.local nearly full: what a failed save does
// Findings go to coverage/fuzz/browser-<seed>.json. Exit 1 if any.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Browser } from '../browser/cdp.mjs';
import { storage, values, answers, toastText, sleep } from '../browser/fixture.mjs';
import { rng, ITERATIONS } from './rng.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const r = rng(), findings = [], which = process.argv[2];
const find = (kind, detail) => { findings.push({ kind, ...detail }); console.log(`✖ ${kind}: ${JSON.stringify(detail).slice(0, 400)}`); };

const b = await Browser.start();
let dialogs = 0;
b.on(m => { if (m.method === 'Page.javascriptDialogOpening') { dialogs++; b.send('Page.handleJavaScriptDialog', { accept: false }, m.sessionId).catch(() => {}); } });

async function open(saved){
  const p = await b.openPanel({ hook: false });
  await p.ready();
  if (saved !== undefined) { await storage(p, 'set', saved); p.since = p.log.length; await p.reload(); await p.ready(); }
  return p;
}
// Every element of a line (in its math-field's shadow root and its answer) is drawn inside the line, and
// nothing covers the header; ids are unique.
const layout = p => p.run(() => {
  const bad = [], head = document.querySelector('header').getBoundingClientRect();
  for (const row of document.querySelectorAll('.row')) {
    const box = row.getBoundingClientRect();
    const els = [...row.querySelector('math-field').shadowRoot.querySelectorAll('*'), ...row.querySelectorAll('.res *')];
    for (const el of els) {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const pos = getComputedStyle(el).position;
      if (pos === 'fixed' || r.top < box.top - 4 || r.bottom > box.bottom + 4) bad.push({ line: row.querySelector('.num').textContent, tag: el.tagName, cls: String(el.className).slice(0, 40), pos, top: Math.round(r.top), bottom: Math.round(r.bottom), row: [Math.round(box.top), Math.round(box.bottom)] });
      if (r.bottom > head.top && r.top < head.bottom && pos === 'fixed') bad.push({ overHeader: true, tag: el.tagName });
    }
  }
  const ids = [...document.querySelectorAll('[id]')].map(e => e.id), dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  return { bad: bad.slice(0, 5), nbad: bad.length, dup };
});
async function responsive(p){ const t0 = Date.now(); await Promise.race([p.eval('1'), sleep(2000)]); return Date.now() - t0; }

// ---------------- hostile ----------------
const HOSTILE = [
  '\\href{javascript:alert(1)}{x}', '\\href{https://example.com/}{click}', '\\url{https://example.com/}',
  '\\htmlData{foo=bar}{x}', '\\class{row}{x}', '\\cssId{pad}{x}', '\\cssId{engine}{x}',
  '\\htmlStyle{position:fixed;inset:0;background:red}{x}', '\\htmlStyle{position:absolute;top:-500px}{x}',
  '\\enclose{circle}{x}', '\\colorbox{red}{x}', '\\fcolorbox{red}{blue}{x}', '\\boxed{x}', '\\rule{9999em}{9999em}',
  '\\text{<img src=x onerror=alert(1)>}', '\\text{<script>alert(1)</script>}', '\\mathrm{<b onmouseover=alert(1)>x</b>}',
  '\\color{red}x', '\\textcolor{#ff0000}{x}', '\\style{color:red}{x}', '\\unicode{x1F600}', '\\char"263A',
  '\\frac{'.repeat(500) + '1' + '}{2}'.repeat(500), '{'.repeat(10000) + 'x' + '}'.repeat(10000), 'x^'.repeat(2000) + 'x',
  'x'.repeat(200000), '\\sqrt{'.repeat(300) + '2' + '}'.repeat(300),
];
async function hostile(){
  console.log(`hostile: ${HOSTILE.length} payloads, one line each, in Algebra so answers render too`);
  for (const payload of HOSTILE) {
    const name = payload.slice(0, 60) + (payload.length > 60 ? `… (${payload.length} chars)` : '');
    const t0 = Date.now();
    const done = await Promise.race([one(payload, name).then(() => true), sleep(60000).then(() => false)]);
    console.log(`  ${done ? 'ok' : 'HUNG'} ${((Date.now() - t0) / 1000).toFixed(1)} s  ${name}`);
    if (!done) { find('the panel hung on a payload (60 s)', { payload: name }); break; }   // the browser is stuck: stop here
  }
}
async function one(payload, name){
  {
    const before = dialogs;
    const p = await open({ lines: ['1+1', payload, '2+2'], mode: 'full' });
    const url = await p.eval('location.href');
    await sleep(1500);
    const ms = await responsive(p);
    const lay = await layout(p).catch(e => ({ error: String(e) }));
    const out = p.net.filter(n => !/^(chrome-extension|data|about|blob):/.test(n.url));
    if (dialogs > before) find('a dialog opened', { payload: name });
    if (await p.eval('location.href') !== url) find('the panel navigated', { payload: name });
    if (out.length) find('a network request', { payload: name, urls: out.map(n => n.url).slice(0, 3) });
    if (ms >= 2000) find('the panel stopped answering', { payload: name, ms });
    if (lay.error || lay.nbad) find('drawn outside its line', { payload: name, ...lay });
    if (lay.dup?.length) find('duplicate ids', { payload: name, dup: lay.dup });
    const errs = p.errors({ since: p.since || 0 });   // not the boot with the previous payload still saved
    if (errs.length) find('console errors', { payload: name, errors: errs.slice(0, 3).map(e => e.text.slice(0, 150)) });
    await p.close();
  }
}

// ---------------- monkey ----------------
const CHARS = '0123456789+-*/^_()xyab=.:'.split('');
async function monkey(){
  const steps = Math.max(60, Math.floor(ITERATIONS / 2));
  console.log(`monkey: ${steps} random actions`);
  const p = await open({ lines: ['1+1', 'x^2', '\\frac{1}{3}'], mode: 'arith' });
  const log = [];
  const act = async () => {
    const k = r.pick(['char', 'char', 'char', 'char', 'key', 'key', 'click', 'answer', 'add', 'del', 'undo', 'redo', 'mode', 'import', 'menu', 'kbd']);
    log.push(k);
    switch (k) {
      case 'char': await p.type(r.pick(CHARS)); break;
      case 'key': await p.key(r.pick(['Enter', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Escape', 'Home', 'End'])); await sleep(70); break;
      case 'click': { const n = await p.run(() => document.querySelectorAll('.row').length); await p.click(`js:document.querySelectorAll('.row math-field')[${r.int(0, n - 1)}]`, { dx: 0.3 }); break; }
      case 'answer': if (await p.run(() => !!document.querySelector('.row .res .part'))) await p.click('.row .res .part', { shift: r.chance(0.2) }); break;
      case 'add': await p.click('.add'); break;
      case 'del': { const n = await p.run(() => document.querySelectorAll('.row').length); await p.click(`js:document.querySelectorAll('.row [data-a=del]')[${r.int(0, n - 1)}]`); break; }
      case 'undo': await p.key('z', { ctrl: true }); break;
      case 'redo': await p.key('y', { ctrl: true }); break;
      case 'mode': { await p.click(`.segrow [data-mode=${r.pick(['off', 'arith', 'full'])}]`); await sleep(60); if (await p.run(() => document.getElementById('ans-warn').open)) await p.click(r.chance(0.5) ? '#ans-ok' : '#ans-cancel'); break; }
      case 'import': { await p.click('#btn-menu'); await p.click('#btn-import'); await sleep(80);
        await p.run((S, t) => { document.getElementById('imp').value = t; }, Array.from({ length: r.int(1, 4) }, () => `${r.int(0, 99)}${r.pick(['+', '-', '\\cdot'])}${r.int(1, 9)}`).join('\n'));
        await p.click(r.pick(['#imp-ok', '#imp-append', '#imp-cancel'])); break; }
      case 'menu': await p.click('#btn-menu'); await sleep(40); await p.key('Escape'); break;
      case 'kbd': await p.click('#btn-kbd'); await sleep(200); break;
    }
    await sleep(r.int(40, 160));   // gaps a person leaves (less than ~60 ms after Enter/Backspace is a known issue)
  };
  const consistent = () => p.run(() => {
    const rows = [...document.querySelectorAll('.row')], n = rows.length;
    const nums = rows.map(r => r.querySelector('.num').textContent).join(','), want = rows.map((_, i) => i + 1).join(',');
    const labels = rows.every((r, i) => r.querySelector('math-field').getAttribute('aria-label') === 'Line ' + (i + 1));
    const count = document.getElementById('count').textContent === n + (n === 1 ? ' line' : ' lines');
    return n >= 1 && nums === want && labels && count ? null : { n, nums, labels, count };
  });
  for (let i = 0; i < steps; i++) {
    await act();
    if (await p.run(() => document.querySelector('dialog[open]')?.id)) { await p.key('Escape'); await sleep(60); }
    if (i % 10 === 9) { const bad = await consistent(); if (bad) { find('pad inconsistent', { step: i, last: log.slice(-10), bad }); break; } }
  }
  if (await p.run(() => window.mathVirtualKeyboard.visible)) { await p.click('#btn-kbd'); await sleep(200); }
  const errs = p.errors();
  if (errs.length) find('console errors', { errors: errs.slice(0, 5).map(e => e.text.slice(0, 200)), last: log.slice(-15) });
  // undo to the start, redo to the end
  await p.click('h1'); await sleep(100);
  const end = await values(p);
  let undos = 0;
  for (; undos < 400; undos++) { await p.key('z', { ctrl: true }); await sleep(90); if (await toastText(p) === 'Nothing to undo') break; }
  for (let k = 0; k < undos + 5; k++) { await p.key('y', { ctrl: true }); await sleep(90); if (await toastText(p) === 'Nothing to redo') break; }
  const back = await values(p);
  if (JSON.stringify(back) !== JSON.stringify(end)) find('undo then redo doesn\'t round-trip', { undos, end, back, actions: log.join(' ') });
  // a reload keeps lines and settings
  await sleep(500);
  const state = await storage(p, 'get');
  await p.reload(); await p.ready();
  const after = await values(p);
  if (JSON.stringify(after) !== JSON.stringify(state.lines.length ? state.lines : [''])) find('reload lost lines', { saved: state.lines, after });
  if (JSON.stringify(after) !== JSON.stringify(back)) find('saved lines differ from the pad', { pad: back, after });
  await p.close();
  console.log(`monkey: ${steps} actions, ${undos} undo steps`);
}

// ---------------- quota ----------------
async function quota(){
  const p = await open({ lines: ['1'], mode: 'off' });
  const q = await p.eval('chrome.storage.local.QUOTA_BYTES');
  // fill storage to just under the quota, then make the pad save
  await p.run((S, n) => new Promise(res => chrome.storage.local.set({ filler: 'x'.repeat(n) }, res)), q - 2000);
  const since = p.log.length;
  await p.click('js:document.querySelector(".row math-field")', { dx: 0.3 }); await p.key('End');
  await p.type('2'.repeat(10)); await sleep(150);
  await p.run(() => { const f = document.querySelector('.row math-field'); f.setValue('1'.repeat(5000)); f.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(600);
  const errs = p.errors({ since });
  const saved = await storage(p, 'get');
  console.log(`quota: ${q} bytes; after a save that doesn't fit: console errors ${errs.length}, saved line length ${saved?.lines?.[0]?.length}`);
  if (errs.length) find('a failed save is an unhandled error', { errors: errs.map(e => e.text.slice(0, 200)) });
  if (!errs.length && saved?.lines?.[0]?.length !== 5000) find('a failed save is silent', { savedLength: saved?.lines?.[0]?.length });
  await p.run(() => new Promise(res => chrome.storage.local.remove('filler', res)));
  await p.close();
}

console.log(`browser fuzz: seed ${r.seed}`);
try {
  if (!which || which === 'hostile') await hostile();
  if (!which || which === 'monkey') await monkey();
  if (!which || which === 'quota') await quota();
} finally { await b.close(); }
const dir = path.join(ROOT, 'coverage', 'fuzz'); fs.mkdirSync(dir, { recursive: true });
if (findings.length) fs.writeFileSync(path.join(dir, `browser-${r.seed}.json`), JSON.stringify(findings, null, 1));
console.log(`\nbrowser fuzz: ${findings.length} finding(s), seed ${r.seed}` + (findings.length ? ` → coverage/fuzz/browser-${r.seed}.json` : ''));
process.exit(findings.length ? 1 : 0);
