// Loads the engine the way sandbox.html does, inside a Node vm context.
//
//   const eng = loadEngine({ ce: CE => class extends CE { … } });   // optional CE subclass
//   eng.hook                    the names sandbox.js exports to __mathslopTest (see subjects.mjs)
//   eng.send(msg)               deliver a message from the panel (always asynchronously, as in Chrome)
//   eng.messages                everything the engine posted, in order
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

export function loadEngine({ ce } = {}){
  const messages = [], waiters = [], channels = [];
  const listeners = [];
  // A MessageChannel that remembers itself: sandbox.js (and CE) open channels whose ports keep Node alive.
  class Channel extends MessageChannel { constructor(){ super(); channels.push(this); } }
  const parent = {
    postMessage(m){
      messages.push(m);
      for (const w of [...waiters]) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
      for (const f of onPost) f(m);
    }
  };
  const onPost = [];
  const window = { addEventListener: (type, f) => { if (type === 'message') listeners.push(f); } };
  const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, performance, Date,
    MessageChannel: Channel, parent, window, __mathslopTest: {} };
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
  const deliver = (data, source = parent) => listeners.forEach(f => f({ source, data }));
  const eng = {
    ctx, messages, hook: ctx.__mathslopTest.engine, CE: ctx.ComputeEngine && ctx.ComputeEngine.ComputeEngine,
    // Never synchronously: Chrome delivers postMessage as a task of its own.
    send(data, source){ setImmediate(() => deliver(data, source)); },
    onPost(f){ onPost.push(f); },
    waitFor(test){ return new Promise(resolve => { const m = messages.find(test); if (m) resolve(m); else waiters.push({ test, resolve }); }); },
    async eval(req){
      const id = req.id ?? nextId++;
      const p = eng.waitFor(m => m.type === 'result' && m.id === id);
      eng.send({ type: 'eval', mode: 'full', angle: 'rad', places: 'auto', skip: [], ...req, id });
      return (await p).results;
    },
    // One line's result (the lines before it go in the same request).
    async line(lines, opts = {}){ const ls = [].concat(lines); return (await eng.eval({ ...opts, lines: ls })).at(-1); },
    close(){ for (const c of channels) { c.port1.close(); c.port2.close(); } }
  };
  return eng;
}
