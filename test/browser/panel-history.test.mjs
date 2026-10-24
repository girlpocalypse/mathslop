// panel history: the pad-wide undo, as the data cases in test/cases/history.mjs.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser, panel, settled, clickLine, sleep } from './fixture.mjs';
import { HISTORY } from '../cases/history.mjs';
import { runHistory } from './history-driver.mjs';

const ctx = useBrowser();

describe('undo history', () => {
  for (const c of HISTORY) test(c.name, { timeout: 120000 }, async t => {
    const p = await panel(t, ctx, { lines: c.start, mode: c.mode || 'off' }, { hook: true });
    if (c.mode && c.mode !== 'off') await settled(p);
    await runHistory(p, c);
  });
  test('the keyboard\'s undo/redo are dimmed from the pad\'s history (body data-undo/redo)', async t => {
    const p = await panel(t, ctx, { lines: ['1'], mode: 'off' }, { hook: true });
    const flags = () => p.run(() => [document.body.dataset.undo, document.body.dataset.redo]);
    assert.deepEqual(await flags(), ['no', 'no']);
    await clickLine(p, 0); await p.type('2'); await sleep(100);
    assert.deepEqual(await flags(), ['yes', 'no']);
    await p.key('z', { ctrl: true }); await sleep(100);
    assert.deepEqual(await flags(), ['no', 'yes']);
  });
});
