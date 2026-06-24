import { createSeededRng, seededShuffle } from '../rng';

describe('createSeededRng', () => {
  it('produces an identical sequence for the same seed (multiplayer sync)', () => {
    const a = createSeededRng(12345);
    const b = createSeededRng(12345);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('only emits floats in [0, 1)', () => {
    const r = createSeededRng(777);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  // Frozen regression vector: if this fails, the PRNG output changed and every
  // in-flight online match would desync. Do not "fix" by updating the numbers —
  // investigate why the generator changed.
  it('matches the frozen reference vector for seed 12345', () => {
    const r = createSeededRng(12345);
    const first5 = Array.from({ length: 5 }, () => r());
    expect(first5).toEqual([
      0.9797282677609473,
      0.3067522644996643,
      0.484205421525985,
      0.817934412509203,
      0.5094283693470061,
    ]);
  });
});

describe('seededShuffle', () => {
  it('is a permutation: same multiset, possibly reordered', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = seededShuffle(input, createSeededRng(42));
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    seededShuffle(input, createSeededRng(1));
    expect(input).toEqual(copy);
  });

  it('is deterministic for the same seed', () => {
    const input = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(seededShuffle(input, createSeededRng(99))).toEqual(
      seededShuffle(input, createSeededRng(99)),
    );
  });

  it('handles empty and single-element arrays', () => {
    expect(seededShuffle([], createSeededRng(1))).toEqual([]);
    expect(seededShuffle([42], createSeededRng(1))).toEqual([42]);
  });
});
