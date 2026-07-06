import {
  RANKS,
  getRankFromElo,
  getRankProgress,
  getBestOfForRank,
  calculateEloChange,
  generateRankedModes,
  modeLabel,
  pickRankedRegion,
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
  it('uses BO5 up to silver, BO7 up to diamond, BO9 for master', () => {
    expect(getBestOfForRank(getRankFromElo(0))).toBe(5); // bronze
    expect(getBestOfForRank(getRankFromElo(1200))).toBe(5); // silver
    expect(getBestOfForRank(getRankFromElo(1500))).toBe(7); // gold
    expect(getBestOfForRank(getRankFromElo(1800))).toBe(7); // platinum
    expect(getBestOfForRank(getRankFromElo(2100))).toBe(7); // diamond
    expect(getBestOfForRank(getRankFromElo(2400))).toBe(9); // master
  });
});

describe('calculateEloChange (asymmetric per tier)', () => {
  it('low ranks gain more than they lose for an equal match', () => {
    const bronzeGain = calculateEloChange(800, 800, true); // gain K 40 → +20
    const bronzeLoss = calculateEloChange(800, 800, false); // loss K 16 → -8
    expect(bronzeGain).toBe(20);
    expect(bronzeLoss).toBe(-8);
    expect(bronzeGain).toBeGreaterThan(Math.abs(bronzeLoss));
  });

  it('top ranks lose more than they gain for an equal match', () => {
    const masterGain = calculateEloChange(2500, 2500, true); // gain K 20 → +10
    const masterLoss = calculateEloChange(2500, 2500, false); // loss K 40 → -20
    expect(masterGain).toBe(10);
    expect(masterLoss).toBe(-20);
    expect(Math.abs(masterLoss)).toBeGreaterThan(masterGain);
  });

  it('rewards beating a stronger opponent more than an equal one', () => {
    expect(calculateEloChange(1500, 1900, true)).toBeGreaterThan(
      calculateEloChange(1500, 1500, true),
    );
  });

  it('returns an integer bounded by the player tier gain/loss K', () => {
    const v = calculateEloChange(1000, 2800, true); // bronze, gain K 40
    expect(Number.isInteger(v)).toBe(true);
    expect(Math.abs(v)).toBeLessThanOrEqual(40);
  });
});

describe('generateRankedModes', () => {
  const ALL: MatchMode[] = ['classic', 'streak', 'versus', 'globe', 'guess', 'regions', 'higherlower', 'silhouette', 'borders'];

  it('is deterministic for a given seed', () => {
    expect(generateRankedModes(9, 42)).toEqual(generateRankedModes(9, 42));
  });

  it('returns exactly bestOf modes, including BO7/BO9 beyond the pool size', () => {
    expect(generateRankedModes(5, 7)).toHaveLength(5);
    expect(generateRankedModes(7, 7)).toHaveLength(7);
    expect(generateRankedModes(9, 7)).toHaveLength(9);
  });

  it('draws only from the ranked pool and never repeats a mode back-to-back', () => {
    const modes = generateRankedModes(9, 99);
    for (let i = 0; i < modes.length; i++) {
      expect(ALL).toContain(modes[i]);
      if (i > 0) expect(modes[i]).not.toBe(modes[i - 1]);
    }
  });

  it('different seeds can produce different orderings', () => {
    const base = generateRankedModes(9, 1).join(',');
    const others = [2, 3, 4, 5].map((s) => generateRankedModes(9, s).join(','));
    expect(others.some((o) => o !== base)).toBe(true);
  });
});

describe('pickRankedRegion', () => {
  it('is deterministic for a given seed + round and returns a valid level', () => {
    const a = pickRankedRegion(123, 2);
    const b = pickRankedRegion(123, 2);
    expect(a).toEqual(b);
    expect(a.cca3).toMatch(/^[A-Z]{3}$/);
    expect(['regions', 'departments']).toContain(a.level);
    expect(typeof a.name).toBe('string');
  });

  it('different rounds can pick different countries', () => {
    const picks = [1, 2, 3, 4, 5].map((r) => pickRankedRegion(7, r).cca3);
    expect(new Set(picks).size).toBeGreaterThan(1);
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
