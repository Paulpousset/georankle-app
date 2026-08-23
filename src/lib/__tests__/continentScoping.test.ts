/**
 * Guards that the continent scope actually narrows each mode's pool.
 *
 * The pure helpers are covered elsewhere; what breaks in practice is a mode
 * forgetting to pass the scope through, so these assert the *generators* the
 * screens call, not `filterByContinent` itself.
 */
import { continentOf } from '../../data/continents';
import { buildSilhouetteRun } from '../silhouette';
import { buildHigherLowerRun } from '../higherLower';

describe('buildSilhouetteRun with a continent', () => {
  it('draws every answer from that continent', () => {
    const run = buildSilhouetteRun(99, 5, { continent: 'Africa' });
    expect(run).toHaveLength(5);
    for (const q of run) {
      expect(continentOf(q.answer)).toBe('Africa');
      expect(q.options).toContain(q.answer);
      expect(new Set(q.options).size).toBe(4);
    }
  });

  it('still plays the whole world by default', () => {
    const run = buildSilhouetteRun(99, 5);
    const continents = new Set(run.map((q) => continentOf(q.answer)));
    // A worldwide draw of 5 is overwhelmingly unlikely to be single-continent.
    expect(continents.size).toBeGreaterThan(1);
  });

  it('is unchanged by an explicit null scope (daily/online path)', () => {
    expect(buildSilhouetteRun(7, 5, { continent: null })).toEqual(buildSilhouetteRun(7, 5));
  });
});

describe('buildHigherLowerRun with a continent', () => {
  it('keeps both sides of every pair inside the continent', () => {
    const run = buildHigherLowerRun(1234, 20, { continent: 'Europe' });
    expect(run.length).toBeGreaterThan(5);
    for (const pair of run) {
      expect(continentOf(pair.a.cca3)).toBe('Europe');
      expect(continentOf(pair.b.cca3)).toBe('Europe');
      expect(pair.a.value).not.toBe(pair.b.value);
    }
  });

  it('produces a shorter chain than the worldwide run', () => {
    const world = buildHigherLowerRun(1234);
    const oceania = buildHigherLowerRun(1234, 100, { continent: 'Oceania' });
    expect(oceania.length).toBeLessThan(world.length);
    expect(oceania.length).toBeGreaterThan(0);
  });

  it('is unchanged by an explicit null scope', () => {
    expect(buildHigherLowerRun(42, 10, { continent: null })).toEqual(
      buildHigherLowerRun(42, 10),
    );
  });
});
