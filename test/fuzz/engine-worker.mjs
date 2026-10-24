// The engine in a worker, so the fuzzer can kill a job that never ends. Messages:
//   { op: 'eval', req }            → { results, ms }
//   { op: 'exact', line }          → the line's exact value as the engine sees it: { p, q } (strings) or null
//   { op: 'batch', reqs }          → several requests sent back to back in browser task order → the last one's results
import { parentPort } from 'node:worker_threads';
import { loadEngine } from '../engine/load.mjs';

const eng = loadEngine(), fifo = loadEngine({ fifo: true }), H = eng.hook;
let id = 1;
parentPort.on('message', async m => {
  try {
    if (m.op === 'eval') { const t0 = performance.now(); const results = await eng.eval({ ...m.req, id: id++ }); parentPort.postMessage({ results, ms: performance.now() - t0 }); }
    else if (m.op === 'exact') {
      const ce = new eng.CE(), src = m.line.trim().replace(/\\differentialD(?![a-zA-Z])/g, '\\mathrm{d}').replace(/[\^_]\{\}/g, '');
      const val = ce.parse(src).evaluate(), r = val.im === 0 ? H.exactValue(val) : null;
      parentPort.postMessage(r ? { p: String(r[0]), q: String(r[1]) } : null);
    } else if (m.op === 'batch') {
      const ids = m.reqs.map(() => id++), last = ids.at(-1);
      const done = fifo.waitFor(x => x.type === 'result' && x.id === last);
      m.reqs.forEach((req, k) => fifo.send({ type: 'eval', skip: [], ...req, id: ids[k] }));
      parentPort.postMessage({ results: structuredClone((await done).results) });
    }
  } catch (e) { parentPort.postMessage({ error: String(e && e.stack || e) }); }
});
