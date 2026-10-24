// Seeded randomness for the fuzzers: FUZZ_SEED picks the run, and a failure prints the seed that reproduces it.
export function rng(seed = Number(process.env.FUZZ_SEED) || (Date.now() % 2 ** 31)){
  let a = seed >>> 0;
  const next = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const r = {
    seed, next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: xs => xs[Math.floor(next() * xs.length)],
    chance: p => next() < p,
  };
  return r;
}
export const ITERATIONS = Number(process.env.FUZZ_ITERATIONS) || 300;
