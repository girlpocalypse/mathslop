// panel bridge: the engine bridge against a scripted fake engine (test/cases/bridge.mjs), plus lineKey and
// lineResult. The real engine's own hang is in e2e-flows ("a hung line…").
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser, panel, answers, clickLine, sleep } from './fixture.mjs';
import { BRIDGE, LINE_KEY_SAME, LINE_KEY_DIFFERENT } from '../cases/bridge.mjs';

const ctx = useBrowser();
const fakeGot = p => p.run(() => document.getElementById('engine').contentWindow.fake?.got || []);

async function play(p, c){
  const frame0 = await p.run(() => { window.__frame0 = document.getElementById('engine'); return true; });
  let n = 0;
  for (const [op, ...a] of c.steps) {
    const where = `step ${++n} ${op}`;
    const evals = (await fakeGot(p)).filter(m => m.type === 'eval');
    switch (op) {
      case 'send': {
        const ids = { $last: evals.at(-1)?.id, $prev: evals.at(-2)?.id };
        const msg = JSON.parse(JSON.stringify(a[0]), (k, v) => k === 'id' && v in ids ? ids[v] : v);
        await p.run((S, m) => document.getElementById('engine').contentWindow.fake.send(m), msg);
        break;
      }
      case 'evals': assert.equal(evals.length, a[0], where); break;
      case 'eval': {
        const last = evals.at(-1);
        assert.ok(last, where + ': no eval sent');
        for (const [k, v] of Object.entries(a[0])) assert.deepEqual(last[k], v, `${where}: ${k}`);
        break;
      }
      case 'status': assert.equal(await p.run(() => document.getElementById('status').textContent), a[0], where); break;
      case 'answers': assert.deepEqual(await answers(p), a[0], where); break;
      case 'edit': await clickLine(p, a[0]); await p.type(a[1]); break;
      case 'mode': await p.click(`.segrow [data-mode=${a[0]}]`); await sleep(50);
        if (await p.run(() => document.getElementById('ans-warn').open)) await p.click('#ans-ok'); break;
      case 'wait': await sleep(a[0]); break;
      case 'frame': assert.equal(await p.run(() => document.getElementById('engine') === window.__frame0 ? 'same' : 'replaced'), a[0], where);
        if (a[0] === 'replaced') assert.equal(await p.run(() => document.getElementById('engine').getAttribute('src')), await p.run(() => window.__frame0.getAttribute('src')), where + ': same src');
        break;
      case 'slowKeys': assert.equal(await p.run(S => S.bridge.slowKeys.size), a[0], where); break;
      case 'inflight': assert.equal(await p.run(S => S.bridge.inflight.size), a[0], where); break;
      case 'fill': await p.run((S, k) => { for (let i = 0; i < k; i++) S.bridge.slowKeys.add('made-up ' + i); }, a[0]); break;
      default: throw new Error('unknown op ' + op);
    }
  }
  return frame0;
}

describe('engine bridge (fake engine)', () => {
  for (const c of BRIDGE) test(c.name, { timeout: 30000 }, async t => {
    const p = await panel(t, ctx, c.start, { hook: true, fake: { auto: c.auto !== false } });
    await play(p, c);
  });
  test('the watchdog restart shows "restarting math engine…" until the new frame is ready', async t => {
    const p = await panel(t, ctx, { lines: ['1+1'], mode: 'arith' }, { hook: true, fake: { auto: false } });
    await p.run(() => document.getElementById('engine').contentWindow.fake.send({ type: 'ready' }));
    await sleep(3700);
    assert.equal(await p.run(() => document.getElementById('status').textContent), 'restarting math engine…');
  });
});

describe('lineKey and lineResult', () => {
  test('the same key: lines above don\'t matter, except := lines', async t => {
    const p = await panel(t, ctx, undefined, { hook: true });
    const got = await p.run((S, pairs) => pairs.map(([[a, i], [b, j]]) => S.bridge.lineKey(a, i) === S.bridge.lineKey(b, j)), LINE_KEY_SAME);
    assert.deepEqual(got, LINE_KEY_SAME.map(() => true));
    const diff = await p.run((S, pairs) => pairs.map(([[a, i], [b, j]]) => S.bridge.lineKey(a, i) === S.bridge.lineKey(b, j)), LINE_KEY_DIFFERENT);
    assert.deepEqual(diff, LINE_KEY_DIFFERENT.map(() => false));
  });
  test('lineResult: a skipped line is slow; a slow one is remembered; null stays null', async t => {
    const p = await panel(t, ctx, undefined, { hook: true });
    const got = await p.run(S => {
      const B = S.bridge, req = { mode: 'arith', lines: ['1', '2', '3'], skip: [0] }, before = B.slowKeys.size;
      return [B.lineResult(req, 0, { exact: '1' }), B.lineResult(req, 1, { slow: true }), B.slowKeys.size - before,
        B.lineResult(req, 2, undefined), B.lineResult(req, 2, { exact: '3' })];
    });
    assert.deepEqual(got, [{ slow: true }, { slow: true }, 1, null, { exact: '3' }]);
  });
});
