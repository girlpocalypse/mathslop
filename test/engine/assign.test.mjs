// engine/lines: which names := may give a value to (CLAUDE.md "Answers modes").
import { describe, after } from 'node:test';
import { subjects } from './subjects.mjs';
import { rows, A } from './rows.mjs';

const S = subjects();
after(() => S.close());
const arith = { mode: 'arith' };

describe('allowed: a letter or a function', () => rows(S, [
  ...['x', 'D', 'N', '\\Gamma', '\\zeta', '\\phi', 'A', '\\mathrm{price}'].map(n => [[`${n}\\coloneq 3`, `${n}+1`], arith, A('4', null)]),
  [['\\phi\\coloneq2', '\\phi+1'], {}, A('3', null)],
  [['f(x)\\coloneq x+1', 'f(2)'], arith, A('3', null)],
  [['f(x,y)\\coloneq xy', 'f(2,5)'], arith, A('10', null)],
]));

describe('refused: constants, library names, subscripts', () => rows(S, [
  ...['e', 'i', '\\pi', '\\gamma', '\\varphi'].map(n => [`${n}\\coloneq 3`, {}, { invalid: 'assign' }]),
  ['\\sin(x)\\coloneq 1', {}, { invalid: 'assign' }],
  ['a+b\\coloneq 5', {}, { invalid: 'assign' }],
  ['area\\coloneq 12', {}, { invalid: 'assign' }],
  ['f(2)\\coloneq3', {}, { invalid: 'expected-a-symbol' }],   // CE's canonical parse refuses it first
  ['x_1\\coloneq 3', {}, { invalid: 'subscript' }],
  // a refused line changes nothing below it
  [['area\\coloneq 12', '2\\cdot3'], arith, A('6', null)],
  [['a+b\\coloneq 5', '1+2'], arith, A('3', null)],
  [['\\pi\\coloneq3', '\\pi'], { places: 2 }, A(null, '3.14')],
  // open issues (CLAUDE.md known issues; see the plan)
  ['\\Beta\\coloneq5', { todo: '\\Beta is refused: CE defines Beta' }, null],
  [['\\mathrm{N}\\coloneq3', '\\mathrm{N}+1'], { mode: 'arith', todo: '\\mathrm{N} is refused: CE reads it as a unit' }, A('4', null)],
  ['x_{1\\coloneq3}', { todo: 'typed without →: "A bracket isn\'t closed"' }, { invalid: 'subscript' }],
]));

describe('QA cases', () => rows(S, [
  [['a\\coloneq1', 'b\\coloneq-5', 'c\\coloneq6', 'D\\coloneq b^2-4ac', '\\frac{-b+\\sqrt{D}}{2a}'], arith, A('3', null)],
  [['N(t)\\coloneq100\\cdot2^t', 'N(3)'], arith, A('800', null)],
  [['D\\coloneq3', '\\frac{d}{dx}x^2'], {}, A('2x', null)],
  [['d(t)\\coloneq\\frac12gt^2', 'g\\coloneq9.8', 'd(2)'], arith, A('19.6', null)],
]));
