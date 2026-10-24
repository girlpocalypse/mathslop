// npm run test:engine — the Node engine tests with the coverage gate.
// Coverage is measured by exclusion (vendor/ and test/ left out), so a new engine file is measured without
// changing this script. The gate also fails unless sandbox.js was actually measured: Node prints 100% and
// passes when nothing matches.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lcov = path.join(ROOT, 'coverage', 'engine.lcov');
fs.mkdirSync(path.dirname(lcov), { recursive: true });
fs.rmSync(lcov, { force: true });
const files = fs.readdirSync(path.join(ROOT, 'test/engine')).filter(f => f.endsWith('.test.mjs')).map(f => 'test/engine/' + f);
const gate = process.argv.includes('--no-gate') ? [] : ['--test-coverage-lines=100', '--test-coverage-branches=100', '--test-coverage-functions=100'];
const r = spawnSync(process.execPath, [
  '--test', '--experimental-test-coverage',
  '--test-coverage-exclude=vendor/**', '--test-coverage-exclude=test/**',
  ...gate,
  '--test-reporter=spec', '--test-reporter-destination=stdout',
  '--test-reporter=lcov', '--test-reporter-destination=' + lcov,
  ...process.argv.slice(2).filter(a => a !== '--no-gate'),   // extra node flags go before the files
  ...files
], { cwd: ROOT, stdio: 'inherit' });
let status = r.status ?? 1;
const measured = fs.existsSync(lcov) && /^SF:(.*\/)?sandbox\.js$/m.test(fs.readFileSync(lcov, 'utf8'));
if (!measured) { console.error('\ncoverage gate: sandbox.js was not measured (see test/tools/run-engine.mjs)'); status = 1; }
process.exit(status);
