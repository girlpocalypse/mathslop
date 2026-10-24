// Table rows through the real engine: [lines, opts, expected]. The last line's result is compared.
// expected: null, { invalid }, { slow }, or a partial answer { exact, approx, approxIsExact, group }
// (fields left out aren't checked). opts: mode ('full' default), places ('auto'), angle ('rad'), qa: an id in
// test/regressions/qa-1.3.0.md, todo: an open issue (the row then documents it without failing).
import { test } from 'node:test';
import assert from 'node:assert/strict';

export const A = (exact, approx, extra = {}) => ({ exact, approx, ...extra });

export function rows(S, table){
  for (const [lines, opts = {}, expected] of table) {
    const ls = [].concat(lines), { qa, todo, ...req } = opts;
    const name = ls.join(' ; ') + (Object.keys(req).length ? ' ' + JSON.stringify(req) : '') + (qa ? ` [${qa}]` : '');
    test(name, { todo }, async () => {
      const got = (await S.protocol.eval({ lines: ls, ...req })).at(-1);
      if (expected === null || !('exact' in expected || 'approx' in expected)) return assert.deepEqual(plain(got), expected);
      assert.ok(got && !got.invalid && !got.slow, 'expected an answer, got ' + JSON.stringify(got));
      for (const k of Object.keys(expected)) assert.deepEqual(got[k], expected[k], k);
    });
  }
}
const plain = x => x === null ? null : JSON.parse(JSON.stringify(x));
