// Tables for the panel's latex module: [input, expected]. Plain data, so after the split they run in Node too.

export const TO_TEXT = [   // pinned from MathLive 0.111.1's AsciiMath plus toText's fixes, reviewed once
  ['a\\coloneq 3', 'a:=3'], ['a\\coloneqq 3', 'a:=3'], ['f(x)\\coloneq x^2+1', 'f(x):=x^2+1'],
  ['\\mathrm{ans}+1', 'ans+1'], ['\\operatorname{price}\\cdot2', 'price * 2'],
  ['3.\\overline{142857}', '3.bar(142857)'], ['5\\,050', '5050'],
  ['\\vert x\\vert', '|x|'], ['\\lvert x\\rvert', '|x|'],
  ['30^\\circ', '30°'], ['30^{\\circ}', '30°'],
  ['\\sin(x)+\\cos(x)', 'sin(x)+cos(x)'], ['\\sqrt{a^2+b^2}', 'sqrt(a^2+b^2)'],
  ['\\frac{1}{3}+\\frac{1}{6}', '(1)/(3)+(1)/(6)'], ['x^2+y^2=r^2', 'x^2+y^2=r^2'], ['x_1', 'x_1'],
  ['e^{i\\pi}+1', 'e^(i pi)+1'], ['2\\cdot10^{-5}', '2 * 10^(-5)'],
  ['\\int_0^{\\pi}\\sin(x)\\,dx', 'int_0^(pi)sin(x) d x'],
];

export const PORTABLE = [
  ['\\exponentialE^{2}', 'e^{2}'], ['2\\imaginaryI', '2i'], ['\\differentialD x', '\\mathrm{d} x'],
  ['\\exponentialEx', '\\exponentialEx'], ['\\imaginaryIy', '\\imaginaryIy'],   // longer commands left alone
];

export const SPOKEN = [
  ['0.\\overline{3}', '0.\\text{ with }3\\text{ repeating}'], ['3.\\overline{142857}', '3.\\text{ with }142857\\text{ repeating}'],
  ['2\\imaginaryI', '2i'],
];

export const IS_SUM = [
  ['-1', true], ['1+2', true], ['x-1', true], ['0.\\overline{3}+0.\\overline{3}\\imaginaryI', true], ['1.414+x', true],
  ['\\frac{1+2}{3}', false], ['(a+b)', false], ['x^{-1}', false], ['[1,-2]', false], ['1.5\\cdot10^{-7}', false],
  ['', false], ['3', false], ['2\\imaginaryI', false],
];

export const PARSE_IMPORT = [
  ['a\nb', ['a', 'b']], ['a\r\nb', ['a', 'b']], ['a\\\\b', ['a', 'b']], ['  a  \n\n  b ', ['a', 'b']], ['', []], ['\\\\\\\\', []],
];

// answerParts(res, order) → [{ rel, latex, group }]
export const ANSWER_PARTS = [
  [null, 'exact', []], [{ invalid: 'missing' }, 'exact', []], [{ slow: true }, 'exact', []],
  [{ exact: '\\frac12', approx: '0.5', approxIsExact: true, group: false }, 'exact',
    [{ rel: '=', latex: '\\frac12', group: false }, { rel: '=', latex: '0.5', group: false }]],
  [{ exact: '\\frac12', approx: '0.5', approxIsExact: true, group: false }, 'decimal',
    [{ rel: '=', latex: '0.5', group: false }, { rel: '=', latex: '\\frac12', group: false }]],
  [{ exact: null, approx: '-1.41', approxIsExact: false, group: true }, 'exact', [{ rel: '\\approx', latex: '-1.41', group: true }]],
  [{ exact: 'x+\\sqrt2', approx: 'x+1.414', approxIsExact: false, group: true }, 'exact',
    [{ rel: '=', latex: 'x+\\sqrt2', group: true }, { rel: '\\approx', latex: 'x+1.414', group: true }]],
  [{ exact: '5', approx: null, approxIsExact: false, group: false }, 'exact', [{ rel: '=', latex: '5', group: false }]],
];
