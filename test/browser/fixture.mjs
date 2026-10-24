// One Chromium per test file, a fresh panel per test. State is set the way a user's would be: saved
// settings in chrome.storage.local, then a reload (CLAUDE.md "Tests", rule: public controls only).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Browser } from './cdp.mjs';

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const KEY = 'mathslop.v1';

export function useBrowser(opts = {}){
  const ctx = { b: null };
  let started;
  ctx.started = () => started ??= Browser.start(opts).then(b => { ctx.b = b; return b; });
  ctx.cleanups = [];
  before(() => ctx.started());
  after(async () => { for (const f of ctx.cleanups) await f(); await ctx.b?.close(); });   // pages first, then Chromium
  return ctx;
}

// A panel tab with the given saved state ({ lines, mode, … } or null for a first run). Fails the test on
// any console error, exception or CSP violation unless allowErrors.
export async function panel(t, ctx, saved = { lines: [''], mode: 'off' }, { hook = false, allowErrors = false, before = '', fake } = {}){
  // fake: replace the engine frame with test/browser/fake-engine.html before it loads ({ auto: false } to keep it quiet)
  if (fake) before += `;new MutationObserver((ms, o) => { const f = document.getElementById('engine');
    if (f) { f.src = 'test/browser/fake-engine.html${fake.auto === false ? '?auto=0' : ''}'; o.disconnect(); } }).observe(document, { childList: true, subtree: true });`;
  const p = await ctx.b.openPanel({ hook, before });
  p.coverageName = t.name.replace(/\W+/g, '-').slice(0, 40);
  await p.ready();
  await storage(p, saved === null ? 'remove' : 'set', saved);
  await p.reload();
  await p.ready();
  t.after(async () => {
    const errs = p.errors();
    await p.close();
    if (!allowErrors) assert.deepEqual(errs, [], 'console errors');
  });
  return p;
}

// ---- reading the pad (no hook needed) ----
export const values = p => p.run(() => [...document.querySelectorAll('.row math-field')].map(f => f.value));
export const focused = p => p.run(() => [...document.querySelectorAll('.row math-field')].indexOf(document.activeElement));
// Each row's answer as shown: "= 5 ≈ 1.41", "[can't read]", "[took too long]" or ''.
export const answers = p => p.run(() => [...document.querySelectorAll('.row .res')].map(r =>
  r.querySelector('.mark') ? '[' + r.textContent.trim() + ']' : [...r.querySelectorAll('.part')].map(x => x.textContent.replace(/\s+/g, ' ').replace(/​/g, '').trim()).join(' | ')));
export const toastText = p => p.run(() => { const t = document.getElementById('toast'); return t.classList.contains('show') ? t.firstChild?.textContent || t.textContent : ''; });
export const savedState = p => storage(p, 'get');

// chrome.storage.local from the page, through callbacks, the result left in a global and polled.
export async function storage(p, op, value){
  const tag = '__st' + Math.random().toString(36).slice(2);
  await p.run((S, op, key, value, tag) => {
    const done = v => { globalThis[tag] = { v: v === undefined ? null : v }; };
    if (op === 'get') chrome.storage.local.get(key, o => done(o[key]));
    else if (op === 'remove') chrome.storage.local.remove(key, () => done(null));
    else chrome.storage.local.set({ [key]: value }, () => done(null));
  }, op, KEY, value ?? null, tag);
  return (await p.waitFor((S, tag) => globalThis[tag], { args: [tag], what: 'chrome.storage' })).v;
}

// Waits until the answers have stopped changing (debounce 220 ms + engine).
export async function settled(p, { quiet = 600, timeout = 10000 } = {}){
  await sleep(300);   // the 220 ms debounce first
  const t0 = Date.now(); let last = JSON.stringify(await answers(p)), since = Date.now();
  while (Date.now() - t0 < timeout) {
    await sleep(80);
    const now = JSON.stringify(await answers(p));
    if (now !== last) { last = now; since = Date.now(); }
    else if (Date.now() - since >= quiet) return JSON.parse(now);
  }
  return JSON.parse(last);
}

// Click into line i (0-based), then put the caret at its end (or start). The middle of the field: its right
// edge is the line's ☰ toggle.
export async function clickLine(p, i, where = 'end'){
  await p.click(`js:document.querySelectorAll('.row math-field')[${i}]`, { dx: 0.3 });
  await sleep(60);
  await p.key(where === 'end' ? 'End' : 'Home');
}

// One hooked panel for a whole file of pure-function tables (they don't change the pad).
export function sharedPanel(ctx, saved = { lines: [''], mode: 'off' }){
  const sp = { p: null };
  before(async () => {
    await ctx.started();
    sp.p = await ctx.b.openPanel({ hook: true });
    sp.p.coverageName = 'shared';
    await sp.p.ready();
    await storage(sp.p, 'set', saved);
    await sp.p.reload(); await sp.p.ready();
    await sp.p.waitFor(() => globalThis.S?.ready, { what: 'the test hook' });
  });
  ctx.cleanups.push(async () => { const errs = sp.p?.errors() || []; await sp.p?.close(); assert.deepEqual(errs, [], 'console errors'); });
  return sp;
}
