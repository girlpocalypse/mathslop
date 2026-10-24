// engine/decimal: the decimal answer and whether it gets "=" or "≈". Real lines first, then direct calls with
// stubs for the blocks no real line reaches.
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { subjects } from './subjects.mjs';
import { rows, A } from './rows.mjs';

const S = subjects();
after(() => S.close());
const eq = (exact, approx) => A(exact, approx, { approxIsExact: true });
const ap = (exact, approx) => A(exact, approx, { approxIsExact: false });
const p2 = { places: 2 };

describe('rationals', () => rows(S, [
  ['\\frac{1}{8}', {}, eq(null, '0.125')],
  ['\\frac{1}{2^{21}}', {}, eq('\\frac{1}{2\\,097\\,152}', '0.000\\,000\\,476\\,837\\,158\\,203\\,125')],   // more than 20 places: the engine's digits
  ['\\frac18', { places: 3 }, eq(null, '0.125')],
  ['\\frac18', p2, ap(null, '0.13')],
  ['0.5\\cdot0.25', p2, ap(null, '0.13')],                                    // a short float, rounded like a rational
  ['\\frac{22}{7}', {}, eq(null, '3.\\overline{142857}')],
  ['\\frac{1}{97}', {}, ap(null, '0.010\\,309\\,278\\,350\\,515\\,463\\,917\\,5')],   // repetend too long to find
  ['\\frac{1}{3}+10^{-30}', {}, ap('\\frac{1\\,000\\,000\\,000\\,000\\,000\\,000\\,000\\,000\\,000\\,003}{3\\cdot10^{30}}', '0.333\\,333\\,333\\,333\\,333\\,333\\,333')],   // a repetend that isn't p/q
  ['\\frac{10^{22}}{3}', {}, eq('\\frac{1\\cdot10^{22}}{3}', '3.\\overline{3}\\cdot10^{21}')],
  ['\\frac{10^{30}}{97}', {}, ap('\\frac{1\\cdot10^{30}}{97}', '1.030\\,927\\,835\\,051\\,546\\,391\\,75\\cdot10^{28}')],
  ['\\frac{10^{16}}{3}', p2, ap('\\frac{10\\,000\\,000\\,000\\,000\\,000}{3}', '3.33\\cdot10^{15}')],
  ['10^{16}+\\frac12', p2, eq('\\frac{20\\,000\\,000\\,000\\,000\\,001}{2}', '10\\,000\\,000\\,000\\,000\\,000.5')],
  // CLAUDE.md says values ≥ 10^15 get scientific notation; a whole number has no decimal to show at all.
  ['10^{15}', p2, A('1\\,000\\,000\\,000\\,000\\,000', null)],
  ['10^{-5}', p2, eq('\\frac{1}{100\\,000}', '1.00\\cdot10^{-5}')],
  ['10^{-5}', {}, eq('\\frac{1}{100\\,000}', '0.000\\,01')],
  ['0.05\\cdot0.05', p2, eq(null, '2.50\\cdot10^{-3}')],
  ['\\frac13\\cdot10^{-5}', p2, ap('\\frac{1}{300\\,000}', '3.33\\cdot10^{-6}')],
  ['10^{-70}', {}, eq('\\frac{1}{1\\cdot10^{70}}', '1\\cdot10^{-70}')],
  ['1-1', p2, A('0', null)],
]));

describe('floats and irrationals', () => rows(S, [
  ['\\sqrt2', p2, ap(null, '1.41')],
  ['\\pi', p2, ap(null, '3.14')],
  ['-\\sqrt2', p2, ap(null, '-1.41')],
  ['100\\cdot1.07^{10}', p2, ap(null, '196.72')],
  ['\\pi', {}, ap(null, '3.141\\,592\\,653\\,589\\,793\\,238\\,46')],
  ['\\sqrt{2}\\cdot10^{20}', p2, ap('100\\,000\\,000\\,000\\,000\\,000\\,000\\sqrt{2}', '1.41\\cdot10^{20}')],
  ['e^{-20}', p2, ap(null, '2.06\\cdot10^{-9}')],
  ['10^{20}+0.5', {}, ap(null, '100\\,000\\,000\\,000\\,000\\,000\\,000')],
  ['10^{20}+0.5', p2, ap(null, '1.00\\cdot10^{20}')],
  ['10^{30}+0.5', {}, ap(null, '1\\cdot10^{30}')],
  ['\\sqrt{2.5}', {}, ap(null, '1.581\\,138\\,830\\,084\\,189\\,666')],
  ['\\sin^2(1)+\\cos^2(1)', p2, ap('\\sin(1)^2+\\cos(1)^2', '1.00')],
  ['\\sin^2(1)+\\cos^2(1)', { places: 3 }, ap('\\sin(1)^2+\\cos(1)^2', '1.000')],
  ['\\sin^2(1)+\\cos^2(1)', { places: 10 }, ap('\\sin(1)^2+\\cos(1)^2', '1.000\\,000\\,000\\,0')],
]));

describe('beyond a double, or underflowed', () => rows(S, [
  ['e^{1000}', p2, ap(null, '1.97\\cdot10^{434}')],
  ['e^{1000}', {}, ap(null, '1.970\\,071\\,114\\,017\\,046\\,993\\,89\\cdot10^{434}')],
  ['e^{-1000}', p2, ap(null, '5.08\\cdot10^{-435}')],
  ['e^{-1000}', { places: 0 }, ap(null, '0')],
  ['1000000!', { places: 3, qa: 'review-1' }, ap(null, '8.264\\cdot10^{5565708}')],
]));

describe('complex values, part by part', () => rows(S, [
  ['\\frac18 i', p2, ap(null, '0.13\\imaginaryI')],
  ['\\frac58 i', p2, ap(null, '0.63\\imaginaryI')],
  ['\\frac12 i', { places: 0 }, ap(null, '\\imaginaryI')],
  ['\\frac{1}{200}i', p2, ap(null, '0.01\\imaginaryI')],
  ['\\sqrt{-2.5}', p2, ap(null, '1.58\\imaginaryI')],
  ['ie^{1000}', p2, ap(null, '1.97\\cdot10^{434}\\imaginaryI')],
  ['1+\\sqrt{-2}', p2, ap('1+\\sqrt{2}\\imaginaryI', '1+1.41\\imaginaryI')],
  ['\\frac12+\\frac14 i', p2, eq(null, '0.5+0.25\\imaginaryI')],              // every part exact → "="
  ['\\frac12-\\frac14 i', p2, eq(null, '0.5-0.25\\imaginaryI')],
  ['\\sin(0.3)-0.3i', { places: 2, todo: 'mixed precision: 0.30-0.3i' }, ap(null, '0.30-0.30\\imaginaryI')],
]));

describe('direct calls and stub-only blocks', () => {
  const ce = S.ce(), D = S.decimal.decimal;
  const v = l => ce.parse(l).evaluate();
  const call = (l, places, r) => { const x = v(l); return D(ce, x, x.N(), places, r); };
  test('a zero rational: "0" with "=", and 0.00 only from a stub r', () => {
    assert.deepEqual(call('0', 2), { latex: '0', exact: true });
    assert.deepEqual(D(ce, v('0'), v('0').N(), 2, [0n, 3n]), { latex: '0.00', exact: false });
  });
  test('the \\infty fallback: sciNum finds no digits, so the engine form', () => {
    assert.deepEqual(call('\\infty', 2), { latex: '\\infty', exact: false });
  });
  test('the toLatex fallback when a float has no MathJSON digits', () => {
    const x = v('\\pi'), approxV = x.N();
    const stub = { latex: approxV.latex, re: approxV.re, im: 0, json: 'Pi', toLatex: o => approxV.toLatex(o) };
    assert.deepEqual(D(ce, x, stub, 2), { latex: '3.14', exact: false });
  });
  test('the repetend parse-back throwing → "≈"', () => {
    const x = v('\\frac{22}{7}'), parse = ce.parse;
    ce.parse = () => { throw new Error('boom'); };
    try { assert.deepEqual(D(ce, x, x.N(), 'auto'), { latex: '3.142\\,857\\,142\\,857\\,142\\,857\\,14', exact: false }); }
    finally { ce.parse = parse; }
  });
  test('the complex parts fallback when Real/Imaginary fail', () => {
    const x = v('\\frac18+\\frac{1}{4}i'), box = ce.box.bind(ce);
    ce.box = e => { if (Array.isArray(e) && (e[0] === 'Real' || e[0] === 'Imaginary')) throw new Error('boom'); return box(e); };
    try { assert.deepEqual(D(ce, x, x.N(), 2), { latex: '0.13+0.25\\imaginaryI', exact: false }); }
    finally { delete ce.box; }
  });
});
