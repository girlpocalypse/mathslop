// engine/numbers: the number formatting helpers. Most need no Compute Engine; rationalOf, floatDigits and
// exactValue take CE values, built with a fresh engine.
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { subjects } from './subjects.mjs';

const S = subjects(), N = S.numbers, ce = S.ce();
after(() => S.close());
const val = l => ce.parse(l).evaluate();

describe('norm and tidy', () => {
  test('norm drops spaces and \\,', () => assert.equal(N.norm('5\\,050 + 1'), '5050+1'));
  for (const [i, o] of [
    ['3.0', '3'], ['1.0\\cdot10^{30}', '1\\cdot10^{30}'], ['-2.000', '-2'],
    ['3.05', '3.05'], ['3.0\\,1', '3.0\\,1'], ['30', '30'], ['0.50', '0.50'],
    ['1\\imaginaryI', '\\imaginaryI'], ['2+1\\imaginaryI', '2+\\imaginaryI'], ['2-1\\imaginaryI', '2-\\imaginaryI'],
    ['21\\imaginaryI', '21\\imaginaryI'],
  ]) test(`tidy ${i} → ${o}`, () => assert.equal(N.tidy(i), o));
});

describe('numOf and intOf', () => {
  test('numOf', () => {
    assert.equal(N.numOf(5), '5');
    assert.equal(N.numOf({ num: '1e+30' }), '1e+30');
    assert.equal(N.numOf(null), 'null');
  });
  for (const [i, o] of [[5, 5n], [-5, -5n], ['12', 12n], ['1.000e3', 1000n], ['7e+2', 700n], [{ num: '28e+2499' }, 28n * 10n ** 2499n]])
    test(`intOf ${JSON.stringify(i)}`, () => assert.equal(N.intOf(i), o));
  for (const bad of ['1.5e3', '0.5', null, 'abc', '1e-3', { num: '2.5' }])
    test(`intOf ${JSON.stringify(bad)} throws`, () => assert.throws(() => N.intOf(bad), /not an integer/));
});

describe('rationalOf and sameRational', () => {
  for (const [l, r] of [
    ['5', [5n, 1n]], ['-7', [-7n, 1n]], ['\\frac{22}{7}', [22n, 7n]], ['-\\frac{1}{3}', [-1n, 3n]],
    ['10^{300}', [10n ** 300n, 1n]],
  ]) test(`rationalOf ${l}`, () => assert.deepEqual(N.rationalOf(val(l)), r));
  for (const l of ['\\sqrt{2}', '\\pi', '0.5', 'x', '1+i'])
    test(`rationalOf ${l} → null`, () => assert.equal(N.rationalOf(val(l)), null));
  test('rationalOf: json that throws → null', () => {
    assert.equal(N.rationalOf({ isRational: true, get json(){ throw new Error('boom'); } }), null);
    assert.equal(N.rationalOf({ isRational: true, json: ['Rational', 1.5, 2] }), null);
    assert.equal(N.rationalOf({ isRational: true, json: ['Add', 1, 2] }), null);
  });
  test('sameRational', () => {
    assert.equal(N.sameRational([1n, 2n], [2n, 4n]), true);
    assert.equal(N.sameRational([1n, 2n], [1n, 3n]), false);
    assert.equal(N.sameRational(null, [1n, 3n]), false);
    assert.equal(N.sameRational([1n, 3n], null), false);
  });
});

describe('exactPlaces', () => {
  for (const [r, k] of [
    [[1n, 8n], 3], [[1n, 1024n], 10], [[-3n, 4n], 2], [[1n, 3n], -1], [[5n, 1n], 0], [[0n, 1n], 0],
    [[1n, 10n ** 70n], 70], [[123n, 1000n], 3], [[12300n, 1000n], 3],
    [[10n ** 25n + 1n, 10n ** 4n], -1],              // power of ten, but more than 21 significant digits
    [[1n, 2n ** 70n], -1],                           // terminates, but too many digits
    [[1n, 3n * 10n ** 60n], -1],                     // 61 digits and not a power of ten: given up at once
  ]) test(`${r[0]}/${String(r[1]).length > 12 ? '…' : r[1]} → ${k}`, () => assert.equal(N.exactPlaces(r), k));
  test('a power-of-ten denominator of any size is instant', () => {
    const t0 = performance.now();
    assert.equal(N.exactPlaces([1n, 10n ** 100000n]), 100000);
    assert.ok(performance.now() - t0 < 500);
  });
});

describe('grouped and fixed', () => {
  test('grouped', () => {
    assert.equal(N.grouped('5050', '1234'), '5\\,050.123\\,4');
    assert.equal(N.grouped('123', ''), '123');
    assert.equal(N.grouped('1234567', '12'), '1\\,234\\,567.12');
  });
  for (const [r, n, o] of [
    [[1n, 8n], 2, '0.13'], [[-1n, 8n], 2, '-0.13'], [[-1n, 2n], 0, '-1'], [[1n, 2n], 0, '1'],
    [[-1n, 3n], 0, '0'], [[2n, 3n], 0, '1'], [[1n, 3n], 4, '0.333\\,3'], [[505012345n, 100000n], 4, '5\\,050.123\\,5'],
    [[0n, 1n], 2, '0.00'], [[5n, 1n], 0, '5'],
  ]) test(`fixed ${r[0]}/${r[1]} at ${n} → ${o}`, () => assert.equal(N.fixed(r, n), o));
});

describe('sci (adapter: { latex, exact })', () => {
  for (const [r, s, latex, exact] of [
    [[999n, 1000n], 2, '1.0\\cdot10^{0}', false],    // the carry: 9.99… rounded up to 10
    [[999n, 1000n], 3, '9.99\\cdot10^{-1}', true],
    [[1n, 3n], 3, '3.33\\cdot10^{-1}', false],
    [[10n ** 30n, 1n], 3, '1.00\\cdot10^{30}', true],
    [[1n, 10n ** 400n], 2, '1.0\\cdot10^{-400}', true],
    [[-2n, 3n], 2, '-6.7\\cdot10^{-1}', false],
    [[1n, 10n ** 5n], 3, '1.00\\cdot10^{-5}', true],
    [[123456n, 1n], 5, '1.234\\,6\\cdot10^{5}', false],
  ]) test(`sci ${r[0]}/${String(r[1]).slice(0, 8)} s=${s}`, () => assert.deepEqual(N.sci(r, s), { latex, exact }));
});

describe('sciFloat and sciNum', () => {
  test('sciFloat', () => {
    assert.equal(N.sciFloat(1.5e20, 2), '1.50\\cdot10^{20}');
    assert.equal(N.sciFloat(1e-7, 0), '1\\cdot10^{-7}');
    assert.equal(N.sciFloat(-2.5e-9, 1), '-2.5\\cdot10^{-9}');
  });
  for (const [num, n, o] of [
    ['1.97007111401704699389e+434', 2, '1.97\\cdot10^{434}'],
    ['1.97007111401704699389e+434', 'auto', '1.970\\,071\\,114\\,017\\,046\\,993\\,89\\cdot10^{434}'],
    ['5.0759588975494567653e-435', 2, '5.08\\cdot10^{-435}'],
    ['9.996e+500', 2, '1.00\\cdot10^{501}'],           // the carry
    ['-2.5e+400', 0, '-3\\cdot10^{400}'],              // half away from zero
    ['1.2000e+400', 'auto', '1.2\\cdot10^{400}'],      // trailing zeros trimmed at auto
    ['3e+400', 3, '3.000\\cdot10^{400}'],
    ['12345', 2, null], ['1.5', 2, null], ['Infinity', 2, null],
  ]) test(`sciNum ${num} at ${n}`, () => assert.equal(N.sciNum(num, n), o));
});

describe('floatDigits, floatParts, exactValue', () => {
  const fd = num => N.floatDigits({ json: num });
  test('floatDigits', () => {
    assert.deepEqual(fd(0.125), { sig: 3, places: 3, r: [125n, 1000n] });
    assert.deepEqual(fd(1.5), { sig: 2, places: 1, r: [15n, 10n] });
    assert.deepEqual(fd({ num: '1.0000000000000000000000000000005e+30' }), { sig: 32, places: 1, r: [10n ** 31n + 5n, 10n] });
    assert.deepEqual(fd({ num: '-2.5e-7' }), { sig: 2, places: 8, r: [-25n, 10n ** 8n] });
    assert.deepEqual(fd(300), { sig: 1, places: 0, r: [300n, 1n] });
    assert.equal(fd({ num: '1e-2000' }).r, null);       // |shift| > 1000
    assert.equal(fd(['Complex', 1, 2]), null);
    assert.equal(fd('NaN'), null);
  });
  test('floatParts', () => {
    assert.deepEqual(N.floatParts({ json: 2.5, im: 0 }), { sig: 2, places: 1, r: [25n, 10n] });
    assert.deepEqual(N.floatParts({ json: ['Complex', 0.5, 1.25], im: 1.25 }), { sig: 3, places: 2, r: null });
    assert.equal(N.floatParts({ json: ['Complex', 0.5, ['Sqrt', 2]], im: 1.4 }), null);   // a part that isn't a float
    assert.equal(N.floatParts({ json: ['Multiply', 2, 'ImaginaryUnit'], im: 2 }), null);  // not Complex, im ≠ 0
  });
  for (const [l, r] of [
    ['\\frac{3}{4}', [3n, 4n]], ['0.5\\cdot0.25', [125n, 1000n]], ['1.5', [15n, 10n]],
    ['\\sqrt{2.5}', null],            // a float with 16+ digits
    ['\\sqrt{2}', null],              // not a number literal
    ['1.5+2i', null],                 // complex
  ]) test(`exactValue ${l}`, () => assert.deepEqual(N.exactValue(val(l)), r));
});
