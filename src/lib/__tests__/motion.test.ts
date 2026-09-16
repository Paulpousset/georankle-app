import { END_CHOREO, makeRng, __setReducedMotionForTests, reducedMotionNow, probeReducedMotion } from '../motion';

describe('END_CHOREO', () => {
  it('suit la partition : globe → verdict → détail → récompense → actions', () => {
    expect(END_CHOREO.globe).toBe(0);
    expect(END_CHOREO.verdict).toBeGreaterThan(END_CHOREO.globe);
    expect(END_CHOREO.detail).toBeGreaterThan(END_CHOREO.verdict);
    expect(END_CHOREO.reward).toBeGreaterThan(END_CHOREO.detail);
    expect(END_CHOREO.actions).toBeGreaterThan(END_CHOREO.reward);
    // Tout est visible en moins de 3 s : un écran de fin ne doit pas traîner.
    expect(END_CHOREO.actions).toBeLessThanOrEqual(3000);
  });
});

describe('makeRng', () => {
  it('est déterministe pour une graine donnée', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const sa = [a(), a(), a()];
    const sb = [b(), b(), b()];
    expect(sa).toEqual(sb);
    for (const v of sa) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('change avec la graine', () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)());
  });
});

describe('reduced motion', () => {
  afterEach(() => __setReducedMotionForTests(null));

  it('vaut false tant que rien n’est connu', () => {
    expect(reducedMotionNow()).toBe(false);
  });

  it('la valeur forcée est servie immédiatement, sans sonde', async () => {
    __setReducedMotionForTests(true);
    expect(reducedMotionNow()).toBe(true);
    await expect(probeReducedMotion()).resolves.toBe(true);
  });
});
