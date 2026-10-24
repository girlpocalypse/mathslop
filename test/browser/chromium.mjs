// Starts a private headless Chromium with an unpacked extension loaded.
// Branded Chrome no longer accepts --load-extension; Chromium and Chrome for Testing do. $CHROMIUM picks the binary.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function chromiumPath(){
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  // The real binary, not the distribution's launcher: Arch's `chromium` adds the flags (and extensions) from
  // ~/.config/chromium-flags.conf, which would leak the user's desktop setup into the tests.
  for (const f of ['/usr/lib/chromium/chromium', '/usr/lib/chromium-browser/chromium-browser']) if (fs.existsSync(f)) return f;
  for (const name of ['chromium', 'chromium-browser']) {
    const r = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  throw new Error('No Chromium found: install chromium or set CHROMIUM=/path/to/chromium');
}

// launch({ ext, profile }) → { port, wsUrl, profile, close() }. profile: reuse a profile directory (a restart).
export async function launch({ ext, profile, args = [] } = {}){
  const dir = profile || fs.mkdtempSync(path.join(os.tmpdir(), 'mathslop-test-'));
  const portFile = path.join(dir, 'DevToolsActivePort');
  fs.rmSync(portFile, { force: true });
  const proc = spawn(chromiumPath(), [
    '--headless=new', `--user-data-dir=${dir}`, '--remote-debugging-port=0',
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-background-networking',
    '--disable-component-update', '--window-size=420,900',
    // Nothing may reach the network; a request that tries shows up in the network log, then fails here.
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',
    ...(ext ? [`--load-extension=${ext}`, `--disable-extensions-except=${ext}`] : []),
    // CHROMIUM_FLAGS: extra flags for this machine, e.g. --no-sandbox on CI runners without user namespaces
    ...(process.env.CHROMIUM_FLAGS || '').split(/\s+/).filter(Boolean),
    ...args, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });   // its own process group: close() ends the helpers too
  let stderr = '';
  // CHROMIUM_LOG=dir: keep each browser's stderr in dir (CI uploads it)
  const log = process.env.CHROMIUM_LOG && (fs.mkdirSync(process.env.CHROMIUM_LOG, { recursive: true }), fs.createWriteStream(path.join(process.env.CHROMIUM_LOG, `${path.basename(dir)}.log`)));
  proc.stderr.on('data', d => { log?.write(d); stderr += d; if (stderr.length > 20000) stderr = stderr.slice(-10000); });
  const t0 = Date.now();
  while (!fs.existsSync(portFile) || fs.readFileSync(portFile, 'utf8').split('\n').length < 2) {
    if (proc.exitCode !== null) throw new Error('Chromium exited: ' + stderr.slice(-2000));
    if (Date.now() - t0 > 20000) { proc.kill(); throw new Error('Chromium did not start: ' + stderr.slice(-2000)); }
    await new Promise(r => setTimeout(r, 50));
  }
  const [port, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
  return {
    port: +port, wsUrl: `ws://127.0.0.1:${port}${wsPath}`, profile: dir, proc,
    async close({ keepProfile = !!profile } = {}){
      const group = sig => { try { process.kill(-proc.pid, sig); } catch {} };
      if (proc.exitCode === null) {
        group('SIGTERM');
        await new Promise(r => { proc.once('exit', r); setTimeout(() => { group('SIGKILL'); r(); }, 5000); });
      }
      group('SIGKILL');   // helper processes that outlive the browser would keep writing to the profile
      if (!keepProfile) {
        try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
        catch (e) { console.warn(`could not remove the test profile ${dir}: ${e.code}`); }   // a leftover temp dir isn't a test failure
      }
    }
  };
}
