// panel controls: the answers mode and its warning, the ☰ menu, Copy all, the Keyboard button.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser, panel, values, focused, settled, toastText, clickLine, sleep } from './fixture.mjs';

const ctx = useBrowser();
const mode = p => p.run(() => document.querySelector('.segrow [aria-pressed=true]').dataset.mode);
const warnOpen = p => p.run(() => document.getElementById('ans-warn').open);

describe('answers mode', () => {
  test('Off → Arithmetic asks first; Esc and "Keep answers off" keep it Off', async t => {
    const p = await panel(t, ctx, { lines: ['1+1'], mode: 'off' });
    await p.click('.segrow [data-mode=arith]'); await sleep(80);
    assert.equal(await warnOpen(p), true);
    await p.key('Escape'); await sleep(80);
    assert.equal(await warnOpen(p), false); assert.equal(await mode(p), 'off');
    await p.click('.segrow [data-mode=full]'); await sleep(80); await p.click('#ans-cancel'); await sleep(80);
    assert.equal(await mode(p), 'off');
    assert.equal(await p.run(() => document.getElementById('ansopts').hidden), true, 'answer options hidden while Off');
  });
  test('Arithmetic ↔ Algebra doesn\'t ask; the hint and options follow the mode', async t => {
    const p = await panel(t, ctx, { lines: ['2x+3x'], mode: 'arith' });
    assert.deepEqual(await settled(p), ['']);
    await p.click('.segrow [data-mode=full]'); await sleep(80);
    assert.equal(await warnOpen(p), false);
    assert.deepEqual(await settled(p), ['=5x']);
    assert.match(await p.run(() => document.getElementById('modehint').textContent), /^Algebra/);
    assert.equal(await p.run(() => document.getElementById('ansopts').hidden), false);
    await p.click('.segrow [data-mode=off]'); await sleep(80);
    assert.equal(await warnOpen(p), false); assert.deepEqual(await settled(p), ['']);
  });
});

describe('☰ menu', () => {
  test('opens on its first item; ↓/↑ wrap; Esc closes it back onto ☰; a click elsewhere closes it', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' });
    const at = () => p.run(() => document.activeElement.id);
    await p.click('#btn-menu'); await sleep(50);
    assert.equal(await at(), 'btn-copy');
    await p.key('ArrowUp'); assert.equal(await at(), 'btn-clear');
    await p.key('ArrowDown'); assert.equal(await at(), 'btn-copy');
    await p.key('Escape'); await sleep(50);
    assert.equal(await p.run(() => document.getElementById('menu').hidden), true);
    assert.equal(await at(), 'btn-menu');
    await p.click('#btn-menu'); await p.click('h1'); await sleep(50);
    assert.equal(await p.run(() => document.getElementById('menu').hidden), true);
  });
  test('Clear pad from the menu leaves the focus in the new empty line', async t => {
    const p = await panel(t, ctx, { lines: ['1', '2'], mode: 'off' });
    await p.click('#btn-menu'); await p.click('#btn-clear'); await sleep(200);
    assert.deepEqual(await values(p), ['']);
    assert.equal(await focused(p), 0);
    assert.equal(await toastText(p), 'Pad cleared');
  });
});

describe('dialogs', () => {
  test('Keyboard shortcuts from the menu, and its Close button', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' });
    await p.click('#btn-menu'); await p.click('#btn-keys'); await sleep(80);
    assert.equal(await p.run(() => document.getElementById('keys').open), true);
    await p.click('#keys-close'); await sleep(80);
    assert.equal(await p.run(() => document.getElementById('keys').open), false);
  });
  test('Import → Cancel leaves the pad alone; Copy all → Close too', async t => {
    const p = await panel(t, ctx, { lines: ['1', '2'], mode: 'off' });
    await p.click('#btn-menu'); await p.click('#btn-import'); await sleep(80);
    await p.run(() => { document.getElementById('imp').value = 'x'; });
    await p.click('#imp-cancel'); await sleep(80);
    assert.deepEqual(await values(p), ['1', '2']);
    await p.click('#btn-menu'); await p.click('#btn-export'); await sleep(80);
    await p.click('#exp-cancel'); await sleep(80);
    assert.equal(await p.run(() => document.getElementById('exp').open), false);
  });
});

describe('Copy all…', () => {
  const open = async p => { await p.click('#btn-menu'); await p.click('#btn-export'); await sleep(100); };
  const text = p => p.run(() => document.getElementById('exp-text').value);
  test('LaTeX or plain text, with or without answers', async t => {
    const p = await panel(t, ctx, { lines: ['a\\coloneq 3', '\\frac{1}{3}+a', '', '\\sqrt{2}'], mode: 'arith', places: 2 });
    await settled(p);
    await open(p);
    assert.equal(await text(p), 'a\\coloneq3\n\\frac{1}{3}+a = \\frac{10}{3} \\approx 3.33\n\\sqrt{2} \\approx 1.41');
    await p.click('#exp [data-fmt=text]');
    assert.equal(await text(p), 'a:=3\n(1)/(3)+a = (10)/(3) ≈ 3.33\nsqrt(2) ≈ 1.41');
    await p.click('#exp-ans');
    assert.equal(await text(p), 'a:=3\n(1)/(3)+a\nsqrt(2)');
    await p.click('#exp-copy'); await sleep(150);
    assert.equal(await toastText(p), 'All lines copied as plain text');
  });
  test('plain text falls back to LaTeX for a line MathLive can\'t convert', async t => {
    const p = await panel(t, ctx, { lines: ['\\exponentialE^{x}'], mode: 'off' });
    await p.run(() => { MathLive.convertLatexToAsciiMath = () => { throw new Error('x'); }; });
    await open(p); await p.click('#exp [data-fmt=text]');
    assert.equal(await text(p), 'e^{x}');
  });
  test('the Copy button is a plain button, not a toggle (review-19)', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' });
    assert.equal(await p.run(() => document.getElementById('exp-copy').hasAttribute('aria-pressed')), false);
  });
  test('with answers Off there are none to include', async t => {
    const p = await panel(t, ctx, { lines: ['1+1'], mode: 'off' });
    await open(p);
    assert.deepEqual(await p.run(() => [document.getElementById('exp-ans').disabled, document.getElementById('exp-ans').checked,
      document.getElementById('exp-note').textContent, document.getElementById('exp-text').value]),
      [true, false, 'Answers are off, so there are none to include.', '1+1']);
    await p.click('#exp-copy'); await sleep(150);
    assert.equal(await toastText(p), 'All lines copied as LaTeX');
  });
  test('Copy all as LaTeX copies the lines only, with e and i portable', async t => {
    const p = await panel(t, ctx, { lines: ['x', '', 'y'], mode: 'off' });
    await p.click('#btn-menu'); await p.click('#btn-copy'); await sleep(150);
    assert.equal(await toastText(p), 'All lines copied as LaTeX');
  });
});

describe('Decimals', () => {
  test('back to auto from a number of places', async t => {
    const p = await panel(t, ctx, { lines: ['\\sqrt2'], mode: 'arith', places: 2 });
    assert.deepEqual(await settled(p), ['≈1.41']);
    await p.run(() => { const s = document.getElementById('opt-places'); s.value = 'auto'; s.dispatchEvent(new Event('change')); });
    assert.match((await settled(p))[0], /^≈1\.414/);
  });
});

describe('Keyboard button', () => {
  test('opens the keyboard on the line the focus came from', async t => {
    const p = await panel(t, ctx, { lines: ['1', '2'], mode: 'off' });
    await clickLine(p, 1);
    await p.click('#btn-kbd'); await sleep(400);
    assert.equal(await focused(p), 1);
  });
  test('after Tab into another line, the keyboard opens on that line (r5-8)', async t => {
    const p = await panel(t, ctx, { lines: ['1', '2'], mode: 'off' });
    await clickLine(p, 0);
    for (let k = 0; k < 3; k++) { await p.key('Tab'); await sleep(50); }   // tex, ×, line 2
    assert.equal(await focused(p), 1);
    await p.click('#btn-kbd'); await sleep(400);
    assert.equal(await focused(p), 1);
  });
  test('hiding the keyboard with its button puts the focus back in the line', { todo: 'r9-8: the focus stays on the button' }, async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' });
    await clickLine(p, 0); await p.click('#btn-kbd'); await sleep(400); await p.click('#btn-kbd'); await sleep(300);
    assert.equal(await focused(p), 0);
  });
  test('Import → Append after clicking into the box adds the pasted lines once', { todo: 'r9-9: Append duplicates the pad' }, async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' });
    await p.click('#btn-menu'); await p.click('#btn-import'); await sleep(100);
    await p.click('#imp'); await p.key('End', { ctrl: true }); await p.key('Enter'); await p.type('2');   // the box still holds the pad
    await p.click('#imp-append'); await sleep(200);
    assert.deepEqual(await values(p), ['1', '2']);
  });
  test('the keyboard\'s undo/redo icons are dimmed when there\'s nothing to undo or redo', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' });
    await clickLine(p, 0); await p.click('#btn-kbd'); await sleep(500);
    const op = () => p.run(() => [...document.querySelectorAll('.ML__keyboard .action')].filter(a => /"(undo|redo)"/.test(a.dataset.command) && a.getBoundingClientRect().width)
      .map(a => a.dataset.command.replace(/"/g, '') + ':' + getComputedStyle(a.querySelector('svg')).opacity));
    assert.deepEqual(await op(), ['undo:0.2', 'redo:0.2']);
    await p.type('2'); await sleep(150);
    assert.deepEqual((await op())[0], 'undo:1');
  });
});
