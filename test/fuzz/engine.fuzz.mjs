// Engine fuzzer (CLAUDE.md open item 4): generated and mutated lines through sandbox.js.
//   FUZZ_SEED=n FUZZ_ITERATIONS=n node test/fuzz/engine.fuzz.mjs
// Properties:
//   - every eval ends in one result with an entry per line, of the protocol's shape; nothing escapes
//   - no job outlives its lines × 1.5 s plus slack (a hang is reported with its line)
//   - approxIsExact ⇒ the decimal shown really is the exact value (checked with BigInt rationals, not CE's isEqual)
//   - with fixed Decimals, a real decimal has at most that many places, and exactly that many when shown with ≈
//   - the same request gives the same answers; after requests sent back to back, the last one's answers equal a solo run
// Findings go to coverage/fuzz/engine-<seed>.json. Exit 1 if any property failed.
import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rng, ITERATIONS } from './rng.mjs';
import { line, expr, mutate, SEEDS } from './lines.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const r = rng(), findings = [], checked = { answers: 0, exact: 0, places: 0, determinism: 0, batches: 0, invalid: 0, slow: 0 };
const find = (kind, detail) => { findings.push({ kind, ...detail }); console.log(`✖ ${kind}: ${JSON.stringify(detail).slice(0, 300)}`); };

let worker = null;
const spawn = () => { worker = new Worker(new URL('./engine-worker.mjs', import.meta.url)); worker.unref(); };
function call(msg, ms){
  return new Promise(resolve => {
    const timer = setTimeout(() => { worker.removeAllListeners('message'); worker.terminate(); spawn(); resolve({ timeout: true }); }, ms);
    worker.once('message', m => { clearTimeout(timer); resolve(m); });
    worker.postMessage(msg);
  });
}

// "-1.2\,3\overline{45}\cdot10^{-7}" → [p, q], or null if it isn't a plain real decimal.
export function decimalValue(latex){
  const s = latex.replace(/\\,|\s/g, ''), m = /^(-?)(\d+)(?:\.(\d*))?(?:\\overline\{(\d+)\})?(?:\\cdot10\^\{(-?\d+)\})?$/.exec(s);
  if (!m) return null;
  const [, sign, int, frac = '', rep, e = '0'] = m;
  let p, q;
  if (rep) { const a = BigInt(int + frac + rep), b = BigInt(int + frac); p = a - b; q = (10n ** BigInt(rep.length) - 1n) * 10n ** BigInt(frac.length); }
  else { p = BigInt(int + frac); q = 10n ** BigInt(frac.length); }
  const k = BigInt(e); if (k >= 0n) p *= 10n ** k; else q *= 10n ** -k;
  return [sign ? -p : p, q];
}
const fracDigits = latex => { const m = /^-?\d+(?:\.(\d*))?$/.exec(latex.replace(/\\,|\s/g, '')); return m ? (m[1] || '').length : null; };
const shapeOk = x => x === null || (typeof x === 'object' && (
  (Object.keys(x).join() === 'invalid' && typeof x.invalid === 'string') || (Object.keys(x).join() === 'slow' && x.slow === true) ||
  (Object.keys(x).join() === 'exact,approx,approxIsExact,group' && (x.exact === null || typeof x.exact === 'string') &&
    (x.approx === null || typeof x.approx === 'string') && (x.exact || x.approx) && typeof x.approxIsExact === 'boolean' && typeof x.group === 'boolean')));

spawn();
console.log(`engine fuzz: seed ${r.seed}, ${ITERATIONS} requests`);
const t0 = Date.now();
for (let n = 0; n < ITERATIONS; n++) {
  // half the requests: one numeric line, whose exact value can be checked on its own
  const lines = r.chance(0.5) ? [expr(r, 3, true)] : Array.from({ length: r.int(1, 4) }, () => r.chance(0.3) ? mutate(r, r.pick(SEEDS)) : line(r));
  const req = { type: 'eval', lines, mode: r.pick(['arith', 'full']), angle: r.pick(['rad', 'deg']), places: r.pick(['auto', 'auto', 0, 1, 2, 3, 6, 10]), skip: [] };
  const res = await call({ op: 'eval', req }, lines.length * 1500 + 5000);
  if (res.timeout) { find('hang', { req }); continue; }
  if (res.error) { find('exception', { req, error: res.error }); continue; }
  const out = res.results;
  if (!Array.isArray(out) || out.length !== lines.length) { find('result length', { req, out }); continue; }
  out.forEach((x, i) => {
    if (!shapeOk(x)) find('result shape', { req, line: lines[i], result: x });
    if (x?.invalid) checked.invalid++; else if (x?.slow) checked.slow++; else if (x) checked.answers++;
  });
  // exactness and places, for single lines (no := context to replay)
  const x = out.at(-1);
  if (lines.length === 1 && x && x.approx) {
    if (x.approxIsExact && !x.approx.includes('\\imaginaryI')) {
      const shown = decimalValue(x.approx), exact = await call({ op: 'exact', line: lines[0] }, 5000);
      if (exact && !exact.timeout && !exact.error) {
        checked.exact++;
        const [p, q] = [BigInt(exact.p), BigInt(exact.q)];
        if (!shown || shown[0] * q !== p * shown[1]) find('"=" decimal is not exact', { req, result: x, exact: `${exact.p}/${exact.q}` });
      }
    }
    if (typeof req.places === 'number' && !x.approx.includes('\\imaginaryI') && !x.approx.includes('\\cdot10') && !x.approx.includes('\\overline')) {
      const d = fracDigits(x.approx); if (d !== null) checked.places++;
      if (d !== null && (d > req.places || (!x.approxIsExact && d !== req.places)))
        find('decimal places', { req, result: x, places: req.places, got: d });
    }
  }
  if (n % 10 === 0) {
    const again = await call({ op: 'eval', req }, lines.length * 1500 + 5000);
    checked.determinism++;
    if (!again.timeout && JSON.stringify(again.results) !== JSON.stringify(out)) find('not deterministic', { req, first: out, second: again.results });
  }
  if (n % 25 === 0) {
    const reqs = Array.from({ length: r.int(2, 5) }, () => ({ ...req, lines: Array.from({ length: r.int(1, 3) }, () => line(r)) }));
    const batch = await call({ op: 'batch', reqs }, 30000), solo = await call({ op: 'eval', req: reqs.at(-1) }, 30000);
    checked.batches++;
    if (!batch.timeout && !solo.timeout && JSON.stringify(batch.results) !== JSON.stringify(solo.results)) find('replaced requests leak', { reqs, batch: batch.results, solo: solo.results });
  }
}
await worker.terminate();
const dir = path.join(ROOT, 'coverage', 'fuzz'); fs.mkdirSync(dir, { recursive: true });
if (findings.length) fs.writeFileSync(path.join(dir, `engine-${r.seed}.json`), JSON.stringify(findings, null, 1));
console.log('checked:', JSON.stringify(checked));
console.log(`\nengine fuzz: ${ITERATIONS} requests in ${((Date.now() - t0) / 1000).toFixed(0)} s, ${findings.length} finding(s), seed ${r.seed}` +
  (findings.length ? ` → coverage/fuzz/engine-${r.seed}.json` : ''));
process.exit(findings.length ? 1 : 0);
