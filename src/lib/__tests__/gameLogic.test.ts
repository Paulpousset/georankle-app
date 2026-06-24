import {
  SESSION_SIZE,
  MISSING_RANK,
  solveOptimal,
  calcScore,
  compareNum,
  buildComparison,
  UNKNOWN,
} from '../gameLogic';
import type { Country, Theme } from '../../types';

const GREEN = '#10B981';
const ORANGE = '#F59E0B';
const RED = '#EF4444';

function makeThemes(n = SESSION_SIZE): Theme[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    emoji: '⭐',
    label: { fr: `Thème ${i}`, en: `Theme ${i}` },
  }));
}

function makeCountry(i: number, ranks: Record<string, number>): Country {
  return { name: `Pays ${i}`, name_en: `Country ${i}`, cca3: `C${i}`, ranks, data: {} };
}

describe('calcScore', () => {
  it('awards 1000 for a single guess and 100 less per extra guess', () => {
    expect(calcScore(1)).toBe(1000);
    expect(calcScore(2)).toBe(900);
    expect(calcScore(10)).toBe(100);
  });

  it('never drops below 0', () => {
    expect(calcScore(11)).toBe(0);
    expect(calcScore(50)).toBe(0);
  });
});

describe('solveOptimal', () => {
  it('returns {} when there are fewer than a full session of themes/countries', () => {
    expect(solveOptimal(makeThemes(3), [], 'fr')).toEqual({});
    expect(solveOptimal(makeThemes(), [makeCountry(0, {})], 'en')).toEqual({});
  });

  it('finds the minimal-rank diagonal assignment', () => {
    const themes = makeThemes();
    // Country i is best (rank 1) at theme i, mediocre (rank 50) elsewhere.
    const countries = Array.from({ length: SESSION_SIZE }, (_, i) => {
      const ranks: Record<string, number> = {};
      themes.forEach((t, j) => (ranks[t.id] = i === j ? 1 : 50));
      return makeCountry(i, ranks);
    });

    const result = solveOptimal(themes, countries, 'en');

    // Every theme should be matched to its own country, each with rank 1.
    themes.forEach((t, i) => {
      expect(result[t.id].cca3).toBe(`C${i}`);
      expect(result[t.id].rank).toBe(1);
    });
    const total = Object.values(result).reduce((s, sel) => s + sel.rank, 0);
    expect(total).toBe(SESSION_SIZE); // 8 × rank 1
  });

  it('substitutes MISSING_RANK when a country lacks a theme value', () => {
    const themes = makeThemes();
    // One country is missing every theme key → it must contribute MISSING_RANK.
    const countries = Array.from({ length: SESSION_SIZE }, (_, i) => {
      if (i === 0) return makeCountry(0, {}); // no ranks at all
      const ranks: Record<string, number> = {};
      themes.forEach((t) => (ranks[t.id] = 5));
      return makeCountry(i, ranks);
    });

    const result = solveOptimal(themes, countries, 'en');
    const ranks = Object.values(result).map((s) => s.rank);
    expect(ranks).toContain(MISSING_RANK);
  });

  it('localises the assigned country name', () => {
    const themes = makeThemes();
    const countries = Array.from({ length: SESSION_SIZE }, (_, i) => {
      const ranks: Record<string, number> = {};
      themes.forEach((t, j) => (ranks[t.id] = i === j ? 1 : 50));
      return makeCountry(i, ranks);
    });
    expect(solveOptimal(themes, countries, 'fr')[themes[0].id].countryName).toBe('Pays 0');
    expect(solveOptimal(themes, countries, 'en')[themes[0].id].countryName).toBe('Country 0');
  });
});

describe('compareNum', () => {
  it('flags an exact match', () => {
    expect(compareNum(100, 100, '100', 'en')).toEqual({ value: '100', hint: '✓', color: GREEN });
  });

  it('uses orange within the 0.6–1.67 ratio band and red outside it', () => {
    expect(compareNum(100, 120, '100', 'fr').color).toBe(ORANGE); // ratio .83
    expect(compareNum(120, 100, '120', 'fr').color).toBe(ORANGE); // ratio 1.2
    expect(compareNum(100, 300, '100', 'fr').color).toBe(RED); // ratio .33
    expect(compareNum(300, 100, '300', 'fr').color).toBe(RED); // ratio 3
  });

  it('points the hint toward the mystery value', () => {
    expect(compareNum(100, 120, '100', 'fr').hint).toBe('▲ plus');
    expect(compareNum(120, 100, '120', 'fr').hint).toBe('▼ moins');
    expect(compareNum(100, 120, '100', 'en').hint).toBe('▲ more');
    expect(compareNum(120, 100, '120', 'en').hint).toBe('▼ less');
  });
});

describe('buildComparison', () => {
  const franceC = { cca3: 'FRA', data: { gdp_per_capita: { value: 40000 }, life_expectancy: { value: 82 } } };
  const germanyC = { cca3: 'DEU', data: { gdp_per_capita: { value: 45000 }, life_expectancy: { value: 81 } } };
  const franceS = { region: 'Europe', lat: 48.8566, lng: 2.3522, population: 67e6, area: 551695, coastline: true, borders_count: 8 };
  const germanyS = { region: 'Europe', lat: 52.52, lng: 13.405, population: 83e6, area: 357386, coastline: true, borders_count: 9 };

  it('greens a matching continent and reds a mismatch', () => {
    const same = buildComparison(franceC, germanyC, franceS, germanyS, 'en');
    expect(same.continent.color).toBe(GREEN);
    expect(same.continent.hint).toBe('✓');

    const asiaS = { ...germanyS, region: 'Asia' };
    const diff = buildComparison(franceC, germanyC, franceS, asiaS, 'en');
    expect(diff.continent.color).toBe(RED);
  });

  it('shows a bullseye and 0 km when guessing the target country', () => {
    const r = buildComparison(franceC, franceC, franceS, franceS, 'en');
    expect(r.direction.value).toBe('🎯');
    expect(r.distance.value).toBe('0 km');
    expect(r.distance.color).toBe(GREEN);
  });

  it('colours distance by the 500/2000 km thresholds', () => {
    // Paris → Berlin ≈ 877 km → orange distance, orange direction.
    const mid = buildComparison(franceC, germanyC, franceS, germanyS, 'en');
    expect(mid.distance.color).toBe(ORANGE);
    expect(mid.direction.color).toBe(ORANGE);

    // Paris → New York ≈ 5837 km → red distance and direction.
    const nyS = { ...germanyS, lat: 40.7128, lng: -74.006 };
    const far = buildComparison(franceC, germanyC, franceS, nyS, 'en');
    expect(far.distance.color).toBe(RED);
    expect(far.direction.color).toBe(RED);

    // Paris → London ≈ 344 km → green distance.
    const londonS = { ...germanyS, lat: 51.5074, lng: -0.1278 };
    const near = buildComparison(franceC, germanyC, franceS, londonS, 'en');
    expect(near.distance.color).toBe(GREEN);
  });

  it('marks missing stats as UNKNOWN', () => {
    const blankS = { region: 'Europe' };
    const r = buildComparison({ cca3: 'FRA', data: {} }, { cca3: 'DEU', data: {} }, blankS, blankS, 'en');
    expect(r.direction).toEqual(UNKNOWN);
    expect(r.population).toEqual(UNKNOWN);
    expect(r.gdp).toEqual(UNKNOWN);
  });
});
