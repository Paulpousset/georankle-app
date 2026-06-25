import {
  RANKS,
  getRankFromElo,
  getRankProgress,
  getBestOfForRank,
  calculateEloChange,
  generateRankedModes,
  modeLabel,
} from '../ranked';
import type { MatchMode } from '../../types';

describe('getRankFromElo', () => {
  it('maps the canonical tier boundaries', () => {
    expect(getRankFromElo(0).tier).toBe('bronze');
    expect(getRankFromElo(1199).tier).toBe('bronze');
    expect(getRankFromElo(1200).tier).toBe('silver');
    expect(getRankFromElo(1499).tier).toBe('silver');
    expect(getRankFromElo(1500).tier).toBe('gold');
    expect(getRankFromElo(1799).tier).toBe('gold');
    expect(getRankFromElo(1800).tier).toBe('platinum');
    expect(getRankFromElo(2099).tier).toBe('platinum');
    expect(getRankFromElo(2100).tier).toBe('diamond');
    expect(getRankFromElo(2399).tier).toBe('diamond');
    expect(getRankFromElo(2400).tier).toBe('master');
    expect(getRankFromElo(999999).tier).toBe('master');
  });

  it('clamps negative / sub-bronze elo to bronze', () => {
    expect(getRankFromElo(-50).tier).toBe('bronze');
  });
});

describe('getRankProgress', () => {
  it('is 0 at the bottom of a tier and approaches 1 at the top', () => {
    expect(getRankProgress(1200)).toBe(0); // start of silver
    const nearTop = getRankProgress(1499);
    expect(nearTop).toBeGreaterThan(0.99);
    expect(nearTop).toBeLessThanOrEqual(1);
  });

  it('returns ~0.5 mid-tier', () => {
    // silver: 1200..1499 (range 300). 1350 → 150/300 = 0.5
    expect(getRankProgress(1350)).toBeCloseTo(0.5, 5);
  });

  it('is always 1 for master (no max elo)', () => {
    expect(getRankProgress(2400)).toBe(1);
    expect(getRankProgress(5000)).toBe(1);
  });

  it('never exceeds 1', () => {
    for (const r of RANKS) {
      expect(getRankProgress(r.minElo)).toBeGreaterThanOrEqual(0);
      expect(getRankProgress(r.minElo)).toBeLessThanOrEqual(1);
    }
  });
});

describe('getBestOfForRank', () => {
  it('uses BO3 for bronze and silver, BO5 above', () => {
    expect(getBestOfForRank(getRankFromElo(0))).toBe(3); // bronze
    expect(getBestOfForRank(getRankFromElo(1200))).toBe(3); // silver
    expect(getBestOfForRank(getRankFromElo(1500))).toBe(5); // gold
    expect(getBestOfForRank(getRankFromElo(2400))).toBe(5); // master
  });
});

describe('calculateEloChange', () => {
  it('is symmetric for equal-rated players (±16 with K=32)', () => {
    expect(calculateEloChange(1500, 1500, true)).toBe(16);
    expect(calculateEloChange(1500, 1500, false)).toBe(-16);
  });

  it('rewards beating a stronger opponent more than an equal one', () => {
    const vsStronger = calculateEloChange(1500, 1900, true);
    const vsEqual = calculateEloChange(1500, 1500, true);
    expect(vsStronger).toBeGreaterThan(vsEqual);
  });

  it('penalises losing to a weaker opponent more than to an equal one', () => {
    const vsWeaker = calculateEloChange(1900, 1500, false);
    const vsEqual = calculateEloChange(1500, 1500, false);
    expect(vsWeaker).toBeLessThan(vsEqual);
  });

  it('stays within ±K and returns an integer', () => {
    const v = calculateEloChange(1000, 2800, true);
    expect(Number.isInteger(v)).toBe(true);
    expect(Math.abs(v)).toBeLessThanOrEqual(32);
  });
});

describe('generateRankedModes', () => {
  const ALL: MatchMode[] = ['classic', 'streak', 'versus', 'globe', 'guess'];

  it('is deterministic for a given seed', () => {
    expect(generateRankedModes(5, 42)).toEqual(generateRankedModes(5, 42));
  });

  it('returns exactly bestOf modes', () => {
    expect(generateRankedModes(3, 7)).toHaveLength(3);
    expect(generateRankedModes(5, 7)).toHaveLength(5);
  });

  it('returns distinct modes drawn from the ranked pool', () => {
    const modes = generateRankedModes(5, 99);
    expect(new Set(modes).size).toBe(modes.length);
    for (const m of modes) expect(ALL).toContain(m);
  });

  it('different seeds can produce different orderings', () => {
    // Not guaranteed for every pair, but at least one of several seeds must differ.
    const base = generateRankedModes(5, 1).join(',');
    const others = [2, 3, 4, 5].map((s) => generateRankedModes(5, s).join(','));
    expect(others.some((o) => o !== base)).toBe(true);
  });
});

describe('modeLabel', () => {
  it('localises mode names', () => {
    expect(modeLabel('classic', 'fr')).toBe('Rankle');
    expect(modeLabel('classic', 'en')).toBe('Rankle');
    expect(modeLabel('guess', 'fr')).toBe('Devine le Pays');
    expect(modeLabel('guess', 'en')).toBe('Guess Country');
  });
});
