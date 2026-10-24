// panel latex, keycaps and colors: the pure helpers, run in the page against the real MathLive.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser, sharedPanel } from './fixture.mjs';
import { TO_TEXT, PORTABLE, SPOKEN, IS_SUM, PARSE_IMPORT, ANSWER_PARTS } from '../cases/latex.mjs';
import { PRETTY_LATEX, PRETTY_CAP, COLOR_PALETTE } from '../cases/keycaps.mjs';

const ctx = useBrowser(), sp = sharedPanel(ctx);
// Runs fn over a table in the page: [[input, expected]] → [[input, got]].
const table = (mod, fn, rows) => sp.p.run((S, mod, fn, ins) => ins.map(i => S[mod][fn](i)), mod, fn, rows.map(r => r[0]));
const check = (mod, fn, rows) => test(`${fn} (${rows.length} rows)`, async () => {
  const got = await table(mod, fn, rows);
  rows.forEach(([i, want], k) => assert.deepEqual(got[k], want, JSON.stringify(i)));
});

describe('latex', () => {
  check('latex', 'toText', TO_TEXT);
  check('latex', 'portable', PORTABLE);
  check('latex', 'spoken', SPOKEN);
  check('latex', 'isSum', IS_SUM);
  check('latex', 'parseImport', PARSE_IMPORT);
  test(`answerParts (${ANSWER_PARTS.length} rows)`, async () => {
    const got = await sp.p.run((S, rows) => rows.map(([res, order]) => S.latex.answerParts(res, order)), ANSWER_PARTS.map(r => [r[0], r[1]]));
    ANSWER_PARTS.forEach(([res, order, want], k) => assert.deepEqual(got[k], want, JSON.stringify([res, order])));
  });
});

describe('keycaps', () => {
  check('keycaps', 'prettyLatex', PRETTY_LATEX);
  check('keycaps', 'prettyCap', PRETTY_CAP);
  test('spokenKey: entities decoded, plain keys left to MathLive, placeholders read from the pretty form', async () => {
    const got = await sp.p.run(S => ['&divide;', '&times;', 'x', '7', '#@^2}', '\\sqrt{#0}'].map(k => S.keycaps.spokenKey(k)));
    assert.deepEqual(got.slice(0, 4), ['÷', '×', null, null]);
    for (const said of got.slice(4)) assert.ok(said && !/#|@|\\/.test(said), said);
  });
  test('spokenKey: a convert that throws gives null', async () => {
    assert.equal(await sp.p.run(S => {
      const f = MathLive.convertLatexToSpeakableText; MathLive.convertLatexToSpeakableText = () => { throw new Error('x'); };
      try { return S.keycaps.spokenKey('\\pi'); } finally { MathLive.convertLatexToSpeakableText = f; }
    }), null);
  });
  test('every live keycap: no placeholder box shown, and the original still inserted', async () => {
    const bad = await sp.p.run(S => {
      const out = [];
      const walk = (k, where) => {
        if (!k || typeof k !== 'object') { if (typeof k === 'string' && /#[@?0]/.test(k)) out.push([where, k]); return; }
        if (!k.label && typeof k.latex === 'string' && /#[@?0]/.test(k.latex)) out.push([where, k.latex]);
        if (k.shift) walk(k.shift, where + ' shift');
        if (Array.isArray(k.variants)) k.variants.forEach(v => walk(v, where + ' variant'));
      };
      for (const layout of mathVirtualKeyboard.layouts) for (const layer of layout.layers || []) for (const row of layer.rows || []) for (const k of row) walk(k, layout.label || layout.id);
      return out;
    });
    assert.deepEqual(bad, []);
  });
});

describe('colors', () => {
  test('colorFor: stable, in the palette, A and a apart', async () => {
    const got = await sp.p.run(S => { const c = S.colors.colorFor; return { x: [c('x'), c('x')], xy: [c('x'), c('y')], aA: [c('a'), c('A')], all: ['x', 'Q', 'é', 'Δ', 'xx'].map(c) }; });
    assert.equal(got.x[0], got.x[1]);
    assert.notEqual(got.xy[0], got.xy[1]);
    assert.notEqual(got.aA[0], got.aA[1]);
    for (const c of got.all) assert.ok(COLOR_PALETTE.includes(c), c);
  });
});
