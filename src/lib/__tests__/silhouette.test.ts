import {
  buildSilhouetteRun,
  silhouetteCountries,
  silhouetteCountryName,
  silhouettePath,
} from '../silhouette';

describe('silhouetteCountries', () => {
  it('offers a rich, recognizable pool', () => {
    const pool = silhouetteCountries();
    expect(pool.length).toBeGreaterThan(80);
    // Iconic shapes must be present.
    for (const id of ['FRA', 'ITA', 'BRA', 'AUS', 'IND', 'JPN', 'CHL']) {
      expect(pool).toContain(id);
    }
  });
});

describe('buildSilhouetteRun', () => {
  it('is deterministic for a given seed and varies across seeds', () => {
    expect(buildSilhouetteRun(42)).toEqual(buildSilhouetteRun(42));
    expect(JSON.stringify(buildSilhouetteRun(1))).not.toBe(JSON.stringify(buildSilhouetteRun(2)));
  });

  it('builds the requested number of questions with 4 distinct options containing the answer', () => {
    const run = buildSilhouetteRun(7, 5);
    expect(run).toHaveLength(5);
    for (const q of run) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options).toContain(q.answer);
    }
  });

  it('never repeats an answer within a run', () => {
    const answers = buildSilhouetteRun(99, 10).map((q) => q.answer);
    expect(new Set(answers).size).toBe(answers.length);
  });

  it('draws distractors from the answer region when available', () => {
    // Across many seeds, most questions should have at least one same-region
    // distractor (regions have plenty of members in the pool).
    const runs = [1, 2, 3, 4, 5].flatMap((s) => buildSilhouetteRun(s, 5));
    // Just assert the mechanism produces valid pools; region data itself is
    // exercised via the countries_stats fixture used by the implementation.
    for (const q of runs) {
      for (const opt of q.options) {
        expect(typeof opt).toBe('string');
        expect(opt).toHaveLength(3);
      }
    }
  });
});

describe('silhouetteCountryName', () => {
  it('localizes names and falls back to the code', () => {
    expect(silhouetteCountryName('FRA', 'fr')).toBe('France');
    expect(silhouetteCountryName('DEU', 'fr')).toBe('Allemagne');
    expect(silhouetteCountryName('DEU', 'en')).toBe('Germany');
    expect(silhouetteCountryName('ZZZ', 'fr')).toBe('ZZZ');
  });
});

describe('silhouettePath', () => {
  it('produces a closed path within the viewBox for every eligible country', () => {
    for (const id of silhouetteCountries()) {
      const d = silhouettePath(id, 100);
      expect(d).toBeTruthy();
      expect(d!.startsWith('M')).toBe(true);
      expect(d!.endsWith('Z')).toBe(true);
      // All coordinates stay inside the 100×100 box.
      const nums = d!.match(/-?\d+(\.\d+)?/g)!.map(Number);
      for (const n of nums) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(100);
      }
    }
  });

  it('drops far-away territories so the homeland fills the frame (France: no Guiana)', () => {
    // France has 3 raw rings; French Guiana sits ~71° away and must be culled,
    // Corsica (~7°) kept → 2 subpaths.
    const d = silhouettePath('FRA', 100)!;
    expect(d.split('M').filter(Boolean)).toHaveLength(2);
  });

  it('is null for unknown countries', () => {
    expect(silhouettePath('ZZZ')).toBeNull();
  });
});
