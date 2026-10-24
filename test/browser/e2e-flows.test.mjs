// End to end: flows that cross the future modules (pad, history, bridge, answers, toast, settings, colors).
// They guard the wiring, which could break while every unit test still passes.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser, panel, values, answers, settled, clickLine, toastText, savedState, sleep } from './fixture.mjs';

const ctx = useBrowser();
const SAMPLE = ['a\\coloneq 3', 'b\\coloneq 4', '\\sqrt{a^2+b^2}', '\\int_0^{\\pi}\\sin(x)\\,dx', '\\sum_{n=1}^{100} n',
  '\\frac{1}{3}+\\frac{1}{6}', '\\frac{d}{dx}x^3', 'e^{i\\pi}+1', 'x^2+y^2=r^2', 'f(x)\\coloneq x^2+1', 'f(3)'];

describe('flows', () => {
  test('a first run shows the sample pad with answers off; Arithmetic answers it and follows edits', async t => {
    const p = await panel(t, ctx, null);
    assert.deepEqual((await values(p)).map(v => v.replace(/\s/g, '')), SAMPLE.map(v => v.replace(/\s/g, '')));
    assert.ok((await answers(p)).every(a => a === ''), 'answers start off');
    await p.click('.segrow [data-mode=arith]'); await sleep(100);
    assert.equal(await p.run(() => document.getElementById('ans-warn').open), true, 'the warning comes first');
    assert.equal(await p.run(() => document.activeElement.id), 'ans-cancel', '"Keep answers off" is focused');
    await p.click('#ans-ok');
    const a = await settled(p);
    assert.deepEqual([a[2], a[3], a[4], a[5], a[7], a[10]], ['=5', '=2', '=5050', '=21 | =0.5', '=0', '=10']);   // ½ reads "21": MathLive puts the denominator first in the DOM
    
    await clickLine(p, 1); await p.key('Backspace'); await p.type('0');   // b := 0, so √(a²+b²) = 3
    assert.equal((await settled(p))[2], '=3');
  });
  test('an answer clicked into another line, then Ctrl+Z and Ctrl+Shift+Z', async t => {
    const p = await panel(t, ctx, { lines: ['1+2', '2\\cdot'], mode: 'arith' });
    await settled(p);
    await clickLine(p, 1);
    await p.click('.row .res .part'); await sleep(200);
    assert.deepEqual(await values(p), ['1+2', '2\\cdot3']);
    await p.key('z', { ctrl: true }); await sleep(120);
    assert.deepEqual(await values(p), ['1+2', '2\\cdot']);
    await p.key('z', { ctrl: true, shift: true }); await sleep(120);
    assert.deepEqual(await values(p), ['1+2', '2\\cdot3']);
  });
  test('× deletes a line and its toast\'s Undo brings it back, focused and typeable', async t => {
    const p = await panel(t, ctx, { lines: ['1', '2', '3'], mode: 'off' });
    await p.click('js:document.querySelectorAll(".row [data-a=del]")[1]'); await sleep(100);
    assert.deepEqual(await values(p), ['1', '3']);
    assert.equal(await toastText(p), 'Line 2 deleted');
    await p.click('#toast button'); await sleep(200);
    assert.deepEqual(await values(p), ['1', '2', '3']);
    await p.type('x'); await sleep(80);
    assert.ok((await values(p)).includes('2x') || (await values(p)).includes('x2'), 'the restored line has the focus: ' + await values(p));
  });
  test('a hung line shows "took too long", the lines below still get answers, and editing it clears the marker', async t => {
    const p = await panel(t, ctx, { lines: ['1+1', '\\gcd(2^{300000}-1,3^{300000}-1)', '2+2'], mode: 'arith' }, { allowErrors: true });
    const a = await p.waitFor(() => document.querySelectorAll('.row .res')[1].textContent.includes('took too long') &&
      document.querySelectorAll('.row .res')[2].textContent.includes('4'), { timeout: 12000, what: 'the watchdog' });
    assert.ok(a);
    assert.equal((await answers(p))[0], '=2');
    await clickLine(p, 1); await p.key('Backspace'); await p.key('Backspace'); await sleep(50);
    await p.type(')'); await sleep(900);
    assert.notEqual((await answers(p))[1], '[took too long]');
  });
  test('every setting survives a reload', async t => {
    const p = await panel(t, ctx, { lines: ['\\frac18', '\\sqrt2', '\\frac14+\\frac14'], mode: 'arith' });
    await p.click('[data-angle=deg]');
    await p.run(() => { const s = document.getElementById('opt-places'); s.value = '2'; s.dispatchEvent(new Event('change')); });
    await p.run(() => { const s = document.getElementById('opt-order'); s.value = 'decimal'; s.dispatchEvent(new Event('change')); });
    await p.click('#btn-colors');
    await p.click('.segrow [data-mode=full]');
    await p.click('#btn-menu'); await p.click('#btn-export'); await sleep(100);
    await p.click('#exp [data-fmt=text]'); await p.click('#exp-ans'); await p.click('#exp-cancel');
    await settled(p);
    const want = { lines: ['\\frac18', '\\sqrt2', '\\frac14+\\frac14'], mode: 'full', varColors: true, angle: 'deg', places: 2, order: 'decimal', copyFmt: 'text', copyAns: false };
    assert.deepEqual(await savedState(p), want);
    await p.reload(); await p.ready();
    assert.deepEqual(await p.run(() => ({
      mode: document.querySelector('.segrow [aria-pressed=true]').dataset.mode,
      angle: document.querySelector('[data-angle][aria-pressed=true]').dataset.angle,
      places: document.getElementById('opt-places').value, order: document.getElementById('opt-order').value,
      colors: document.getElementById('btn-colors').getAttribute('aria-pressed'),
    })), { mode: 'full', angle: 'deg', places: '2', order: 'decimal', colors: 'true' });
    assert.equal(await p.run(() => document.getElementById('ans-warn').open), false, 'no warning for a restored mode');
    const a = await settled(p);
    assert.equal(a[1], '≈1.41', '2 places');
    assert.equal(a[2], '=0.5 | =21', 'decimal first');
    assert.deepEqual(await savedState(p), want);
  });
  test('Colors paints letters in lines and in answers, the same letter the same color', async t => {
    const p = await panel(t, ctx, { lines: ['x+y+e+i', '2x+3x'], mode: 'full' });
    await settled(p);
    await p.click('#btn-colors'); await sleep(200);
    const c = await p.run(() => {
      const col = root => [...root.querySelectorAll('.ML__mathit')].map(s => [s.textContent, s.style.color]);
      const fs = document.querySelectorAll('.row math-field');
      return { l0: col(fs[0].shadowRoot), l1: col(fs[1].shadowRoot), a1: col(document.querySelectorAll('.row .res')[1]) };
    });
    const x0 = c.l0.find(([ch]) => ch === 'x')[1], y0 = c.l0.find(([ch]) => ch === 'y')[1];
    assert.ok(x0 && y0 && x0 !== y0, JSON.stringify(c.l0));
    for (const ch of ['e', 'i']) assert.equal(c.l0.find(([k]) => k === ch)?.[1] ?? '', '', ch + ' stays uncolored');
    assert.equal(c.l1.find(([ch]) => ch === 'x')[1], x0, 'same letter, same color, in another line');
    assert.equal(c.a1.find(([ch]) => ch === 'x')[1], x0, 'and in the answer');
    await p.click('#btn-colors'); await sleep(200);
    assert.equal(await p.run(() => [...document.querySelectorAll('.row math-field')[0].shadowRoot.querySelectorAll('.ML__mathit')].every(s => !s.style.color)), true);
  });
});
