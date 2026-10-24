// engine/lines: evalLine and its helpers (key, parseError, libraryHas, the Greek and constant lists).
// The QA regressions are rows of these tables, tagged with their id in test/regressions/qa-1.3.0.md.
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { subjects } from './subjects.mjs';
import { rows, A } from './rows.mjs';

const S = subjects(), L = S.lines;
after(() => S.close());
const eq = (exact, approx) => A(exact, approx, { approxIsExact: true });
const ap = (exact, approx) => A(exact, approx, { approxIsExact: false });
const arith = { mode: 'arith' };

describe('key: telling an answer from the line as typed', () => {
  for (const [a, b] of [
    ['\\frac13', '\\frac{1}{3}'], ['\\sin\\left(1\\right)', '\\sin(1)'], ['5\\,050', '5050'], ['2^{}3', '23'],
    ['x_{}', 'x'], ['\\exponentialE^{2}', 'e^2'], ['2\\imaginaryI', '2i'], ['1 + 2', '1+2'],
  ]) test(`${a} ≡ ${b}`, () => assert.equal(L.key(a), L.key(b)));
  test('\\leftarrow is not \\left', () => assert.notEqual(L.key('\\leftarrow'), L.key('arrow')));
  test('braces around more than one character stay', () => assert.notEqual(L.key('\\frac{12}{3}'), L.key('\\frac123')));
});

describe('parseError', () => {
  test('code', () => assert.equal(L.parseError({ errors: [{ op1: { string: 'missing' } }] }), 'missing'));
  test('no errors', () => { assert.equal(L.parseError({ errors: [] }), null); assert.equal(L.parseError({}), null); });
  test('a non-string op1', () => assert.equal(L.parseError({ errors: [{ op1: { num: 3 } }] }), null));
});

describe('libraryHas, assignable, GREEK, CONSTANTS', () => {
  test('library names', () => {
    for (const n of ['Add', 'Sin', 'Pi', 'Beta']) assert.equal(L.libraryHas(n), true, n);
    for (const n of ['x', 'price', 'zz']) assert.equal(L.libraryHas(n), false, n);
  });
  test('the library engine is built once, and a throwing lookup counts as defined', () => {
    let built = 0;
    const T = subjects({ ce: CE => class extends CE { constructor(...a){ super(...a); built++; } } });
    try {
      T.lines.libraryHas('price'); T.lines.libraryHas('Sin'); T.lines.libraryHas('x');
      assert.equal(built, 1);
      const proto = T.protocol.CE.prototype, orig = proto.lookupDefinition;
      proto.lookupDefinition = () => { throw new Error('boom'); };
      try { assert.equal(T.lines.libraryHas('price'), true); } finally { proto.lookupDefinition = orig; }
    } finally { T.close(); }
  });
  test('every single Latin letter but e and i is assignable', () => {
    const letters = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'];
    assert.deepEqual(letters.filter(c => !L.assignable(c)), ['e', 'i']);
  });
  test('names: GREEK and other user names yes, CONSTANTS and library names no', () => {
    for (const n of ['phi', 'Gamma', 'zeta', 'Delta', 'price']) assert.equal(L.assignable(n), true, n);
    for (const n of ['Pi', 'EulerGamma', 'GoldenRatio', 'ExponentialE', 'ImaginaryUnit', 'Sin', 'Add']) assert.equal(L.assignable(n), false, n);
  });
  test('CE names the 43 Greek commands as GREEK and CONSTANTS expect', () => {
    const ce = S.ce(), cmds = ('alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa varkappa lambda mu nu xi ' +
      'omicron pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega digamma ' +
      'Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega').split(' ');
    assert.equal(cmds.length, 43);
    const name = c => ce.parse('\\' + c, { canonical: false }).json;
    const constants = cmds.filter(c => L.CONSTANTS.has(name(c))), greek = cmds.filter(c => L.GREEK.has(name(c)));
    assert.deepEqual(constants, ['gamma', 'pi', 'varphi']);
    assert.equal(greek.length, 40, 'not in GREEK: ' + cmds.filter(c => !L.GREEK.has(name(c)) && !constants.includes(c)));
  });
});

describe('echoes: no answer that repeats the line', () => rows(S, [
  ['2i', {}, null], ['1+3i', {}, null], ['-3', {}, null], ['x+1', {}, null], ['5', {}, null], ['2^{}3', {}, null],
  ['0.3', {}, null],
  ['\\frac13', {}, eq(null, '0.\\overline{3}')],
  ['\\sqrt2', {}, ap(null, '1.414\\,213\\,562\\,373\\,095\\,048\\,8')],
  ['e', {}, ap(null, '2.718\\,281\\,828\\,459\\,045\\,235\\,36')],
  ['e^2', {}, ap(null, '7.389\\,056\\,098\\,930\\,650\\,227\\,23')],
  ['\\sin\\left(1\\right)', {}, ap(null, '0.841\\,470\\,984\\,807\\,896\\,506\\,653')],
  ['7\\div2', { qa: 'r2' }, eq('\\frac{7}{2}', '3.5')],
  ['3\\%', {}, A('0.03', null)],
  ['1.5\\cdot2', {}, A('3', null)],
  ['2\\cdot\\pi', {}, ap('2\\pi', '6.283\\,185\\,307\\,179\\,586\\,476\\,93')],
]));

describe('group: brackets when put into another line', () => rows(S, [
  ['(1+i)^2', {}, A('2\\imaginaryI', null, { group: false })],
  ['(2+i)(1+i)', {}, A('1+3\\imaginaryI', null, { group: true })],
  ['1-4', {}, A('-3', null, { group: true })],
  ['x+2-1', {}, A('x+1', null, { group: true })],
  ['2+3', {}, A('5', null, { group: false })],
  ['-\\frac12', {}, A(null, '-0.5', { group: true })],
  ['0-x', {}, A('-x', null, { group: true })],
  ['(1-i)^2', {}, A('-2\\imaginaryI', null, { group: true })],
  ['\\sqrt{-4}', {}, A('2\\imaginaryI', null, { group: false })],
  ['e^{i\\frac{\\pi}{2}}', {}, A('\\imaginaryI', null, { group: false })],
  ['\\sqrt{-4}+1', {}, A('1+2\\imaginaryI', null, { group: true })],
]));

describe('empty boxes and rewriting', () => rows(S, [
  ['2^{}3+1', {}, A('24', null)], ['2_{}3+1', {}, A('24', null)], ['10^{}2-1', {}, A('101', null)],
  ['x^{}5', {}, A('5x', null)], ['(2)^{}3', {}, A('6', null)], ['2^{}+1', {}, A('3', null)],
  ['2^{\\placeholder{}}3', {}, { invalid: 'missing' }],
  ['\\int_{\\placeholder{}}^{1}x\\,dx', {}, { invalid: 'missing' }],
  ['\\log_{\\placeholder{}}8', {}, { invalid: 'missing' }],
  ['\\log_{\\left(100\\right)}', arith, { invalid: 'missing' }],
  ['\\sin(\\infty)', {}, null],
  ['1+', {}, { invalid: 'unexpected-operator' }],
  ['% a comment', { qa: 'r9-10', todo: 'an imported LaTeX comment line shows "= Nothing"' }, null],
  ['\\frac{d}{\\differentialD x}x^3', {}, A('3x^2', null)],
  ['\\frac{d}{dx}x^3', {}, A('3x^2', null)],
]));

describe('numbers', () => rows(S, [
  ['\\frac12', {}, eq(null, '0.5')],
  ['\\sum_{n=1}^{100}n', {}, A('5\\,050', null)],
  ['10000!', {}, ap(null, '2.846\\,259\\,680\\,917\\,054\\,518\\,91\\cdot10^{35659}')],
  ['\\sqrt{2^{2001}}', {}, ap(null, '1.515\\,342\\,004\\,482\\,324\\,461\\,53\\cdot10^{301}')],
  ['\\sqrt{2^{100001}}', {}, ap(null, '4.469\\,904\\,010\\,187\\,208\\,724\\,74\\cdot10^{15051}')],
  ['0^0', {}, A('\\operatorname{Indeterminate}', null)],         // NaN: no decimal
  ['e^{i\\pi}+1', {}, A('0', null)],
  ['\\frac{180}{\\pi}\\arcsin(0.5)', {}, ap(null, '30')],          // the exact form has a rounded float inside
  ['\\sqrt{2.5}x', {}, ap(null, '1.581\\,138\\,830\\,084\\,189\\,666x')],
  // CE 0.161: a decimal argument makes a float (0.133 gave √2, π/6, √e)
  ['2^{0.5}', {}, ap(null, '1.414\\,213\\,562\\,373\\,095\\,048\\,8')],
  ['\\arcsin(0.5)', {}, ap(null, '0.523\\,598\\,775\\,598\\,298\\,873\\,077')],
  ['e^{0.5}', {}, ap(null, '1.648\\,721\\,270\\,700\\,128\\,146\\,85')],
  ['\\sqrt[0]{2}', {}, null], ['[1,2]+[1,2,3]', {}, null],
  [['f(x)\\coloneq f(x)+1', 'f(3)'], {}, null],                    // recursion-depth-exceeded: no answer, not slow
]));

describe('relations and true/false lines', () => {
  const rels = ['a=b', 'a\\ne b', 'a<b', 'a\\le b', 'a>b', 'a\\ge b', 'a\\coloneq 1', 'a\\in B', 'a\\notin B', 'A\\subset B',
    'A\\subseteq B', 'A\\not\\subset B', 'A\\supset B', 'A\\supseteq B', 'A\\not\\supset B', 'p\\iff q', 'a\\approx b',
    '3\\mid 6', 'a\\cong b'];
  test('all 19 REL operators are relations', () => assert.equal(L.REL.size, 19));
  rows(S, [...rels.map(l => [l, {}, null]), ['1<2', {}, null], [['f(x)=x^2+1', 'f(3)'], {}, null]]);
});

describe('ans', () => rows(S, [
  [['7', '\\mathrm{ans}+1'], {}, A('8', null)],
  [['2+3', 'r\\coloneq4', '\\mathrm{ans}^2'], { mode: 'arith', qa: 'review-4' }, A('16', null)],
  [['5', '\\mathrm{ans}+1'], arith, A('6', null)],
  [['f(x)\\coloneq x+1', '\\mathrm{ans}'], {}, null],
  [['1<2', '\\mathrm{ans}'], {}, null],
  [['x+1', '\\mathrm{ans}'], arith, null],
  [['4', 'x+1', '\\mathrm{ans}'], arith, A('4', null)],
]));

describe('user functions', () => rows(S, [
  [['f(x)\\coloneq x^2+1', 'f(3)'], {}, A('10', null)],
  [['f(x)\\coloneq x^2+1', 'f(a+1)'], {}, A('(a+1)^2+1', null, { group: true })],
  [['f(x,y)\\coloneq x+2y', 'f(1,2)'], {}, A('5', null)],
  [['f(x)\\coloneq x^2+1', 'f(f(1))'], {}, A('5', null)],
  [['f(x)\\coloneq x^3', '\\frac{d}{dx}f(x)'], {}, A('3x^2', null)],
]));

describe('modes and angles', () => rows(S, [
  ['2x+3x', arith, null], ['2x+3x', {}, A('5x', null)],
  [['a\\coloneq3', 'a+1'], arith, A('4', null)],
  ['\\sin(30)', { angle: 'deg' }, eq('\\frac{1}{2}', '0.5')],
  ['\\frac{d}{dx}\\sin x', { angle: 'deg' }, A('\\frac{\\pi\\cos(x)}{180}', null)],
]));

describe('the sample pad (the reviewer instructions)', () => {
  const SAMPLE = ['a\\coloneq 3', 'b\\coloneq 4', '\\sqrt{a^2+b^2}', '\\int_0^{\\pi}\\sin(x)\\,dx', '\\sum_{n=1}^{100} n',
    '\\frac{1}{3}+\\frac{1}{6}', '\\frac{d}{dx}x^3', 'e^{i\\pi}+1', 'x^2+y^2=r^2', 'f(x)\\coloneq x^2+1', 'f(3)'];
  const shown = r => r && (r.exact ?? '') + '|' + (r.approx ?? '');
  test('Arithmetic', async () => {
    const r = (await S.protocol.eval({ lines: SAMPLE, mode: 'arith' })).map(shown);
    assert.deepEqual(r, [null, null, '5|', '2|', '5\\,050|', '\\frac{1}{2}|0.5', null, '0|', null, null, '10|']);
  });
  test('Algebra adds 3x²', async () => {
    const r = (await S.protocol.eval({ lines: SAMPLE, mode: 'full' })).map(shown);
    assert.equal(r[6], '3x^2|');
  });
});

describe('stub-only blocks in evalLine', () => {
  const run = (src, m = { mode: 'full', places: 'auto' }, patch = () => {}) => { const ce = S.ce(); patch(ce); return S.lines.evalLine(ce, src, m); };
  test('a line that is only spaces, or null', () => { assert.equal(run('   '), null); assert.equal(run(null), null); });
  test('the non-canonical parse throwing or not an array → assign refused', () => {
    assert.deepEqual(run('x\\coloneq 3', undefined, ce => { const p = ce.parse.bind(ce); ce.parse = (s, o) => { if (o) throw new Error('boom'); return p(s, o); }; }), { invalid: 'assign' });
    assert.deepEqual(run('x\\coloneq 3', undefined, ce => { const p = ce.parse.bind(ce); ce.parse = (s, o) => o ? { json: 'x' } : p(s, o); }), { invalid: 'assign' });
  });
  test('a function with a non-symbol parameter in the non-canonical parse → assign', () => {
    assert.deepEqual(run('f(x)\\coloneq 3', undefined, ce => { const p = ce.parse.bind(ce); ce.parse = (s, o) => o ? { json: ['Assign', 'f', ['Function', 3, 2]] } : p(s, o); }), { invalid: 'assign' });
  });
  test('an expression without an unknowns list counts as numeric', () => {
    const r = run('1+1', { mode: 'arith', places: 'auto' }, ce => {
      const p = ce.parse.bind(ce);
      ce.parse = (s, o) => { const x = p(s, o); return o ? x : new Proxy(x, { get: (t, k) => k === 'unknowns' ? undefined : Reflect.get(t, k) }); };
    });
    assert.equal(r.exact, '2');
  });
  test('ce.assign("ans") throwing doesn\'t lose the answer', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(run('1+1', undefined, ce => { ce.assign = () => { throw new Error('boom'); }; }))),
      { exact: '2', approx: null, approxIsExact: false, group: false });
  });
});
