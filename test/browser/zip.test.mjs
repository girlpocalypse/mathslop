// The packaged extension: built from a temporary copy of the tree as a test zip
// (dist/mathslop-<version>-tests.zip; the release zip dist/mathslop-<version>.zip is never written or deleted),
// checked against what the shipped files reference and against the GitHub release, then loaded and smoke-tested.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, Browser } from './cdp.mjs';
import { settled, storage, sleep } from './fixture.mjs';

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${r.stderr || r.stdout}`);
  return r.stdout;
};
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const unzipList = f => run('python3', ['-I', '-c', 'import sys,zipfile; print("\\n".join(sorted(zipfile.ZipFile(sys.argv[1]).namelist())))', f]).trim().split('\n');
const unzip = (f, dir) => run('python3', ['-I', '-c', 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', f, dir]);
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version;
const RELEASE_ZIP = path.join(ROOT, 'dist', `mathslop-${VERSION}.zip`), TEST_ZIP = path.join(ROOT, 'dist', `mathslop-${VERSION}-tests.zip`);

// What the shipped files reference, followed from manifest.json, independently of package.sh's allowlist.
export function referenceClosure(dir){
  const out = new Set(['manifest.json']), queue = [];
  const add = (p, from = '') => {
    const rel = path.normalize(path.join(path.dirname(from), p.split(/[?#]/)[0])).replace(/^\/+/, '');
    if (!out.has(rel)) { out.add(rel); queue.push(rel); }
  };
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  Object.values(m.icons || {}).forEach(p => add(p));
  Object.values(m.action?.default_icon || {}).forEach(p => add(p));
  if (m.background?.service_worker) add(m.background.service_worker);
  if (m.side_panel?.default_path) add(m.side_panel.default_path);
  (m.sandbox?.pages || []).forEach(p => add(p));
  while (queue.length) {
    const f = queue.shift(), text = fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8') : '';
    if (f.endsWith('.html')) for (const mm of text.matchAll(/<(?:script|iframe|img|source)\b[^>]*\bsrc="([^"]+)"|<link\b[^>]*\bhref="([^"]+)"/g)) add(mm[1] || mm[2], f);
    if (f.endsWith('.css')) for (const [, u] of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) if (!u.startsWith('data:')) add(u, f);
    if (f.endsWith('.js') && !f.startsWith('vendor/')) for (const [, u] of text.matchAll(/(?:\bimport|\bexport[^;]*?\bfrom|\bimport\s*\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)) add(u, f);
  }
  // license texts ship too
  for (const f of ['LICENSE', 'LICENSE-MIT', 'LICENSE-WTFPL', 'COPYING']) if (fs.existsSync(path.join(dir, f))) out.add(f);
  for (const d of fs.readdirSync(path.join(dir, 'vendor'))) if (fs.existsSync(path.join(dir, 'vendor', d, 'LICENSE.txt'))) out.add(`vendor/${d}/LICENSE.txt`);
  return [...out].sort();
}

describe('the packaged extension', () => {
  let tmp, zipA, before1;
  before(() => {
    before1 = fs.existsSync(RELEASE_ZIP) ? sha(RELEASE_ZIP) : null;
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mathslop-zip-'));
    // A copy of the tree as it is now (tracked and untracked files git doesn't ignore): edits are tested too.
    const files = run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT }).split('\0').filter(Boolean);
    for (const f of files) { if (!fs.existsSync(path.join(ROOT, f))) continue; fs.mkdirSync(path.dirname(path.join(tmp, 'tree', f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(tmp, 'tree', f)); }
    const epoch = run('git', ['log', '-1', '--format=%ct'], { cwd: ROOT }).trim();
    const build = () => { run('bash', ['scripts/package.sh', '--suffix', 'tests'], { cwd: path.join(tmp, 'tree'), env: { ...process.env, SOURCE_DATE_EPOCH: epoch } });
      return path.join(tmp, 'tree', 'dist', `mathslop-${VERSION}-tests.zip`); };
    zipA = build(); const first = sha(zipA);
    fs.copyFileSync(zipA, path.join(tmp, 'first.zip'));
    assert.equal(sha(build()), first, 'two builds of the same tree are byte-identical');
    fs.mkdirSync(path.dirname(TEST_ZIP), { recursive: true });
    fs.copyFileSync(zipA, TEST_ZIP);
  });
  after(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    assert.equal(fs.existsSync(RELEASE_ZIP) ? sha(RELEASE_ZIP) : null, before1, 'the release zip is untouched');
  });

  test('the zip holds exactly what the shipped files reference', () => {
    const entries = unzipList(zipA).filter(e => !e.endsWith('/'));
    assert.deepEqual(entries, referenceClosure(path.join(tmp, 'tree')));
    for (const e of entries) assert.ok(!/^(test|scripts|store|docs|coverage|dist)\/|^package\.json$|^CLAUDE\.md$|^\./.test(e), 'not shipped: ' + e);
  });

  test('compared with the GitHub release, only the test hook statements differ', t => {
    const rel = path.join(tmp, 'release.zip');
    const r = spawnSync('gh', ['release', 'download', VERSION, '-p', `mathslop-${VERSION}.zip`, '-O', rel, '-R', 'mollymillions2035/mathslop'], { encoding: 'utf8' });
    if (r.status !== 0) return t.skip('GitHub release not reachable: ' + (r.stderr || '').trim().slice(0, 100));
    assert.deepEqual(unzipList(zipA), unzipList(rel), 'the same files');
    const a = path.join(tmp, 'a'), b = path.join(tmp, 'b'); unzip(zipA, a); unzip(rel, b);
    const unhook = s => s.replace(/\n\n  \/\/ Tests only \([^\n]*\n  if \(globalThis\.__mathslopTest\)[\s\S]*?\};\n(?=\}\)\(\);)/, '\n');
    const changed = [];
    for (const f of unzipList(zipA).filter(e => !e.endsWith('/'))) {
      const x = fs.readFileSync(path.join(a, f)), y = fs.readFileSync(path.join(b, f));
      if (x.equals(y)) continue;
      changed.push(f);
      assert.equal(unhook(x.toString('utf8')), y.toString('utf8'), `${f} differs by more than its test hook`);
    }
    assert.deepEqual(changed.sort(), ['panel.js', 'sandbox.js']);
  });

  test('CSP: no eval in the panel, eval but no network in the engine', async () => {
    const ext = path.join(tmp, 'ext-csp'); unzip(zipA, ext);
    const b = await Browser.start({ ext });
    try {
      const p = await b.openPanel({ hook: false });
      await p.ready();
      const panelGot = await p.eval(`(async () => {
        const blocked = [];
        document.addEventListener('securitypolicyviolation', e => blocked.push(e.violatedDirective.split(' ')[0]));
        const tryIt = f => { try { f(); return 'ran'; } catch (e) { return e.name; } };
        const r = { eval: tryIt(() => eval('1')), fn: tryIt(() => new Function('return 1')()) };
        r.fetch = await fetch('https://example.com/').then(() => 'fetched', e => e.name);
        const img = new Image(); img.src = 'https://example.com/x.png'; document.body.append(img);
        const fr = document.createElement('iframe'); fr.src = 'https://example.com/'; document.body.append(fr);
        await new Promise(res => setTimeout(res, 500));
        r.blocked = [...new Set(blocked)].sort();
        return r;
      })()`);
      assert.deepEqual({ fetch: panelGot.fetch, blocked: panelGot.blocked }, { fetch: 'TypeError', blocked: ['connect-src', 'frame-src', 'img-src'] });
      // eval from a page script (DevTools' own evaluation may eval regardless of the CSP)
      for (const f of ['csp-probe.html', 'csp-probe.js']) fs.copyFileSync(path.join(ROOT, 'test/browser', f), path.join(ext, f));
      const probe = await b.openPage(await b.panelUrl('csp-probe.html'));
      const got = await probe.eval('window.probe');
      assert.deepEqual({ eval: got.eval, fn: got.fn }, { eval: 'EvalError', fn: 'EvalError' });
      await probe.close();
      await p.waitFor(() => true);
      let engine = null;
      for (let i = 0; i < 50 && !engine; i++) { engine = p.engineFrame(); await sleep(100); }
      assert.ok(engine, 'the sandboxed engine frame');
      const engineGot = await engine.eval(`(async () => {
        const blocked = [];
        document.addEventListener('securitypolicyviolation', e => blocked.push(e.violatedDirective.split(' ')[0]));
        const r = { eval: eval('6*7'), fn: new Function('return 2')() };
        r.fetch = await fetch('https://oeis.org/search?q=1').then(() => 'fetched', e => e.name);
        const img = new Image(); img.src = 'https://example.com/x.png'; document.body.append(img);
        r.font = await new FontFace('x', 'url(https://example.com/x.woff2)').load().then(() => 'loaded', e => e.name);
        await new Promise(res => setTimeout(res, 300));
        r.blocked = [...new Set(blocked)].sort();
        return r;
      })()`);
      assert.equal(engineGot.eval, 42); assert.equal(engineGot.fn, 2);
      assert.equal(engineGot.fetch, 'TypeError'); assert.notEqual(engineGot.font, 'loaded');
      for (const d of ['connect-src', 'img-src']) assert.ok(engineGot.blocked.includes(d), d + ' blocked: ' + engineGot.blocked);
      const outside = p.net.filter(n => !n.url.startsWith('chrome-extension://') && !n.url.startsWith('data:') && !n.url.startsWith('about:'));
      assert.ok(outside.every(n => /example\.com|oeis\.org/.test(n.url)), 'only the probes above: ' + JSON.stringify(outside));
      await p.close();
    } finally { await b.close(); }
  });

  test('loaded in Chromium: the sample pad answers, with no console errors', async () => {
    const ext = path.join(tmp, 'ext'); unzip(zipA, ext);
    const b = await Browser.start({ ext });
    try {
      const p = await b.openPanel({ hook: false });
      await p.ready();
      await storage(p, 'set', { lines: ['\\sqrt{9+16}', '\\frac{1}{3}+\\frac{1}{6}', '\\sum_{n=1}^{100} n'], mode: 'arith' });
      await p.reload(); await p.ready();
      assert.deepEqual(await settled(p), ['=5', '=21 | =0.5', '=5050']);
      // a scripted session: every mode, the keyboard, Copy all, Import
      for (const m of ['full', 'off', 'arith']) { await p.click(`.segrow [data-mode=${m}]`); await sleep(80); if (await p.run(() => document.getElementById('ans-warn').open)) await p.click('#ans-ok'); await settled(p); }
      await p.click('js:document.querySelector(".row math-field")', { dx: 0.3 }); await p.click('#btn-kbd'); await sleep(500); await p.click('#btn-kbd');
      await p.click('#btn-menu'); await p.click('#btn-export'); await sleep(100); await p.click('#exp [data-fmt=text]'); await p.click('#exp-cancel');
      await p.click('#btn-menu'); await p.click('#btn-import'); await sleep(100); await p.click('#imp-ok'); await settled(p);
      assert.deepEqual(p.errors(), []);
      const outside = p.net.filter(n => !n.url.startsWith('chrome-extension://') && !n.url.startsWith('data:'));
      assert.deepEqual(outside, [], 'nothing but the extension\'s own files was requested');
      await p.close();
    } finally { await b.close(); }
  });
});
