// panel pad and focus: answer insertion, "the line last edited", the line fields' setup.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser, panel, values, focused, settled, clickLine, sleep } from './fixture.mjs';

const ctx = useBrowser();
const clickAnswer = (p, row) => p.click(`js:document.querySelectorAll('.row .res')[${row}].querySelector('.part')`);

describe('inserting an answer', () => {
  test('a sum or a negative gets brackets in a line that isn\'t empty, none in an empty one', async t => {
    const p = await panel(t, ctx, { lines: ['1-4', '2\\cdot', ''], mode: 'arith' });
    await settled(p);
    await clickLine(p, 1); await clickAnswer(p, 0); await sleep(150);
    await clickLine(p, 2); await clickAnswer(p, 0); await sleep(150);
    assert.deepEqual((await values(p)).slice(1, 3), ['2\\cdot\\left(-3\\right)', '-3']);
  });
  test('a line\'s own answer, or no line edited yet: a new line below', async t => {
    const p = await panel(t, ctx, { lines: ['1+2', 'x'], mode: 'arith' });
    await settled(p);
    await clickAnswer(p, 0); await sleep(200);
    assert.deepEqual(await values(p), ['1+2', '3', 'x']);
    assert.equal(await focused(p), 1);
    await clickLine(p, 0); await clickAnswer(p, 0); await sleep(200);
    assert.deepEqual(await values(p), ['1+2', '3', '3', 'x']);
  });
  test('a line only tabbed through doesn\'t count as edited', async t => {
    const p = await panel(t, ctx, { lines: ['5', '7+1'], mode: 'arith' });
    await settled(p);
    await clickLine(p, 0);
    for (let k = 0; k < 4; k++) { await p.key('Tab'); await sleep(50); }   // tex, ×, line 2, its answer
    assert.equal(await p.run(() => document.activeElement.classList.contains('part')), true);
    await p.key('Enter'); await sleep(150);
    assert.deepEqual(await values(p), ['58', '7+1'], 'into line 1, where the caret was');
  });
  test('arrow keys in a line reached by Tab make it the line edited (r4-5)', async t => {
    const p = await panel(t, ctx, { lines: ['1+1', 'xy'], mode: 'arith' });
    await settled(p);
    await clickLine(p, 0);
    for (let k = 0; k < 4; k++) { await p.key('Tab'); await sleep(50); }   // answer, tex, ×, line 2
    assert.equal(await focused(p), 1);
    await p.key('End'); await p.key('ArrowLeft'); await sleep(60);
    await clickAnswer(p, 0); await sleep(200);
    assert.deepEqual(await values(p), ['1+1', 'x2y']);
  });
  test('an upright name keeps what is typed after it outside', { todo: 'r9-7: \\mathrm{word} absorbs a following · or ^' }, async t => {
    const p = await panel(t, ctx, { lines: [''], mode: 'off' });
    await clickLine(p, 0); await p.type('\\mathrm{mass}'); await p.key('Escape'); await p.type('*4'); await sleep(100);   // the QA repro
    assert.equal((await values(p))[0], '\\mathrm{mass}\\cdot4');
  });
  test('a click on a line\'s padding doesn\'t count; the line keeps no focus', async t => {
    const p = await panel(t, ctx, { lines: ['1+2', 'x'], mode: 'arith' });
    await settled(p);
    const [x, y] = await p.point('js:document.querySelectorAll(".row math-field")[1]', { dx: 0, dy: 0.5 });
    await p.click([x + 2, y]); await sleep(100);
    await clickAnswer(p, 0); await sleep(200);
    assert.deepEqual(await values(p), ['1+2', '3', 'x'], 'a new line, not into line 2');
  });
  test('a click inside a line that already has the focus (after Tab) counts as editing it', async t => {
    const p = await panel(t, ctx, { lines: ['1+1', 'x', 'y'], mode: 'arith' });
    await settled(p);
    await clickLine(p, 0);
    for (let k = 0; k < 4; k++) { await p.key('Tab'); await sleep(50); }   // answer, tex, ×, line 2
    assert.equal(await focused(p), 1);
    await p.click('js:document.querySelectorAll(".row math-field")[1]', { dx: 0.3 }); await sleep(100);   // no focusin
    await clickAnswer(p, 0); await sleep(200);
    assert.deepEqual(await values(p), ['1+1', 'x2', 'y']);
  });
});

describe('each line field', () => {
  test('MathLive\'s read-aloud and undo bindings are gone; ans is a shortcut; NO_SHORTCUT words are not', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' }, { hook: true });
    const got = await p.run(S => {
      const f = document.querySelector('.row math-field');
      const cmds = f.keybindings.map(k => [].concat(k.command)[0]);
      return { speak: cmds.includes('speak'), undo: cmds.includes('undo'), redo: cmds.includes('redo'),
        ans: f.inlineShortcuts.ans, pi: !!f.inlineShortcuts.pi, removed: [...S.pad.NO_SHORTCUT].filter(w => w in f.inlineShortcuts) };
    });
    assert.deepEqual(got, { speak: false, undo: false, redo: false, ans: '\\mathrm{ans}', pi: true, removed: [] });
  });
  test('Ctrl+Alt+↑ doesn\'t read the line aloud', async t => {
    const p = await panel(t, ctx, { lines: ['1+1'], mode: 'off' }, { before: 'window.__said = 0; speechSynthesis.speak = () => { window.__said++; };' });
    await clickLine(p, 0); await p.key('ArrowUp', { ctrl: true, alt: true }); await p.key('ArrowDown', { ctrl: true, alt: true }); await sleep(200);
    assert.equal(await p.run(() => window.__said), 0);
  });
  test('ansOut moves what follows ans back out of its upright style, keeping the caret', async t => {
    const p = await panel(t, ctx, { lines: [''], mode: 'off' }, { hook: true });
    const got = await p.run(S => {
      const f = document.querySelector('.row math-field');
      f.setValue('\\mathrm{ans\\cdot2}+\\mathrm{ans{x}}', { silenceNotifications: true });
      S.pad.ansOut(f); const a = f.value;
      f.setValue('\\mathrm{ans}+1', { silenceNotifications: true }); S.pad.ansOut(f);
      return [a, f.value];
    });
    assert.deepEqual(got, ['\\mathrm{ans}\\cdot2+\\mathrm{ans}{x}', '\\mathrm{ans}+1']);
  });
  test('without MathLive the panel says so and stops', async () => {
    const p = await ctx.b.openPanel({ hook: false,
      before: 'Object.defineProperty(window, "MathfieldElement", { get: () => undefined, set(){}, configurable: false });' });
    try {
      const msg = await p.waitFor(() => document.querySelector('.err')?.textContent, { what: 'the error message' });
      assert.equal(msg, 'MathLive failed to start. Reload the panel.');
      assert.equal(await p.run(() => document.querySelectorAll('.row').length), 0);
    } finally { await p.close(); }
  });
});
