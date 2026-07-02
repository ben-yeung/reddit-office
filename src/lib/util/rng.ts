/**
 * Tiny deterministic PRNG (mulberry32) + helpers.
 * Used so the office layout is reproducible from a seed and the mock
 * simulation is repeatable in tests.
 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Float in [min, max). */
export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Integer in [min, max]. */
export function intRange(rng: Rng, min: number, max: number): number {
  return Math.floor(range(rng, min, max + 1));
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** True with probability p. */
export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}
