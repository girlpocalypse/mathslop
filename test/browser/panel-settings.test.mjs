// panel settings: what's saved, what's restored, and how bad saved data falls back (CLAUDE.md "Storage").
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { useBrowser, panel, values, savedState, clickLine, sleep } from './fixture.mjs';
import { ROOT } from './cdp.mjs';

const ctx = useBrowser();
const ui = p => p.run(() => ({
  mode: document.querySelector('.segrow [aria-pressed=true]')?.dataset.mode,
  angle: document.querySelector('[data-angle][aria-pressed=true]')?.dataset.angle,
  places: document.getElementById('opt-places').value, order: document.getElementById('opt-order').value,
  colors: document.getElementById('btn-colors').getAttribute('aria-pressed'),
  lines: document.querySelectorAll('.row').length,
}));
const DEFAULTS = { mode: 'off', angle: 'rad', places: 'auto', order: 'exact', colors: 'false' };

describe('saving', () => {
  test('an edit saves all 8 fields after the debounce', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' });
    await clickLine(p, 0); await p.type('2'); await sleep(400);
    assert.deepEqual(await savedState(p), { lines: ['12'], mode: 'off', varColors: false, angle: 'rad', places: 'auto', order: 'exact', copyFmt: 'latex', copyAns: true });
  });
});

describe('restoring bad or old saved data', () => {
  for (const [name, saved, want] of [
    ['an unknown mode → Off', { lines: ['1'], mode: 'bogus' }, { mode: 'off' }],
    ['places outside the list → auto', { lines: ['1'], mode: 'arith', places: 7 }, { places: 'auto', mode: 'arith' }],
    ['places as a string → auto', { lines: ['1'], mode: 'arith', places: '2' }, { places: 'auto' }],
    ['other angle, order → defaults', { lines: ['1'], angle: 'grad', order: 'sideways' }, { angle: 'rad', order: 'exact' }],
    ['an older shape: lines and mode only', { lines: ['1', '2'], mode: 'full' }, { mode: 'full', lines: 2, colors: 'false', angle: 'rad', places: 'auto' }],
    ['no lines → the sample pad', { mode: 'off' }, { lines: 11 }],
    ['empty lines → the sample pad', { lines: [], mode: 'off' }, { lines: 11 }],
    ['one empty line stays one empty line', { lines: [''], mode: 'off' }, { lines: 1 }],
  ]) test(name, async t => {
    const p = await panel(t, ctx, saved);
    const got = await ui(p);
    for (const [k, v] of Object.entries({ ...DEFAULTS, ...want })) if (k in want || !(k in saved)) assert.equal(got[k], v, k);
  });
  test('missing copy settings: LaTeX with answers', async t => {
    const p = await panel(t, ctx, { lines: ['1+1'], mode: 'arith' });
    await p.click('#btn-menu'); await p.click('#btn-export'); await sleep(100);
    assert.deepEqual(await p.run(() => [document.querySelector('#exp [data-fmt][aria-pressed=true]').dataset.fmt, document.getElementById('exp-ans').checked]), ['latex', true]);
  });
  test('storage that fails to load → defaults and the sample pad', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'arith' }, { allowErrors: true,
      before: 'chrome.storage.local.get = () => Promise.reject(new Error("broken"));' });
    const got = await ui(p);
    assert.equal(got.mode, 'off'); assert.equal(got.lines, 11);
  });
});

describe('outside the extension', () => {
  test('panel.html from file:// keeps the pad in localStorage', async () => {
    const p = await ctx.b.openPage('file://' + path.join(ROOT, 'panel.html'));
    try {
      await p.ready();
      await p.run(() => { localStorage.clear(); });
      await p.reload(); await p.ready();
      await p.click('js:document.querySelector(".row math-field")', { dx: 0.3 }); await sleep(60);
      await p.key('a', { ctrl: true }); await p.key('Backspace'); await p.type('7'); await sleep(400);
      assert.equal(await p.run(() => JSON.parse(localStorage.getItem('mathslop.v1')).lines[0]), '7');
      await p.reload(); await p.ready();
      assert.equal((await values(p))[0], '7');
    } finally { await p.close(); }
  });
});
