// End to end: Import with answers on (QA round 1's only high finding, r1-? "editing": lines from Import
// couldn't take typing; the dialog must close before the pad is rebuilt) and Tab order through answers.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser, panel, values, answers, settled, clickLine, sleep } from './fixture.mjs';

const ctx = useBrowser();

async function importLines(p, text, button){
  await p.click('#btn-menu'); await p.click('#btn-import'); await sleep(100);
  await p.run(() => { const t = document.getElementById('imp'); t.value = ''; t.focus(); });
  const [first, ...rest] = text.split('\n');
  await p.type(first);
  for (const line of rest) { await p.key('Enter'); await p.type(line); }
  await p.click(button); await sleep(150);
}

describe('Import with answers on', () => {
  for (const [button, want] of [['#imp-ok', ['3+4', '5x']], ['#imp-append', ['1+1', '3+4', '5x']]]) {
    test(`${button === '#imp-ok' ? 'Replace' : 'Append'}: the new lines take typing`, async t => {
      const p = await panel(t, ctx, { lines: ['1+1'], mode: 'arith' });
      await importLines(p, '3+4\n5x', button);
      assert.deepEqual(await values(p), want);
      const i = want.indexOf('3+4');
      await clickLine(p, i); await p.type('+1'); await sleep(100);
      assert.equal((await values(p))[i], '3+4+1');
      assert.equal((await settled(p))[i], '=8');
    });
  }
});

describe('Tab order', () => {
  test('line → its answer → tex → × → the next line', async t => {
    const p = await panel(t, ctx, { lines: ['1+1', '7'], mode: 'arith' });
    await settled(p);
    await clickLine(p, 0);
    const where = () => p.run(() => {
      const a = document.activeElement, row = a.closest('.row'), i = [...document.querySelectorAll('.row')].indexOf(row);
      return i + ':' + (a.tagName === 'MATH-FIELD' ? 'line' : a.classList.contains('part') ? 'answer' : a.dataset.a);
    });
    const seen = [await where()];
    for (let k = 0; k < 4; k++) { await p.key('Tab'); await sleep(60); seen.push(await where()); }
    assert.deepEqual(seen, ['0:line', '0:answer', '0:copy', '0:del', '1:line']);
  });
  test('Enter on an answer reached by Shift+Tab puts it at the caret the line had before Tab', async t => {
    const p = await panel(t, ctx, { lines: ['1+1', 'x'], mode: 'arith' });
    await settled(p);
    await clickLine(p, 1, 'start');
    for (let k = 0; k < 3; k++) { await p.key('Tab', { shift: true }); await sleep(60); }
    assert.equal(await p.run(() => document.activeElement.classList.contains('part')), true, 'on the first line\'s answer');
    await p.key('Enter'); await sleep(150);
    assert.deepEqual(await values(p), ['1+1', '2x']);
  });
});
