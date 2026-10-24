// End to end: the on-screen keyboard (CLAUDE.md "Shortcuts", "Keyboard labels", "Undo").
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser, panel, values, focused, clickLine, sleep } from './fixture.mjs';

const ctx = useBrowser();
// A visible key on the keyboard's current layer, by its command ("commit" = ↵, "deleteBackward" = ⌫, …).
const vkey = cmd => `js:[...document.querySelectorAll('.ML__keyboard [data-command]')].find(k => k.getAttribute('data-command').includes(${JSON.stringify(cmd)}) && k.getBoundingClientRect().width > 0)`;
async function open(p, line = 0){
  await clickLine(p, line);
  await p.click('#btn-kbd');
  await p.waitFor(() => window.mathVirtualKeyboard.visible && document.querySelector('.ML__keyboard [data-command]')?.getBoundingClientRect().width > 0, { what: 'the keyboard' });
  await sleep(300);
}
const press = (p, cmd, hold = 80) => p.click(vkey(cmd), { hold });

describe('on-screen keyboard', () => {
  test('the Keyboard button shows and hides it, and the page makes room', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' });
    await open(p);
    const shown = await p.run(() => ({ pressed: document.getElementById('btn-kbd').getAttribute('aria-pressed'),
      pad: parseFloat(document.body.style.paddingBottom), h: document.body.style.getPropertyValue('--kbd-h') }));
    assert.equal(shown.pressed, 'true');
    assert.ok(shown.pad > 100 && parseFloat(shown.h) > 100, JSON.stringify(shown));
    await p.click('#btn-kbd');
    await p.waitFor(() => !window.mathVirtualKeyboard.visible);
    await sleep(300);
    assert.equal(await p.run(() => document.getElementById('btn-kbd').getAttribute('aria-pressed')), 'false');
  });
  test('keycaps show calculator labels, never placeholder boxes', async t => {
    const p = await panel(t, ctx, { lines: [''], mode: 'off' });
    await open(p);
    const raw = await p.run(() => [...document.querySelectorAll('.ML__keyboard .MLK__keycap')].map(k => k.innerHTML).filter(h => /#[@?0]|placeholder/.test(h)));
    assert.deepEqual(raw, []);
  });
  test('↵ adds a line at release over the key; dragging off cancels', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' });
    await open(p);
    await press(p, 'commit'); await sleep(200);
    assert.deepEqual(await values(p), ['1', '']);
    assert.equal(await focused(p), 1);
    await p.drag(vkey('commit'), vkey('deleteBackward')); await sleep(200);
    assert.deepEqual(await values(p), ['1', ''], 'released over another key: nothing');
  });
  test('a cancelled press (pointercancel) does nothing', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' });
    await open(p);
    const [x, y] = await p.point(vkey('commit'));
    await p.mouse('mouseMoved', x, y); await p.mouse('mousePressed', x, y);
    await p.run(() => window.dispatchEvent(new PointerEvent('pointercancel')));   // e.g. the touch became a scroll
    await p.mouse('mouseReleased', x, y); await sleep(200);
    assert.deepEqual(await values(p), ['1']);
  });
  test('⌫ on an empty line deletes it', async t => {
    const p = await panel(t, ctx, { lines: ['1', ''], mode: 'off' });
    await open(p, 1);
    await press(p, 'deleteBackward'); await sleep(200);
    assert.deepEqual(await values(p), ['1']);
    assert.equal(await focused(p), 0);
  });
  test('the keyboard\'s undo and redo drive the pad\'s history', async t => {
    const p = await panel(t, ctx, { lines: ['1', '2'], mode: 'off' });
    await open(p, 1);
    await p.type('3'); await sleep(150);
    await press(p, '"undo"'); await sleep(150);
    assert.deepEqual(await values(p), ['1', '2']);
    await press(p, '"redo"'); await sleep(150);
    assert.deepEqual(await values(p), ['1', '23']);
  });
  test('after Tab into a line, the keyboard\'s → at its end still moves to the next line', async t => {
    const p = await panel(t, ctx, { lines: ['1', '2'], mode: 'off' });
    await open(p, 1);
    // the first Shift+Tab takes the caret to the line's start (MathLive), the next three: ×, tex, line 1
    for (let k = 0; k < 4; k++) { await p.key('Tab', { shift: true }); await sleep(60); }
    assert.equal(await focused(p), 0, 'Tabbed back into line 1');
    await p.key('End');
    await press(p, 'moveToNextChar'); await sleep(250);
    assert.equal(await focused(p), 1);
  });
  test('typing with the on-screen keyboard makes that line the one an answer goes into, at its caret (r3-4)', async t => {
    const p = await panel(t, ctx, { lines: ['1+1', 'x', 'y'], mode: 'arith' });
    await open(p, 2);
    await clickLine(p, 1, 'start');
    await press(p, 'moveToNextChar'); await sleep(150);   // caret after x, from the keyboard
    await p.click(`js:document.querySelectorAll('.row .res')[0].querySelector('.part')`); await sleep(200);
    assert.deepEqual(await values(p), ['1+1', 'x2', 'y']);
  });
  test('keys are relabelled for screen readers once each: no raw LaTeX or entities (r9-2)', async t => {
    const p = await panel(t, ctx, { lines: [''], mode: 'off' });
    await open(p);
    const bad = await p.run(() => [...document.querySelectorAll('.ML__keyboard [aria-label]')].filter(k => k.getBoundingClientRect().width)
      .map(k => [k.getAttribute('aria-label'), 'said' in k.dataset]).filter(([l, said]) => !said || /#@|#\?|&[a-z]+;|\\[a-z]/i.test(l)));
    assert.deepEqual(bad, []);
  });
  test('with a line menu open, the keyboard\'s undo does nothing (r2-4)', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' });
    await open(p); await p.type('2'); await sleep(150);
    const [x, y] = await p.point('js:document.querySelector(".row math-field")', { dx: 0.3 });
    await p.mouse('mouseMoved', x, y); await p.mouse('mousePressed', x, y, { button: 'right' }); await p.mouse('mouseReleased', x, y, { button: 'right' }); await sleep(250);
    await p.run(() => [...document.querySelectorAll('.ML__keyboard [data-command]')].find(k => k.dataset.command === '"undo"' && k.getBoundingClientRect().width).click());
    await sleep(150);
    assert.deepEqual(await values(p), ['12']);
  });
  test('a quick ↵ double tap ends on the last new line; ⌫ right after ↵ removes it', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' });
    await open(p);
    await press(p, 'commit', 70); await sleep(30); await press(p, 'commit', 90); await sleep(250);
    assert.deepEqual(await values(p), ['1', '', '']);
    assert.equal(await focused(p), 2);
    await press(p, 'commit', 60); await sleep(20); await press(p, 'deleteBackward', 60); await sleep(250);
    assert.deepEqual(await values(p), ['1', '', '']);
    assert.equal(await focused(p), 2);
  });
});
