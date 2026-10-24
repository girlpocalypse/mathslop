// sandbox.js: the postMessage protocol in its header comment, and the one-line-per-task job scheduling.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './load.mjs';

// A fresh engine per test: the protocol state (job, gen) is what's being tested.
function engine(t, opts){ const e = loadEngine(opts); t.after(() => e.close()); return e; }
const short = m => m.type === 'result' ? `result#${m.id}` : m.type === 'progress' || m.type === 'line' ? `${m.type}#${m.id}:${m.line}` : m.type;
const settle = () => new Promise(r => setTimeout(r, 50));

describe('hello and ping', () => {
  test('ready on load, and again on ping', async t => {
    const e = engine(t);
    assert.deepEqual(e.messages.map(short), ['ready']);
    e.send({ type: 'ping' }); await settle();
    assert.deepEqual(e.messages.map(short), ['ready', 'ready']);
  });
  test('without Compute Engine: an error, and evals are ignored', async t => {
    const e = engine(t, { ce: () => undefined });
    assert.deepEqual(structuredClone(e.messages), [{ type: 'error', message: 'Compute Engine did not load' }]);
    e.send({ type: 'eval', id: 1, mode: 'full', lines: ['1+1'] }); await settle();
    assert.equal(e.messages.length, 1);
  });
  test('ignored: another source, other types, lines that aren\'t an array, no data', async t => {
    const e = engine(t);
    e.send({ type: 'eval', id: 1, lines: ['1+1'] }, {});
    e.send({ type: 'plot', id: 2, lines: ['1+1'] });
    e.send({ type: 'eval', id: 3, lines: '1+1' });
    e.send(null);
    await settle();
    assert.deepEqual(e.messages.map(short), ['ready']);
  });
});

describe('one line per task', () => {
  test('progress, then line, for each line, then the result; skipped lines get no progress', async t => {
    const e = engine(t);
    await e.eval({ id: 1, lines: ['1+1', '2+2', '3+3'], skip: [1] });
    assert.deepEqual(e.messages.slice(1).map(short),
      ['progress#1:0', 'line#1:0', 'line#1:1', 'progress#1:2', 'line#1:2', 'result#1']);
    assert.equal(e.messages.find(m => m.type === 'line' && m.line === 1).result, null);
  });
  test('a line is never worked out in the same task as its progress', async t => {
    const e = engine(t);
    let sameTask = false, pending = false;
    e.onPost(m => {
      if (m.type === 'progress') { pending = true; queueMicrotask(() => { pending = false; }); }
      if (m.type === 'line' && pending) sameTask = true;
    });
    await e.eval({ lines: ['1+1', '\\frac{1}{3}', 'x^2'] });
    assert.equal(sameTask, false);
  });
  test('a newer request replaces the one being worked on, between lines', async t => {
    const e = engine(t);
    e.onPost(m => { if (m.type === 'progress' && m.id === 1 && m.line === 1) e.send({ type: 'eval', id: 2, mode: 'full', lines: ['5+5'] }); });
    e.send({ type: 'eval', id: 1, mode: 'full', lines: ['1+1', '2+2', '3+3'] });
    await e.waitFor(m => m.type === 'result' && m.id === 2); await settle();
    assert.deepEqual(e.messages.slice(1).map(short),
      ['progress#1:0', 'line#1:0', 'progress#1:1', 'progress#2:0', 'line#2:0', 'result#2']);
  });
  test('a stale tick after a replaced job is ignored (an empty request in between)', async t => {
    const e = engine(t);
    e.onPost(m => { if (m.type === 'progress' && m.id === 1 && m.line === 1) e.send({ type: 'eval', id: 2, lines: [] }); });
    e.send({ type: 'eval', id: 1, mode: 'full', lines: ['1+1', '2+2', '3+3'] });
    await e.waitFor(m => m.type === 'result' && m.id === 2); await settle();
    assert.deepEqual(e.messages.slice(1).map(short), ['progress#1:0', 'line#1:0', 'progress#1:1', 'result#2']);
  });
  test('many requests while a job runs: no tick chains pile up (review-2, round 1 F1)', async t => {
    const e = engine(t), lines = ['\\sum_{n=1}^{200}\\frac1n', '\\int_0^1 x^2\\,dx', '2^{100}', '3!', '\\frac{1}{7}'];
    let sent = false;
    e.onPost(m => {
      if (!sent && m.type === 'progress' && m.id === 1 && m.line === 1) {
        sent = true;
        for (let id = 2; id <= 6; id++) e.send({ type: 'eval', id, mode: 'full', lines });
      }
    });
    e.send({ type: 'eval', id: 1, mode: 'full', lines });
    await e.waitFor(m => m.type === 'result' && m.id === 6); await settle();
    for (let id = 2; id <= 5; id++) assert.ok(e.messages.filter(m => m.type === 'line' && m.id === id).length <= 1, `request ${id} ran on`);
    assert.deepEqual(e.messages.filter(m => m.type === 'result').map(m => m.id), [6]);
    // after the last request arrives, at most the line already under way is worked out before it starts
    const i = e.log.findIndex(x => x.in?.id === 6), j = e.log.findIndex(x => x.out?.type === 'progress' && x.out.id === 6);
    assert.ok(e.log.slice(i, j).filter(x => x.out?.type === 'line').length <= 1);
  });
});

describe('in browser task order (requests queue behind ticks)', () => {
  test('each replaced job works out at most the line already queued; no chains pile up (review-2)', async t => {
    const e = engine(t, { fifo: true }), lines = ['1+1', '2+2', '3+3', '4+4', '5+5', '6+6'];
    const sentAt = {};
    e.onPost(m => {
      // as soon as job k starts its second line, the panel sends request k+1
      if (m.type === 'progress' && m.line === 1 && m.id < 6 && !sentAt[m.id + 1]) {
        sentAt[m.id + 1] = e.messages.length;
        e.send({ type: 'eval', id: m.id + 1, mode: 'full', lines });
      }
    });
    e.send({ type: 'eval', id: 1, mode: 'full', lines });
    await e.waitFor(m => m.type === 'result' && m.id === 6); await settle();
    assert.deepEqual(e.messages.filter(m => m.type === 'result').map(m => m.id), [6]);
    for (let id = 1; id <= 5; id++) {
      const late = e.messages.slice(sentAt[id + 1]).filter(m => m.type === 'line' && m.id === id).length;
      assert.ok(late <= 1, `job ${id} worked out ${late} lines after it was replaced`);
    }
  });
});

describe('each request', () => {
  test('gets a fresh engine: := doesn\'t carry over', async t => {
    const e = engine(t);
    await e.eval({ lines: ['a\\coloneq3'], mode: 'arith' });
    assert.deepEqual(await e.eval({ lines: ['a+1'], mode: 'arith' }), [null]);
  });
  test('places 0–20 are used, anything else is auto', async t => {
    const e = engine(t), third = async places => (await e.eval({ lines: ['\\frac13'], places }))[0].approx;
    assert.equal(await third('auto'), '0.\\overline{3}');
    assert.equal(await third(0), '0');
    assert.equal(await third(20), '0.' + '333\\,'.repeat(6) + '33');
    for (const bad of [21, -1, 2.5, '2', null]) assert.equal(await third(bad), '0.\\overline{3}', String(bad));
  });
  test('angle deg sets the angular unit', async t => {
    const e = engine(t);
    assert.equal((await e.eval({ lines: ['\\cos(60)'], angle: 'deg' }))[0].approx, '0.5');
    assert.notEqual((await e.eval({ lines: ['\\cos(60)'], angle: 'rad' }))[0].approx, '0.5');
  });
  test('a missing skip list is no skip', async t => {
    const e = engine(t), p = e.waitFor(m => m.type === 'result' && m.id === 9);
    e.send({ type: 'eval', id: 9, mode: 'full', lines: ['2+3'] });
    assert.equal((await p).results[0].exact, '5');
  });
});

describe('failures', () => {
  const failing = cause => CE => class extends CE {
    withTimeLimit(o, f){ if (globalThis.__fail) { const err = new Error('x'); err.cause = cause; throw err; } return super.withTimeLimit(o, f); }
  };
  test('a timeout is { slow: true }; another error (recursion depth) is null', async t => {
    for (const [cause, want] of [['timeout', { slow: true }], ['recursion-depth-exceeded', null]]) {
      const e = engine(t, { ce: failing(cause) });
      globalThis.__fail = true;
      try { assert.deepEqual(await e.eval({ lines: ['1+1'] }), [want], cause); } finally { delete globalThis.__fail; }
    }
  });
  test('an engine that can\'t be built: a result of nulls', async t => {
    let fail = false;
    const e = engine(t, { ce: CE => class extends CE { constructor(...a){ if (fail) throw new Error('boom'); super(...a); } } });
    fail = true;
    assert.deepEqual(await e.eval({ lines: ['1+1', '2+2'] }), [null, null]);
  });
  test('canary: a line that really runs over 1.5 s comes back slow', async t => {
    const e = engine(t), t0 = performance.now();
    assert.deepEqual(await e.eval({ lines: ['\\sum_{n=1}^{1000000}\\frac1n'] }), [{ slow: true }]);
    const ms = performance.now() - t0;
    assert.ok(ms > 1400 && ms < 4000, `took ${Math.round(ms)} ms`);
  });
});
