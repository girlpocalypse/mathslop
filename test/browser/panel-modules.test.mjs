// The panel's module map (test/modules.mjs) is complete, and the hook exports exactly its 'hook' names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PANEL, topLevelNames } from '../modules.mjs';
import { ROOT } from './cdp.mjs';
import { useBrowser, sharedPanel } from './fixture.mjs';

const ctx = useBrowser(), sp = sharedPanel(ctx);

test('every top-level name in panel.js has a place in test/modules.mjs', () => {
  const names = topLevelNames(fs.readFileSync(path.join(ROOT, 'panel.js'), 'utf8'));
  assert.ok(names.includes('hist') && names.includes('menuEscAt') && names.includes('copyText'));
  assert.deepEqual(names.filter(n => !(n in PANEL)), [], 'add these to PANEL in test/modules.mjs');
  assert.deepEqual(Object.keys(PANEL).filter(n => !names.includes(n)), [], 'stale entries in test/modules.mjs');
});

test('the hook exports exactly the names marked hook', async () => {
  const exported = await sp.p.run(() => Object.keys(Object.getOwnPropertyDescriptors(globalThis.__mathslopTest.panel)).sort());
  assert.deepEqual(exported, Object.entries(PANEL).filter(([, [, r]]) => r === 'hook').map(([n]) => n).sort());
});
