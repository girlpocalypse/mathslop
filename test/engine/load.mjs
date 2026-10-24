// Loads the engine the way sandbox.html does, inside a Node vm context.
//
//   const eng = loadEngine({ ce: CE => class extends CE { … }, fifo: true });   // optional CE subclass; browser task order
//   eng.hook                    the names sandbox.js exports to __mathslopTest (see subjects.mjs)
//   eng.send(msg)               deliver a message from the panel (always asynchronously)
//   eng.messages                everything the engine posted, in order (eng.log also has the deliveries)
//   await eng.eval({ lines })   send an eval and wait for its result
//   eng.close()                 close the MessageChannel ports so Node can exit
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The engine's scripts, in the order sandbox.html loads them.
export function scriptList(){
  const html = fs.readFileSync(path.join(ROOT, 'sandbox.html'), 'utf8');
  return [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);
}

let nextId = 1000;

export function loadEngine({ ce, fifo } = {}){
  const messages = [], waiters = [], channels = [], log = [];   // log: { in } deliveries and { out } posts, in order
  const listeners = [];
  // A MessageChannel that remembers itself: sandbox.js (and CE) open channels whose ports keep Node alive.
  class Channel extends MessageChannel { constructor(){ super(); channels.push(this); } }
  // fifo: one task queue for ticks and incoming messages, as in a browser. Node drains a port's whole queue
  // before it looks at anything else, so with real channels a request can't land between two ticks.
  const tasks = [];
  let pumping = false;
  const queue = f => { tasks.push(f); if (!pumping) { pumping = true; setImmediate(pump); } };
  function pump(){ const f = tasks.shift(); if (f) f(); if (tasks.length) setImmediate(pump); else pumping = false; }
  class FifoPort {
    constructor(){ this.other = null; this.onmessage = null; this.closed = false; }
    postMessage(data){ const o = this.other; queue(() => { if (!o.closed && o.onmessage) o.onmessage({ data }); }); }
    close(){ this.closed = true; }
  }
  class FifoChannel { constructor(){ this.port1 = new FifoPort(); this.port2 = new FifoPort(); this.port1.other = this.port2; this.port2.other = this.port1; channels.push(this); } }
  const parent = {
    postMessage(m){
      messages.push(m); log.push({ out: m });
      for (const w of [...waiters]) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
      for (const f of onPost) f(m);
    }
  };
  const onPost = [];
  const window = { addEventListener: (type, f) => { if (type === 'message') listeners.push(f); } };
  const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, performance, Date,
    MessageChannel: fifo ? FifoChannel : Channel, parent, window, __mathslopTest: {} };
  ctx.globalThis = ctx; ctx.self = ctx; window.parent = parent;
  vm.createContext(ctx);
  for (const src of scriptList()) {
    const file = path.join(ROOT, src);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: pathToFileURL(file).href });
    // Between Compute Engine and sandbox.js: sandbox.js captures the constructor as it loads.
    if (ce && /compute-engine/.test(src)) {
      const CE = ctx.ComputeEngine.ComputeEngine;
      ctx.ComputeEngine = { ...ctx.ComputeEngine, ComputeEngine: ce(CE) };
    }
  }
  const deliver = (data, source = parent) => { log.push({ in: data }); listeners.forEach(f => f({ source, data })); };
  const eng = {
    ctx, messages, log, hook: ctx.__mathslopTest.engine, CE: ctx.ComputeEngine && ctx.ComputeEngine.ComputeEngine,
    // Never synchronously: that makes orders Chrome can't (a second progress(0) from inside the first).
    // A microtask runs once the engine's current task has posted its tick, so a request sent from inside
    // progress(i) lands between lines. (Node drains MessageChannel ticks ahead of setImmediate, so a
    // macrotask would only arrive after the whole job.)
    send(data, source){ if (fifo) queue(() => deliver(data, source)); else queueMicrotask(() => deliver(data, source)); },
    onPost(f){ onPost.push(f); },
    waitFor(test){ return new Promise(resolve => { const m = messages.find(test); if (m) resolve(m); else waiters.push({ test, resolve }); }); },
    async eval(req){
      const id = req.id ?? nextId++;
      const p = eng.waitFor(m => m.type === 'result' && m.id === id);
      eng.send({ type: 'eval', mode: 'full', angle: 'rad', places: 'auto', skip: [], ...req, id });
      return structuredClone((await p).results);   // this realm's arrays, for deepStrictEqual
    },
    // One line's result (the lines before it go in the same request).
    async line(lines, opts = {}){ const ls = [].concat(lines); return (await eng.eval({ ...opts, lines: ls })).at(-1); },
    close(){ for (const c of channels) { c.port1.close(); c.port2.close(); } }
  };
  return eng;
}
