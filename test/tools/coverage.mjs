// Browser coverage report, per future module (test/modules.mjs).
//   node test/tools/coverage.mjs            read coverage/browser/*.json (written when MATHSLOP_COVERAGE=1)
// For panel.js, V8's block ranges are
// unioned across every test session: a character is covered if any session ran it. A line is uncovered when
// none of its code ran (blank and comment-only lines don't count). Each function and line belongs to the
// module of the nearest top-level declaration above it.
//
// Targets: the pure modules (STRICT) need every line and function covered; the DOM-heavy ones every function.
// Anything else uncovered must be listed in test/coverage-allow.json as { module, snippet, reason }; a listed
// snippet that is now covered fails too, so the list stays honest. Writes coverage/browser.lcov.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PANEL, topLevelDecls } from '../modules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STRICT = new Set(['settings', 'latex', 'keycaps', 'colors', 'history', 'bridge']);
const FILES = { 'panel.js': PANEL };   // sandbox.js and background.js are measured in Node (test/engine/)

const dir = path.join(ROOT, 'coverage', 'browser');
const runs = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) : [];
if (!runs.length) { console.error('coverage: no browser coverage in coverage/browser/ (run with MATHSLOP_COVERAGE=1)'); process.exit(1); }
const allow = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/coverage-allow.json'), 'utf8'));
const used = new Set();
let failed = false, lcov = '';

for (const [file, map] of Object.entries(FILES)) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const covered = new Uint8Array(src.length), seen = new Uint8Array(src.length);
  const fns = new Map();   // start offset → { name, end, hit }
  let scripts = 0;
  for (const run of runs) for (const script of run) {
    if (!script.url.endsWith('/' + file)) continue;
    scripts++;
    const counts = new Int32Array(src.length).fill(-1);
    const ranges = script.functions.flatMap(f => f.ranges.map((r, i) => ({ ...r, fn: i === 0 ? f : null })))
      .sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
    for (const r of ranges) {
      counts.fill(r.count, r.startOffset, Math.min(r.endOffset, src.length));
      if (r.fn && r.startOffset > 0) {
        const f = fns.get(r.startOffset) || { name: r.fn.functionName || '(anonymous)', end: r.endOffset, hit: false };
        f.hit ||= r.count > 0; fns.set(r.startOffset, f);
      }
    }
    for (let i = 0; i < src.length; i++) if (counts[i] >= 0) { seen[i] = 1; if (counts[i] > 0) covered[i] = 1; }
  }
  if (!scripts) { console.error(`coverage: ${file} was never measured`); failed = true; continue; }

  const decls = map ? topLevelDecls(src) : [];
  const moduleAt = off => { let m = map ? 'pad' : file; for (const d of decls) { if (d.offset > off) break; m = (map[d.name] || ['?'])[0]; } return m; };
  // code characters: not whitespace, not inside comments
  const code = new Uint8Array(src.length);
  for (let i = 0, inLine = false, inBlock = false, q = null; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (q) { code[i] = 1; if (c === '\\') { code[i + 1] = 1; i++; } else if (c === q) q = null; continue; }
    if (c === '/' && n === '/' && !/[\w)\]]\s*$/.test(src.slice(Math.max(0, i - 3), i)) ) { inLine = true; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') q = c;
    if (!/\s/.test(c)) code[i] = 1;
  }
  const lines = src.split('\n'), report = {};
  let off = 0;
  const lineHits = [];
  lines.forEach((text, ln) => {
    let any = false, hit = false;
    for (let i = off; i < off + text.length; i++) if (code[i] && seen[i]) { any = true; if (covered[i]) hit = true; }
    const mod = moduleAt(off);
    const r = report[mod] ??= { lines: 0, hit: 0, fns: 0, fnHit: 0, missLines: [], missFns: [] };
    if (any) { r.lines++; if (hit) r.hit++; else r.missLines.push([ln + 1, text.trim()]); lineHits.push([ln + 1, hit ? 1 : 0]); }
    off += text.length + 1;
  });
  for (const [start, f] of fns) {
    const r = report[moduleAt(start)] ??= { lines: 0, hit: 0, fns: 0, fnHit: 0, missLines: [], missFns: [] };
    r.fns++; if (f.hit) r.fnHit++; else r.missFns.push([src.slice(0, start).split('\n').length, f.name, src.slice(start, start + 60).split('\n')[0]]);
  }

  console.log(`\n${file}`);
  console.log('  module      lines            functions');
  for (const [mod, r] of Object.entries(report).sort()) {
    const pct = (a, b) => b ? (100 * a / b).toFixed(1).padStart(5) + '%' : '    -';
    console.log(`  ${mod.padEnd(10)}  ${pct(r.hit, r.lines)} ${String(r.hit).padStart(4)}/${String(r.lines).padEnd(4)}  ${pct(r.fnHit, r.fns)} ${r.fnHit}/${r.fns}`);
    const allowed = text => { const a = allow.find(a => (a.module === mod || a.module === file) && text.includes(a.snippet)); if (a) used.add(a); return a; };
    for (const [ln, name, text] of r.missFns) if (!allowed(text)) { console.log(`    ✖ function not run, ${file}:${ln} ${name}: ${text}`); failed = true; }
    if (STRICT.has(mod) || !map) for (const [ln, text] of r.missLines) if (!allowed(text)) { console.log(`    ✖ line not run, ${file}:${ln}: ${text}`); failed = true; }
    if (!STRICT.has(mod) && map) for (const [ln, text] of r.missLines) if (!allowed(text)) console.log(`    · line not run, ${file}:${ln}: ${text}`);
  }
  lcov += `TN:\nSF:${file}\n` + lineHits.map(([l, h]) => `DA:${l},${h}`).join('\n') + `\nLF:${lineHits.length}\nLH:${lineHits.filter(x => x[1]).length}\nend_of_record\n`;
}
for (const a of allow) if (!used.has(a)) { console.log(`  ✖ coverage-allow.json entry no longer needed (now covered, or the code changed): ${a.module}: ${a.snippet}`); failed = true; }
fs.writeFileSync(path.join(ROOT, 'coverage', 'browser.lcov'), lcov);
console.log(failed ? '\ncoverage: FAILED' : '\ncoverage: ok');
process.exit(failed ? 1 : 0);
