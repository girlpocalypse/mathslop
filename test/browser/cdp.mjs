// A small Chrome DevTools Protocol client on Node's global WebSocket. No dependencies.
//
//   const b = await Browser.start({ ext: ROOT })          Chromium with the extension loaded (chromium.mjs)
//   const p = await b.openPanel({ hook: true })           panel.html in a new tab, caught paused before any
//                                                         script runs, so the hook and coverage go in first
//   await p.run((S, x) => …, x)                           evaluate in the page (S = the test adapter, if loaded)
//   await p.type('2+3'); await p.key('Enter', { ctrl })   trusted keyboard input
//   await p.click('#btn-menu')                            trusted mouse input at an element's centre
//   p.errors()                                            console errors, exceptions and CSP violations so far
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './chromium.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

export class Browser {
  static async start(opts = {}){
    const chrome = await launch({ ext: opts.ext ?? ROOT, profile: opts.profile, args: opts.args });
    const b = new Browser(chrome);
    await b.connect();
    return b;
  }
  constructor(chrome){ this.chrome = chrome; this.id = 0; this.pending = new Map(); this.handlers = new Set(); this.sessions = new Map(); }
  async connect(){
    this.ws = new WebSocket(this.chrome.wsUrl);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject, method } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? reject(new Error(`${method}: ${m.error.message} ${m.error.data || ''}`)) : resolve(m.result);
      } else for (const h of [...this.handlers]) h(m);
    };
    // Every new target is caught paused: openPanel prepares its own; anything else just runs.
    this.handlers.add(m => {
      if (m.method === 'Target.attachedToTarget') {
        const { sessionId, targetInfo, waitingForDebugger } = m.params;
        this.sessions.set(sessionId, targetInfo);
        if (waitingForDebugger && !this.claim?.(m.params)) this.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => {});
      }
    });
    await this.send('Target.setDiscoverTargets', { discover: true });
    await this.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  }
  send(method, params = {}, sessionId){
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  on(f){ this.handlers.add(f); return () => this.handlers.delete(f); }
  async targets(){ return (await this.send('Target.getTargets')).targetInfos; }
  // The extension's ID, from its service worker's URL.
  async extensionId(){
    for (let i = 0; i < 200; i++) {
      const sw = (await this.targets()).find(t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'));
      if (sw) return new URL(sw.url).host;
      await sleep(50);
    }
    throw new Error('extension service worker not found');
  }
  async serviceWorker(){
    const id = await this.extensionId();
    const t = (await this.targets()).find(t => t.type === 'service_worker' && t.url.includes(id));
    const { sessionId } = await this.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
    return new Session(this, sessionId, t);
  }
  // A new tab at url (default: the panel), paused until prepare(session) has run.
  async openPage(url, prepare = async () => {}){
    let resolveAttach;
    const attached = new Promise(r => { resolveAttach = r; });
    let wanted = null;
    const early = [];
    this.claim = p => {
      if (p.targetInfo.type !== 'page') return false;
      if (wanted && p.targetInfo.targetId !== wanted) return false;
      if (!wanted) { early.push(p); return true; }
      resolveAttach(p); return true;
    };
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank', background: false });
    wanted = targetId;
    const e = early.find(p => p.targetInfo.targetId === targetId);
    for (const p of early) if (p !== e) this.send('Runtime.runIfWaitingForDebugger', {}, p.sessionId).catch(() => {});
    if (e) resolveAttach(e);
    const info = await attached;
    this.claim = null;
    const s = new Page(this, info.sessionId, info.targetInfo);
    await s.setup();
    await prepare(s);
    await this.send('Runtime.runIfWaitingForDebugger', {}, info.sessionId);
    await s.goto(url);
    return s;
  }
  async panelUrl(file = 'panel.html'){ return `chrome-extension://${await this.extensionId()}/${file}`; }
  // The panel, with the test hook (and the adapter, test/browser/subjects.js) injected before panel.js runs.
  async openPanel({ hook = true, coverage = !!process.env.MATHSLOP_COVERAGE, before = '', file } = {}){
    const url = await this.panelUrl(file);
    return this.openPage(url, async p => {
      if (coverage) { await p.send('Profiler.enable'); await p.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true }); p.coverage = true; }
      if (before) await p.send('Page.addScriptToEvaluateOnNewDocument', { source: before });
      if (hook) {
        await p.send('Page.addScriptToEvaluateOnNewDocument', { source: 'globalThis.__mathslopTest = {};' });
        await p.send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(ROOT, 'test/browser/subjects.js'), 'utf8') });
      }
    });
  }
  async close(){
    try { this.ws.close(); } catch {}
    await this.chrome.close();
  }
}

class Session {
  constructor(browser, sessionId, info){ this.b = browser; this.sessionId = sessionId; this.info = info; this.log = []; this.net = []; }
  send(method, params){ return this.b.send(method, params, this.sessionId); }
  async eval(expression){
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true, replMode: true });
    if (r.exceptionDetails) throw new Error('in page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  // fn is serialized: it sees only its arguments (JSON) and the page's globals; S is the adapter, if loaded.
  run(fn, ...args){ return this.eval(`(${fn})(globalThis.S, ...${JSON.stringify(args)})`); }
}

const KEYS = {
  Enter: [13, 'Enter', '\r'], Backspace: [8, 'Backspace'], Tab: [9, 'Tab'], Escape: [27, 'Escape'], Delete: [46, 'Delete'],
  ArrowLeft: [37, 'ArrowLeft'], ArrowUp: [38, 'ArrowUp'], ArrowRight: [39, 'ArrowRight'], ArrowDown: [40, 'ArrowDown'],
  Home: [36, 'Home'], End: [35, 'End'], Shift: [16, 'ShiftLeft'], Control: [17, 'ControlLeft'],
};
const SHIFTED = { '!': ['1', 'Digit1'], '@': ['2', 'Digit2'], '#': ['3', 'Digit3'], $: ['4', 'Digit4'], '%': ['5', 'Digit5'],
  '^': ['6', 'Digit6'], '&': ['7', 'Digit7'], '*': ['8', 'Digit8'], '(': ['9', 'Digit9'], ')': ['0', 'Digit0'], _: ['-', 'Minus'],
  '+': ['=', 'Equal'], '{': ['[', 'BracketLeft'], '}': [']', 'BracketRight'], '|': ['\\', 'Backslash'], ':': [';', 'Semicolon'],
  '"': ["'", 'Quote'], '<': [',', 'Comma'], '>': ['.', 'Period'], '?': ['/', 'Slash'], '~': ['`', 'Backquote'] };
const PLAIN = { '-': [189, 'Minus'], '=': [187, 'Equal'], '[': [219, 'BracketLeft'], ']': [221, 'BracketRight'], '\\': [220, 'Backslash'],
  ';': [186, 'Semicolon'], "'": [222, 'Quote'], ',': [188, 'Comma'], '.': [190, 'Period'], '/': [191, 'Slash'], '`': [192, 'Backquote'], ' ': [32, 'Space'] };
const VK = { '1': 49, '2': 50, '3': 51, '4': 52, '5': 53, '6': 54, '7': 55, '8': 56, '9': 57, '0': 48, '-': 189, '=': 187, '[': 219, ']': 221,
  '\\': 220, ';': 186, "'": 222, ',': 188, '.': 190, '/': 191, '`': 192 };

// key, code, keyCode and text for one typed character, and whether it needs Shift.
export function charKey(ch){
  if (/[a-z]/.test(ch)) return { key: ch, code: 'Key' + ch.toUpperCase(), keyCode: ch.toUpperCase().charCodeAt(0), shift: false };
  if (/[A-Z]/.test(ch)) return { key: ch, code: 'Key' + ch, keyCode: ch.charCodeAt(0), shift: true };
  if (/[0-9]/.test(ch)) return { key: ch, code: 'Digit' + ch, keyCode: ch.charCodeAt(0), shift: false };
  if (SHIFTED[ch]) return { key: ch, code: SHIFTED[ch][1], keyCode: VK[SHIFTED[ch][0]], shift: true };
  if (PLAIN[ch]) return { key: ch, code: PLAIN[ch][1], keyCode: PLAIN[ch][0], shift: false };
  throw new Error('no key for ' + JSON.stringify(ch));
}

export class Page extends Session {
  async setup(){
    this.b.on(m => {
      if (m.sessionId !== this.sessionId && !this.frames?.has(m.sessionId)) return;
      const where = this.frames?.get(m.sessionId)?.url || 'panel';
      if (m.method === 'Runtime.consoleAPICalled') this.log.push({ where, level: m.params.type, text: m.params.args.map(a => a.value ?? a.description).join(' ') });
      if (m.method === 'Runtime.exceptionThrown') this.log.push({ where, level: 'exception', text: m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text });
      if (m.method === 'Log.entryAdded') this.log.push({ where, level: m.params.entry.level, source: m.params.entry.source, text: m.params.entry.text });
      if (m.method === 'Network.requestWillBeSent') this.net.push({ where, url: m.params.request.url });
      if (m.method === 'Target.attachedToTarget' && m.sessionId === this.sessionId) this.frame(m.params);
    });
    this.b.on(m => {   // frames attach before they navigate: keep their URLs current
      if (m.method === 'Target.targetInfoChanged') for (const [sid, t] of this.frames) if (t.targetId === m.params.targetInfo.targetId) this.frames.set(sid, m.params.targetInfo);
    });
    this.frames = new Map();
    for (const d of ['Page', 'Runtime', 'Log', 'Network']) await this.send(d + '.enable');
    await this.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    // The sandboxed engine frame is out of process: attach to it to see its console and network too.
    await this.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  }
  async frame({ sessionId, targetInfo, waitingForDebugger }){
    this.frames.set(sessionId, targetInfo);
    const s = (method, params) => this.b.send(method, params, sessionId);
    try {
      for (const d of ['Runtime', 'Log', 'Network']) await s(d + '.enable');
      if (this.coverage) { await s('Profiler.enable'); await s('Profiler.startPreciseCoverage', { callCount: true, detailed: true }); }
    } catch {}
    if (waitingForDebugger) await s('Runtime.runIfWaitingForDebugger').catch(() => {});
  }
  // The engine frame's session (the newest, after a watchdog restart).
  engineFrame(){
    const e = [...this.frames].filter(([, t]) => t.url.includes('sandbox.html')).at(-1);
    if (!e) return null;
    const sid = e[0];
    return { eval: async expression => {
      const r = await this.b.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid);
      if (r.exceptionDetails) throw new Error('in engine: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    } };
  }
  // The panel has booted: rows rendered, every line's math-field mounted, fonts loaded.
  async ready(){
    await this.waitFor(() => document.querySelector('.row') && [...document.querySelectorAll('.row math-field')].every(f => f.shadowRoot?.querySelector('.ML__container'))
      && document.fonts.status === 'loaded', { what: 'the panel to boot', timeout: 10000 });
    await sleep(150);
  }
  async goto(url){
    const loaded = new Promise(r => { const off = this.b.on(m => { if (m.sessionId === this.sessionId && m.method === 'Page.loadEventFired') { off(); r(); } }); });
    await this.send('Page.navigate', { url });
    await loaded;
  }
  async reload(){
    const loaded = new Promise(r => { const off = this.b.on(m => { if (m.sessionId === this.sessionId && m.method === 'Page.loadEventFired') { off(); r(); } }); });
    await this.send('Page.reload');
    await loaded;
  }
  async waitFor(fn, { timeout = 5000, args = [], what } = {}){
    const t0 = Date.now(); let last;
    while (Date.now() - t0 < timeout) {
      last = await this.run(fn, ...args);
      if (last) return last;
      await sleep(40);
    }
    throw new Error(`timed out waiting for ${what || fn} (last: ${JSON.stringify(last)})`);
  }
  // Console errors, exceptions and CSP violations (and warnings with all: true), optionally only new ones.
  errors({ all = false, since = 0 } = {}){
    return this.log.slice(since).filter(e => e.level === 'error' || e.level === 'exception' || (all && e.level === 'warning'));
  }
  // ---- input ----
  async key(name, { ctrl = false, shift = false, alt = false, meta = false, repeat = false, hold = 0 } = {}){
    const mods = (alt ? 1 : 0) | (ctrl ? 2 : 0) | (meta ? 4 : 0) | (shift ? 8 : 0);
    let keyCode, code, text, key = name;
    if (KEYS[name]) [keyCode, code, text] = KEYS[name];
    else { const k = charKey(name); keyCode = k.keyCode; code = k.code; if (!mods || (mods === 8)) text = name; }
    if (mods & ~8) text = undefined;
    const base = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers: mods, autoRepeat: repeat };
    await this.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text, unmodifiedText: text } : {}) });
    if (hold) await sleep(hold);
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }
  // Types text one real key per character; shortcuts (pi, sqrt, ans) need real keys, not insertText.
  async type(text, { delay = 15 } = {}){
    for (const ch of text) {
      const k = charKey(ch), mods = k.shift ? 8 : 0;
      const base = { key: ch, code: k.code, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode, modifiers: mods };
      await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: ch, unmodifiedText: ch });
      await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      if (delay) await sleep(delay);
    }
  }
  // Centre of an element: a CSS selector, or a JS expression giving the element (for shadow DOM).
  async point(target, { dx = 0.5, dy = 0.5 } = {}){
    const expr = target.startsWith('js:') ? target.slice(3) : `document.querySelector(${JSON.stringify(target)})`;
    return this.eval(`(() => { const el = ${expr}; if (!el) throw new Error('no element: ' + ${JSON.stringify(target)});
      el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect();
      return [r.x + r.width * ${dx}, r.y + r.height * ${dy}]; })()`);
  }
  async mouse(type, x, y, { button = 'left', shift = false, clickCount = 1 } = {}){
    await this.send('Input.dispatchMouseEvent', { type, x, y, button, clickCount, modifiers: shift ? 8 : 0, buttons: type === 'mouseReleased' ? 0 : (button === 'left' ? 1 : 2) });
  }
  async click(target, { shift = false, button = 'left', hold = 30, ...pt } = {}){
    const [x, y] = Array.isArray(target) ? target : await this.point(target, pt);
    await this.mouse('mouseMoved', x, y);
    await this.mouse('mousePressed', x, y, { button, shift });
    if (hold) await sleep(hold);
    await this.mouse('mouseReleased', x, y, { button, shift });
  }
  async drag(from, to, { steps = 5 } = {}){
    const [x0, y0] = Array.isArray(from) ? from : await this.point(from), [x1, y1] = Array.isArray(to) ? to : await this.point(to);
    await this.mouse('mouseMoved', x0, y0); await this.mouse('mousePressed', x0, y0);
    for (let i = 1; i <= steps; i++) await this.mouse('mouseMoved', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps);
    await this.mouse('mouseReleased', x1, y1);
  }
  // ---- coverage ----
  async takeCoverage(name){
    if (!this.coverage) return;
    const out = path.join(ROOT, 'coverage', 'browser'); fs.mkdirSync(out, { recursive: true });
    const { result } = await this.send('Profiler.takePreciseCoverage');
    const keep = result.filter(s => /^chrome-extension:\/\/[^/]+\/(?!vendor\/)/.test(s.url) || s.url.startsWith('file://') && !s.url.includes('/vendor/'));
    fs.writeFileSync(path.join(out, `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.json`), JSON.stringify(keep));
  }
  async close(){
    await this.takeCoverage(this.coverageName || 'page').catch(() => {});
    await this.b.send('Target.closeTarget', { targetId: this.info.targetId }).catch(() => {});
  }
}
