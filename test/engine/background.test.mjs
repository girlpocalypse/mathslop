// background.js: the toolbar icon opens the side panel, set on install and on every browser start.
// (Measured here: in the browser the service worker often starts before the test can attach to it.
// test/browser/e2e-menu.test.mjs checks the real thing.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './load.mjs';

function load(setPanelBehavior){
  const listeners = {}, errors = [];
  const event = name => ({ addListener: f => { listeners[name] = f; } });
  const ctx = { chrome: { runtime: { onInstalled: event('installed'), onStartup: event('startup') }, sidePanel: { setPanelBehavior } },
    console: { error: e => errors.push(e) } };
  const file = path.join(ROOT, 'background.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), ctx, { filename: pathToFileURL(file).href });
  return { listeners, errors };
}

test('install and startup both make the toolbar icon open the panel', async () => {
  const calls = [];
  const { listeners } = load(o => { calls.push(o); return Promise.resolve(); });
  listeners.installed(); listeners.startup();
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ openPanelOnActionClick: true }, { openPanelOnActionClick: true }]);
});
test('a failure is logged, not thrown', async () => {
  const { listeners, errors } = load(() => Promise.reject(new Error('no side panel')));
  listeners.installed(); listeners.startup();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(errors.length, 2);
});
