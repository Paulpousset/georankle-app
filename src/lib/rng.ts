/**
 * Deterministic pseudo-random number generation.
 *
 * The whole point of this module is reproducibility: given the same seed, both
 * clients of an online match MUST produce the exact same sequence (and therefore
 * the same shuffles / picks). This implementation was previously duplicated in
 * every game screen and in lib/ranked.ts — keep it the single source of truth so
 * the multiplayer sync can never silently diverge.
 *
 * The generator is mulberry32. Do NOT change the arithmetic: existing matches and
 * the regression vectors in __tests__/rng.test.ts depend on the exact output.
 */

/** Creates a mulberry32 PRNG seeded with `seed`, returning floats in [0, 1). */
export function createSeededRng(seed: number): () => number {
  let s = seed;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns a Fisher–Yates shuffle of `arr` driven by `rand`. Pure: the input array
 * is not mutated. With a seeded `rand`, the permutation is fully deterministic.
 */
export function seededShuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
