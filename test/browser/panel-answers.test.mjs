// panel answers: markers, tips, labels and re-rendering (CLAUDE.md "Markers", "Click an answer").
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser, panel, answers, settled, sleep } from './fixture.mjs';

const ctx = useBrowser();
const send = (p, m) => p.run((S, m) => {
  const f = document.getElementById('engine').contentWindow.fake;
  const id = f.got.filter(x => x.type === 'eval').at(-1).id;
  f.send({ ...m, id });
}, m);
const res = (exact, approx, approxIsExact = false, group = false) => ({ exact, approx, approxIsExact, group });

describe('markers', () => {
  test('every invalid code the engine sends has its own tip, and a real line produces each of them', async t => {
    const p = await panel(t, ctx, { lines: [
      '2^{\\placeholder{}}3', 'area\\coloneq 12', 'x_1\\coloneq 3', '1+', '\\foo', 'x_{1\\coloneq3}', '1)', 'x\\rangle',
    ], mode: 'arith' }, { hook: true });
    await settled(p, { quiet: 1200 });
    const got = await p.run(S => [...document.querySelectorAll('.row .res')].map(r => [r.querySelector('.mark')?.textContent, r.title]));
    const tips = await p.run(S => ({ ...S.answers.INVALID_TIP }));
    const seen = new Set();
    for (const [mark, title] of got) {
      assert.equal(mark, 'can\'t read');
      const code = Object.keys(tips).find(c => title.endsWith(tips[c]));
      assert.ok(code, 'a tip for every line: ' + title);
      seen.add(code);
    }
    assert.deepEqual([...seen].sort(), Object.keys(tips).sort(), 'every tip is reachable');
  });
  test('an unknown code gets the fallback tip; slow lines get theirs; markers fade in', async t => {
    const p = await panel(t, ctx, { lines: ['1', '2'], mode: 'arith' }, { hook: true, fake: {} });
    await sleep(400);
    await send(p, { type: 'result', results: [{ invalid: 'something-new' }, { slow: true }] });
    await sleep(250);
    const got = await p.run(S => [...document.querySelectorAll('.row .res')].map(r => [r.querySelector('.mark').textContent, r.title, getComputedStyle(r.querySelector('.mark')).animationName]));
    assert.deepEqual(got[0].slice(0, 2), ['can\'t read', 'The engine can\'t read this line. Check for a typo.']);
    assert.equal(got[1][0], 'took too long');
    assert.equal(got[1][1], await p.run(S => S.answers.SLOW_TIP));
    assert.ok(got.every(g => g[2] && g[2] !== 'none'), 'a fade-in animation: ' + got.map(g => g[2]));
  });
});

describe('rendering', () => {
  test('the same result again keeps the markup as it is; a new order re-renders', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'arith' }, { hook: true, fake: {} });
    await sleep(400);
    await send(p, { type: 'result', results: [res('\\frac12', '0.5', true)] }); await sleep(200);
    await p.run(() => { window.__part = document.querySelector('.row .res .part'); });
    await send(p, { type: 'result', results: [res('\\frac12', '0.5', true)] }); await sleep(200);
    assert.equal(await p.run(() => document.querySelector('.row .res .part') === window.__part), true);
    assert.deepEqual(await answers(p), ['=21 | =0.5']);
    await p.run(() => { const s = document.getElementById('opt-order'); s.value = 'decimal'; s.dispatchEvent(new Event('change')); });
    assert.deepEqual(await answers(p), ['=0.5 | =21']);
  });
  test('labels: each part says itself, ≈ spoken with a space, and a repetend is spelled out', async t => {
    const p = await panel(t, ctx, { lines: ['1', '2'], mode: 'arith' }, { hook: true, fake: {} });
    await sleep(400);
    await send(p, { type: 'result', results: [res(null, '1.41'), res(null, '0.\\overline{3}', true)] }); await sleep(200);
    const labels = await p.run(() => [...document.querySelectorAll('.row .res .part')].map(e => e.getAttribute('aria-label')));
    // "approx 1.41", not "approx1.41" (a space after \approx); MathLive's own words for ≈
    assert.match(labels[0], /^\s*approx 1\.41\. Enter puts it in the line you were editing, Shift\+Enter copies it\.$/);
    assert.match(labels[1], /with 3 repeating/);
    assert.equal(await p.run(() => document.querySelector('.row .res').title), 'Click to put this answer in the line you\'re editing. Shift+click to copy it.');
  });
  test('an answer MathLive can\'t render leaves the row empty, nothing thrown', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'arith' }, { hook: true, fake: {} });
    await sleep(400);
    await p.run(() => { MathLive.convertLatexToMarkup = () => { throw new RangeError('Maximum call stack size exceeded'); }; });
    await send(p, { type: 'result', results: [res('2', null)] }); await sleep(200);
    assert.deepEqual(await answers(p), ['']);
  });
  test('the second form is dimmed', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'arith' }, { hook: true, fake: {} });
    await sleep(400);
    await send(p, { type: 'result', results: [res('\\frac12', '0.5', true)] }); await sleep(200);
    assert.deepEqual(await p.run(() => [...document.querySelectorAll('.row .res .part')].map(e => getComputedStyle(e).opacity)), ['1', '0.72']);
  });
  test('lines are numbered and labeled "Line N"; the count says "1 line" / "N lines"', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' });
    const read = () => p.run(() => [document.getElementById('count').textContent,
      [...document.querySelectorAll('.row')].map(r => r.querySelector('.num').textContent + '/' + r.querySelector('math-field').getAttribute('aria-label'))]);
    assert.deepEqual(await read(), ['1 line', ['1/Line 1']]);
    await p.click('.add'); await sleep(150);
    assert.deepEqual(await read(), ['2 lines', ['1/Line 1', '2/Line 2']]);
  });
});
