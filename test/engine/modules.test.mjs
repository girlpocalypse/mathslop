import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE, topLevelNames } from '../modules.mjs';
import { loadEngine, ROOT, scriptList } from './load.mjs';

test('every top-level name in sandbox.js has a place in test/modules.mjs', () => {
  const names = topLevelNames(fs.readFileSync(path.join(ROOT, 'sandbox.js'), 'utf8'));
  assert.ok(names.includes('evalLine') && names.includes('tick') && names.includes('gen'), 'scanner found the obvious names');
  assert.deepEqual(names.filter(n => !(n in ENGINE)), [], 'add these to ENGINE in test/modules.mjs');
  assert.deepEqual(Object.keys(ENGINE).filter(n => !names.includes(n)), [], 'stale entries in test/modules.mjs');
});

test('the hook exports exactly the names marked hook', t => {
  const eng = loadEngine(); t.after(() => eng.close());
  const hooked = Object.entries(ENGINE).filter(([, [, reach]]) => reach === 'hook').map(([n]) => n).sort();
  assert.deepEqual(Object.keys(eng.hook).sort(), hooked);
});

test('load.mjs runs the scripts sandbox.html lists, Compute Engine first', () => {
  const list = scriptList();
  assert.equal(list.at(-1), 'sandbox.js');
  assert.ok(list[0].includes('compute-engine'));
});
