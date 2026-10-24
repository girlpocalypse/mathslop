// End to end: MathLive's own menu in a line (☰ or right-click), and the side panel's service worker.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser, panel, values, toastText, clickLine, sleep } from './fixture.mjs';
import { Browser } from './cdp.mjs';

const ctx = useBrowser();
const field = i => `document.querySelectorAll('.row math-field')[${i}]`;
const menuOpen = p => p.run(() => [...document.querySelectorAll('.row math-field')].some(f => f.shadowRoot?.querySelector('.ui-menu-container')));
async function rightClick(p, i){
  const [x, y] = await p.point('js:' + field(i), { dx: 0.3 });
  await p.mouse('mouseMoved', x, y);
  await p.mouse('mousePressed', x, y, { button: 'right' });
  await p.mouse('mouseReleased', x, y, { button: 'right' });
  await sleep(250);
}

describe('the menu in a line', () => {
  test('the line\'s ☰ opens it and a click elsewhere closes it (☰ hidden with color, not opacity)', async t => {
    const p = await panel(t, ctx, { lines: ['1', '2'], mode: 'off' });
    await clickLine(p, 0);
    const style = await p.run(() => { const g = getComputedStyle(document.querySelectorAll('.row math-field')[1].shadowRoot.querySelector('[part=menu-toggle]')); return { opacity: g.opacity, color: g.color }; });
    assert.equal(style.opacity, '1', 'opacity would trap MathLive\'s dismiss layer');
    assert.equal(style.color, 'rgba(0, 0, 0, 0)', 'hidden with a transparent color on a line without focus');
    await p.click(`js:${field(0)}.shadowRoot.querySelector('[part=menu-toggle]')`); await sleep(250);
    assert.equal(await menuOpen(p), true);
    await p.click('h1'); await sleep(250);
    assert.equal(await menuOpen(p), false);
  });
  test('the line\'s ☰ shows on hover and turns brighter under the pointer (r3-9)', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' });
    const color = () => p.run(() => getComputedStyle(document.querySelector('.row math-field').shadowRoot.querySelector('[part=menu-toggle]')).color);
    const [x, y] = await p.point('js:document.querySelector(".row math-field").shadowRoot.querySelector("[part=menu-toggle]")');
    await p.mouse('mouseMoved', 5, 5); await sleep(300);
    const off = await color();
    await p.mouse('mouseMoved', x, y); await sleep(400);
    const on = await color();
    assert.equal(off, 'rgba(0, 0, 0, 0)');
    assert.notEqual(on, off);
    assert.doesNotMatch(on, /rgba\(.*, 0\)$/, 'visible under the pointer');
  });
  test('a right-click opens it; Esc closes it and doesn\'t count toward Esc Esc', async t => {
    const p = await panel(t, ctx, { lines: ['1', '2'], mode: 'off' });
    await rightClick(p, 1);
    assert.equal(await menuOpen(p), true);
    await p.key('Escape'); await sleep(150);
    assert.equal(await menuOpen(p), false);
    await p.key('Escape'); await sleep(50); await p.key('Escape'); await sleep(150);
    assert.deepEqual(await values(p), ['1', '2'], 'the pad is not cleared');
  });
  test('with a menu open, Ctrl+Z only asks to close it, and the menu still works afterwards', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' });
    await clickLine(p, 0); await p.type('2'); await sleep(100);
    await rightClick(p, 0);
    await p.key('z', { ctrl: true }); await sleep(100);
    assert.equal(await toastText(p), 'Close the menu in the line first');
    assert.deepEqual(await values(p), ['12']);
    await p.key('Escape'); await sleep(200);
    await rightClick(p, 0);
    assert.equal(await menuOpen(p), true, 'a later right-click still opens a menu');
    await p.key('Escape'); await sleep(200);
    const scroll = await p.run(() => [getComputedStyle(document.documentElement).overflow, getComputedStyle(document.body).overflow]);
    assert.ok(!scroll.includes('hidden'), 'the page still scrolls: ' + scroll);
    assert.deepEqual(p.errors(), [], 'no showPopover InvalidStateError');
  });
});

describe('side panel', () => {
  test('the toolbar icon opens the side panel, after install and after a restart', async () => {
    const b = await Browser.start(), profile = b.chrome.profile;
    // The worker may still be starting (caught paused by the harness), so give onInstalled/onStartup a moment.
    const behaviour = async br => {
      const sw = await br.serviceWorker(); let v;
      for (let i = 0; i < 50; i++) { v = await sw.eval('chrome.sidePanel.getPanelBehavior()'); if (v.openPanelOnActionClick) break; await sleep(100); }
      return v;
    };
    try {
      assert.deepEqual(await behaviour(b), { openPanelOnActionClick: true }, 'onInstalled');
      await b.close({ keepProfile: true });
      const b2 = await Browser.start({ profile });   // the same profile: Chrome restarted, onStartup
      try { assert.deepEqual(await behaviour(b2), { openPanelOnActionClick: true }, 'onStartup'); }
      finally { await b2.close(); }
    } finally {
      await b.close().catch(() => {});
      (await import('node:fs')).rmSync(profile, { recursive: true, force: true });
    }
  });
});
