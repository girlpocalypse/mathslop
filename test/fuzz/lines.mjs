// Generated and mutated LaTeX lines for the engine fuzzer.

// A random expression of bounded size (depth), from the kinds of thing people type into the pad.
// numeric: no letters (so the exact value can be checked on its own)
export function expr(r, depth = 3, numeric = false){
  if (depth <= 0 || r.chance(0.3)) return atom(r, numeric);
  const a = () => expr(r, depth - 1, numeric);
  return r.pick([
    () => `${a()}+${a()}`, () => `${a()}-${a()}`, () => `${a()}\\cdot ${a()}`, () => `${a()}${a()}`,
    () => `\\frac{${a()}}{${a()}}`, () => `\\sqrt{${a()}}`, () => `\\sqrt[${r.int(2, 4)}]{${a()}}`,
    () => `\\left(${a()}\\right)^{${r.pick([r.int(-3, 6), '\\frac12', '0.5', a()])}}`,
    () => `${r.pick(['\\sin', '\\cos', '\\tan', '\\ln', '\\log', '\\arcsin', '\\arctan', '\\exp'])}\\left(${a()}\\right)`,
    () => `${r.int(0, 30)}!`, () => `\\sum_{n=1}^{${r.int(1, 60)}}${r.pick(['n', 'n^2', '\\frac1n', '\\frac{1}{2^n}'])}`,
    () => `\\prod_{k=1}^{${r.int(1, 25)}}k`, () => `-${a()}`, () => `\\left|${a()}\\right|`,
    () => `${atom(r, true)}\\%`, () => `${a()}\\div ${a()}`,   // \% after a sum or |x| is a CE parse error
  ])();
}
export function atom(r, numeric = false){
  const letters = numeric ? [] : [() => r.pick(['x', 'y', 'a', 'D', '\\alpha', '\\Gamma']), () => '\\mathrm{ans}', () => 'i'];
  return r.pick([...letters,
    () => String(r.int(0, 999)), () => `${r.int(0, 99)}.${r.int(0, 999)}`, () => `10^{${r.int(-80, 80)}}`,
    () => `${r.int(1, 9)}\\cdot10^{${r.int(-30, 30)}}`, () => String(r.int(1, 9)).repeat(r.int(15, 40)),
    () => '\\pi', () => 'e',
    () => `e^{${r.int(-1200, 1200)}}`, () => `0.${'0'.repeat(r.int(0, 30))}${r.int(1, 9)}`,
  ])();
}
// A whole line: mostly expressions, sometimes assignments, functions, relations, empty boxes or junk.
export function line(r){
  return r.pick([
    () => expr(r), () => expr(r), () => expr(r), () => expr(r),
    () => `${r.pick(['a', 'b', 'D', 'N', 'x', '\\phi', 'area', 'a+b', '\\pi', 'x_1', 'e'])}\\coloneq ${expr(r, 2)}`,
    () => `f(x)\\coloneq ${expr(r, 2).replace(/\by\b/g, 'x')}`, () => `f(${atom(r)})`,
    () => `${expr(r, 2)}${r.pick(['=', '<', '\\le', '\\ne', '\\approx'])}${expr(r, 2)}`,
    () => `${expr(r, 2)}^{\\placeholder{}}`, () => `${expr(r, 1)}^{}${atom(r)}`,
    () => `\\frac{d}{dx}${expr(r, 2)}`, () => `\\int_0^{1}${expr(r, 1)}\\,dx`,
  ])();
}
// Small random edits that break a line the way typing does.
export function mutate(r, s){
  const junk = ['{', '}', '(', ')', '^', '_', '\\', '\\frac', '\\foo', '+', '-', '=', '\\placeholder{}', '\\,', ' ', '0', 'x', '\\left(', '\\right)'];
  for (let n = r.int(1, 3); n > 0; n--) {
    const i = r.int(0, s.length);
    s = r.pick([
      () => s.slice(0, i) + r.pick(junk) + s.slice(i),
      () => s.slice(0, i) + s.slice(i + r.int(1, 4)),
      () => { const j = r.int(0, s.length); return i < j ? s.slice(0, i) + s.slice(j) + s.slice(i, j) : s; },
    ])();
  }
  return s;
}
export const SEEDS = ['a\\coloneq 3', 'b\\coloneq 4', '\\sqrt{a^2+b^2}', '\\int_0^{\\pi}\\sin(x)\\,dx', '\\sum_{n=1}^{100} n',
  '\\frac{1}{3}+\\frac{1}{6}', '\\frac{d}{dx}x^3', 'e^{i\\pi}+1', 'x^2+y^2=r^2', 'f(x)\\coloneq x^2+1', 'f(3)',
  '\\frac{22}{7}', '0.5\\cdot0.25', '10^{30}+0.5', 'e^{-1000}', '\\frac18 i', '\\sqrt{-2.5}', '2^{}3', '7\\div2', '3\\%'];
