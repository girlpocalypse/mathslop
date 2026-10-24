// End to end, trusted keys only: typing, shortcuts and undo (CLAUDE.md "Shortcuts", "Inline shortcuts", "Undo").
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser, panel, values, focused, toastText, clickLine, sleep } from './fixture.mjs';

const ctx = useBrowser();

describe('typing', () => {
  test('ans, ans*2 and := ', async t => {
    const p = await panel(t, ctx, { lines: ['', '', ''], mode: 'off' });
    await clickLine(p, 0); await p.type('ans+1');
    await clickLine(p, 1); await p.type('ans*2');
    await clickLine(p, 2); await p.type('a:=3');
    await sleep(100);
    const [a, b, c] = await values(p);
    assert.equal(a, '\\mathrm{ans}+1');
    assert.equal(b, '\\mathrm{ans}\\cdot2');
    assert.equal(c, 'a\\coloneq3');
  });
  test('? is typeable; Ctrl+/ opens the shortcut guide', async t => {
    const p = await panel(t, ctx);
    await clickLine(p, 0); await p.type('x?');
    assert.equal((await values(p))[0], 'x?');
    await p.key('/', { ctrl: true });
    assert.equal(await p.run(() => document.getElementById('keys').open), true);
  });
  test('MathLive shortcuts this pad removes stay plain letters (NO_SHORTCUT)', async t => {
    const p = await panel(t, ctx);
    await clickLine(p, 0);
    for (const w of ['gt', 'nn', 'in', 'km', 'th', 'ft', 'or']) {
      await p.key('a', { ctrl: true }); await p.key('Backspace');
      await p.type(w); await sleep(30);
      assert.equal((await values(p))[0].replace(/\s/g, ''), w, w);
    }
    await p.key('a', { ctrl: true }); await p.key('Backspace');
    await p.type('pi'); await sleep(30);
    assert.equal((await values(p))[0], '\\pi', 'pi still turns into π');
  });
});

describe('lines', () => {
  test('Enter adds a line below and moves to it; Shift+Enter doesn\'t', async t => {
    const p = await panel(t, ctx, { lines: ['1', '2'], mode: 'off' });
    await clickLine(p, 0); await p.key('Enter'); await sleep(100);
    assert.deepEqual(await values(p), ['1', '', '2']);
    assert.equal(await focused(p), 1);
    await p.key('Enter', { shift: true }); await sleep(100);
    assert.equal((await values(p)).length, 3);
  });
  test('Enter while typing a \\command finishes it instead of adding a line', async t => {
    const p = await panel(t, ctx);
    await clickLine(p, 0); await p.type('\\alpha'); await p.key('Enter'); await sleep(100);
    assert.deepEqual(await values(p), ['\\alpha']);
  });
  test('Backspace on an empty line deletes it, but not the only line', async t => {
    const p = await panel(t, ctx, { lines: ['1', ''], mode: 'off' });
    await clickLine(p, 1); await p.key('Backspace'); await sleep(100);
    assert.deepEqual(await values(p), ['1']);
    assert.equal(await focused(p), 0);
    await p.key('Backspace'); await p.key('Backspace'); await sleep(100);
    assert.deepEqual(await values(p), ['']);
  });
  test('↑/↓ move between lines; ←/→ at the edges too', async t => {
    const p = await panel(t, ctx, { lines: ['11', '22', '33'], mode: 'off' });
    const step = async k => { await p.key(k); await sleep(200); };   // focus moves on the next frame
    await clickLine(p, 1);
    await step('ArrowDown'); assert.equal(await focused(p), 2);
    await step('ArrowUp'); await step('ArrowUp'); assert.equal(await focused(p), 0);
    await step('End'); await step('ArrowRight'); assert.equal(await focused(p), 1);
    await p.type('x'); await sleep(50);
    assert.equal((await values(p))[1], 'x22', 'caret at the start of the next line');
    await step('Home'); await step('ArrowLeft'); assert.equal(await focused(p), 0);
    await p.type('y'); await sleep(50);
    assert.equal((await values(p))[0], '11y', 'caret at the end of the previous line');
  });
});

describe('Esc Esc', () => {
  test('one Esc warns, a second within 1.5 s clears, with an Undo toast', async t => {
    const p = await panel(t, ctx, { lines: ['1', '2'], mode: 'off' });
    await clickLine(p, 0); await p.key('Escape'); await sleep(50);
    assert.equal(await toastText(p), 'Press Esc again to clear the pad');
    assert.deepEqual(await values(p), ['1', '2']);
    await p.key('Escape'); await sleep(100);
    assert.deepEqual(await values(p), ['']);
    assert.equal(await toastText(p), 'Pad cleared');
  });
  test('Esc while typing a \\command doesn\'t count', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' });
    await clickLine(p, 0); await p.type('\\al'); await p.key('Escape'); await p.key('Escape'); await sleep(100);
    assert.equal((await values(p)).length, 1);
    assert.match((await values(p))[0], /^1/);
  });
  test('Esc with a dialog open closes the dialog, nothing else', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' });
    await clickLine(p, 0); await p.key('/', { ctrl: true }); await sleep(50);
    await p.key('Escape'); await sleep(30); await p.key('Escape'); await sleep(100);
    assert.deepEqual(await values(p), ['1']);
  });
});

describe('undo across the pad', () => {
  test('Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y go through every line in order', async t => {
    const p = await panel(t, ctx, { lines: ['1', '2'], mode: 'off' });
    await clickLine(p, 0); await p.type('a'); await sleep(1100);
    await clickLine(p, 1); await p.type('b'); await sleep(200);
    assert.deepEqual(await values(p), ['1a', '2b']);
    await p.key('z', { ctrl: true }); await sleep(80); assert.deepEqual(await values(p), ['1a', '2']);
    await p.key('z', { ctrl: true }); await sleep(80); assert.deepEqual(await values(p), ['1', '2']);
    assert.equal(await focused(p), 0, 'undo focuses the line that changed');
    await p.key('z', { ctrl: true, shift: true }); await sleep(80); assert.deepEqual(await values(p), ['1a', '2']);
    await p.key('y', { ctrl: true }); await sleep(80); assert.deepEqual(await values(p), ['1a', '2b']);
    await p.key('y', { ctrl: true }); await sleep(80);
    assert.equal(await toastText(p), 'Nothing to redo');
  });
  test('Ctrl+Z inside the Import box is the box\'s own', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' });
    await clickLine(p, 0); await p.type('2'); await sleep(100);
    await p.click('#btn-menu'); await p.click('#btn-import'); await sleep(100);
    await p.key('End', { ctrl: true }); await p.type('x');
    await p.key('z', { ctrl: true }); await sleep(80);
    assert.deepEqual(await values(p), ['12'], 'the pad is untouched');
  });
  test('a held Enter, then Ctrl+Z ×4: each undo focuses the line above the one it removes', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' });
    await clickLine(p, 0);
    await p.key('Enter');
    for (let i = 0; i < 3; i++) { await sleep(33); await p.key('Enter', { repeat: true }); }
    await sleep(200);
    assert.deepEqual(await values(p), ['1', '', '', '', '']);
    assert.equal(await focused(p), 4, 'a held Enter ends on the last new line');
    for (let n = 4; n >= 1; n--) {
      await p.key('z', { ctrl: true }); await sleep(120);
      assert.equal((await values(p)).length, n);
      assert.equal(await focused(p), n - 1);
    }
  });
});
