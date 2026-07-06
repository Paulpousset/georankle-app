import rawCountriesStats from '../../../assets/countries_stats.json';
import { BORDER_PAIRS, BORDER_COUNT_EXCEPTIONS } from '../../data/borders';
import {
  borderCountries,
  borderNeighbors,
  bordersScore,
  buildBordersPuzzle,
  sharesBorder,
  shortestBorderPath,
  BORDERS_MAX_MISSES,
} from '../borders';

type Stat = { cca3: string; borders_count?: number };
const OFFICIAL = new Map(
  (rawCountriesStats as Stat[]).map((c) => [c.cca3, c.borders_count ?? 0]),
);

describe('border graph data', () => {
  it('declares each pair once, between two known countries', () => {
    const seen = new Set<string>();
    for (const pair of BORDER_PAIRS) {
      const [a, b] = pair.split('-');
      expect(a).toHaveLength(3);
      expect(b).toHaveLength(3);
      expect(a).not.toBe(b);
      expect(OFFICIAL.has(a)).toBe(true);
      expect(OFFICIAL.has(b)).toBe(true);
      const key = [a, b].sort().join('-');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('matches the official per-country border counts (documented exceptions only)', () => {
    // The dataset ships borders_count from the same source (restcountries);
    // any divergence must be explicitly documented in BORDER_COUNT_EXCEPTIONS.
    for (const [cca3, official] of OFFICIAL) {
      const internal = borderNeighbors(cca3).length;
      const exception = BORDER_COUNT_EXCEPTIONS[cca3];
      if (exception) {
        expect(internal).toBe(exception.internal);
        expect(official).toBe(exception.official);
      } else {
        expect(`${cca3}:${internal}`).toBe(`${cca3}:${official}`);
      }
    }
  });

  it('is symmetric', () => {
    for (const c of borderCountries()) {
      for (const n of borderNeighbors(c)) {
        expect(sharesBorder(n, c)).toBe(true);
      }
    }
  });
});

describe('shortestBorderPath', () => {
  it('finds known shortest paths', () => {
    expect(shortestBorderPath('FRA', 'ESP')).toEqual(['FRA', 'ESP']);
    expect(shortestBorderPath('PRT', 'FRA')).toEqual(['PRT', 'ESP', 'FRA']);
    expect(shortestBorderPath('USA', 'GTM')).toEqual(['USA', 'MEX', 'GTM']);
    expect(shortestBorderPath('KOR', 'KOR')).toEqual(['KOR']);
  });

  it('returns the optimal length even with alternatives', () => {
    // Portugal → Poland: PRT-ESP-FRA-DEU-POL (4 crossings).
    const path = shortestBorderPath('PRT', 'POL')!;
    expect(path).toHaveLength(5);
    expect(path[0]).toBe('PRT');
    expect(path[4]).toBe('POL');
  });

  it('is null between disconnected countries and unknown codes', () => {
    expect(shortestBorderPath('FRA', 'AUS')).toBeNull();
    expect(shortestBorderPath('FRA', 'ZZZ')).toBeNull();
  });
});

describe('buildBordersPuzzle', () => {
  it('is deterministic per seed and varies across seeds', () => {
    expect(buildBordersPuzzle(42)).toEqual(buildBordersPuzzle(42));
    const many = new Set([1, 2, 3, 4, 5].map((s) => JSON.stringify(buildBordersPuzzle(s))));
    expect(many.size).toBeGreaterThan(1);
  });

  it('always yields a solvable puzzle whose optimal matches the real BFS distance', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { start, target, optimal } = buildBordersPuzzle(seed);
      expect(optimal).toBeGreaterThanOrEqual(3);
      expect(optimal).toBeLessThanOrEqual(4);
      const path = shortestBorderPath(start, target);
      expect(path).not.toBeNull();
      expect(path!.length - 1).toBe(optimal);
    }
  });
});

describe('bordersScore', () => {
  it('pays 1000 for a perfect run and charges detours/misses with a floor', () => {
    expect(bordersScore(true, 0, 0)).toBe(1000);
    expect(bordersScore(true, 1, 0)).toBe(850);
    expect(bordersScore(true, 0, 2)).toBe(800);
    expect(bordersScore(true, 3, BORDERS_MAX_MISSES)).toBe(250);
    expect(bordersScore(true, 10, 10)).toBe(200);
  });

  it('scores a failed run at zero', () => {
    expect(bordersScore(false, 0, 3)).toBe(0);
  });
});
