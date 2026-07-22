import {
  STORY_LEVEL_COUNT,
  STAR_THRESHOLDS,
  buildStoryLevels,
  getStoryLevel,
  storySeedFor,
  modeForLevel,
  difficultyBand,
  questionCountFor,
  starsForScore,
} from '../story';
import { NOTORIETY_COUNT, notorietyRank } from '../../lib/notoriety';
import { pickBandCountries } from '../../lib/matchCountries';
import { BIOMES, biomeForTier } from '../biomes';
import { STORY_COSMETIC_UNLOCKS, getPartById, ALL_PARTS } from '../cosmetics';

describe('story catalogue', () => {
  it('builds exactly 300 levels, each with a mode and a seed', () => {
    const levels = buildStoryLevels();
    expect(levels).toHaveLength(STORY_LEVEL_COUNT);
    for (const l of levels) {
      expect(l.mode).toBeTruthy();
      expect(l.seed).toBeGreaterThanOrEqual(0);
      expect(l.questionCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('is deterministic — same level → same seed and mode', () => {
    expect(storySeedFor(42)).toBe(storySeedFor(42));
    expect(getStoryLevel(42).mode).toBe(getStoryLevel(42).mode);
    expect(storySeedFor(42)).not.toBe(storySeedFor(43));
  });

  it('unlocks harder modes only in later tiers', () => {
    const early = new Set(Array.from({ length: 7 }, (_, i) => modeForLevel(i + 1)));
    // Silhouette/borders/streak/classic must not appear in the first 7 levels.
    for (const m of ['silhouette', 'borders', 'streak', 'classic']) {
      expect(early.has(m as any)).toBe(false);
    }
    // Classic can only appear from level 160 on.
    const withClassic = Array.from({ length: STORY_LEVEL_COUNT }, (_, i) => ({
      lvl: i + 1,
      mode: modeForLevel(i + 1),
    })).filter((x) => x.mode === 'classic');
    for (const x of withClassic) expect(x.lvl).toBeGreaterThanOrEqual(160);
  });

  it('difficulty band slides from famous to obscure', () => {
    const b1 = difficultyBand(1);
    const b300 = difficultyBand(300);
    expect(b1.minRank).toBe(1);
    // Early band centres on famous countries; late band on obscure ones.
    expect(b1.maxRank).toBeLessThan(b300.maxRank);
    expect(b300.maxRank).toBe(NOTORIETY_COUNT);
    // Centre moves strictly outward with level.
    const mid = (b: { minRank: number; maxRank: number }) => (b.minRank + b.maxRank) / 2;
    expect(mid(b1)).toBeLessThan(mid(difficultyBand(150)));
    expect(mid(difficultyBand(150))).toBeLessThan(mid(b300));
  });

  it('question count ramps up for count-based modes', () => {
    expect(questionCountFor(1, 'globe')).toBe(3);
    expect(questionCountFor(300, 'globe')).toBe(8);
    // Intrinsic-length modes always report 1.
    expect(questionCountFor(300, 'guess')).toBe(1);
    expect(questionCountFor(300, 'borders')).toBe(1);
  });

  it('maps score to stars on the shared thresholds', () => {
    expect(starsForScore(0)).toBe(0);
    expect(starsForScore(STAR_THRESHOLDS[0])).toBe(1);
    expect(starsForScore(STAR_THRESHOLDS[1])).toBe(2);
    expect(starsForScore(1000)).toBe(3);
  });
});

describe('notoriety-band country picking', () => {
  it('ranks famous countries above obscure ones', () => {
    expect(notorietyRank('FRA')).toBeLessThan(notorietyRank('TUV'));
    expect(notorietyRank('USA')).toBeLessThan(notorietyRank('NRU'));
  });

  it('picks deterministic, in-band countries for early vs late levels', () => {
    const easy = getStoryLevel(1);
    const hard = getStoryLevel(300);
    const easyPicks = pickBandCountries(easy.seed, 'globe', undefined, 5, difficultyBand(1));
    const hardPicks = pickBandCountries(hard.seed, 'globe', undefined, 5, difficultyBand(300));
    expect(easyPicks).toHaveLength(5);
    expect(hardPicks).toHaveLength(5);
    // Same seed + band → identical picks (determinism).
    expect(pickBandCountries(easy.seed, 'globe', undefined, 5, difficultyBand(1))).toEqual(easyPicks);
    // Early picks are, on average, more famous than late picks.
    const avg = (ids: string[]) => ids.reduce((s, c) => s + notorietyRank(c), 0) / ids.length;
    expect(avg(easyPicks)).toBeLessThan(avg(hardPicks));
  });

  it('falls back to the full pool when a band is impossibly narrow', () => {
    const picks = pickBandCountries(123, 'guess', undefined, 5, { minRank: 1, maxRank: 1 });
    expect(picks).toHaveLength(5); // fell back rather than returning < count
  });
});

describe('biomes', () => {
  const N = BIOMES.length;
  it('cycles through the biome list by tier', () => {
    expect(biomeForTier(1).key).toBe(BIOMES[0].key);
    expect(biomeForTier(N).key).toBe(BIOMES[N - 1].key);
    expect(biomeForTier(N + 1).key).toBe(BIOMES[0].key); // wraps
    expect(biomeForTier(30).key).toBe(BIOMES[(30 - 1) % N].key);
  });
  it('has enough biomes to keep repeats far apart', () => {
    expect(N).toBeGreaterThanOrEqual(8);
  });
});

describe('story cosmetic rewards', () => {
  it('every unlock maps to an existing EXCLUSIVE part at a valid level', () => {
    for (const u of STORY_COSMETIC_UNLOCKS) {
      const part = getPartById(u.itemId);
      expect(part).toBeDefined();
      expect(part!.exclusive).toBe(true);
      expect(u.level).toBeGreaterThanOrEqual(1);
      expect(u.level).toBeLessThanOrEqual(300);
    }
  });

  it('exclusive parts are free and never enter the priced catalogue', () => {
    const exclusives = ALL_PARTS.filter((p) => p.exclusive);
    expect(exclusives.length).toBeGreaterThanOrEqual(9);
    for (const p of exclusives) expect(p.price).toBe(0);
  });
});
