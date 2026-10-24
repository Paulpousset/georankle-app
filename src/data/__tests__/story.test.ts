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
  starsRequiredForTier,
  gateForLevel,
  tierOfLevel,
  STORY_TIER_COUNT,
  isBossLevel,
  coinRewardForLevel,
  nextCoinLevel,
} from '../story';
import { NOTORIETY_COUNT, notorietyRank } from '../../lib/notoriety';
import { pickBandCountries } from '../../lib/matchCountries';
import { BIOMES, TIERS_PER_BIOME, biomeForTier } from '../biomes';
import { STORY_COSMETIC_UNLOCKS, getPartById, ALL_PARTS } from '../cosmetics';

describe('story catalogue', () => {
  it('builds exactly 1000 levels, each with a mode and a seed', () => {
    const levels = buildStoryLevels();
    expect(STORY_LEVEL_COUNT).toBe(1000);
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

  it('never serves the same mode twice in a row', () => {
    for (let l = 2; l <= STORY_LEVEL_COUNT; l++) {
      expect(modeForLevel(l)).not.toBe(modeForLevel(l - 1));
    }
    // and, once the pool is wide enough, not within three levels either
    for (let l = 200; l <= STORY_LEVEL_COUNT; l++) {
      expect(modeForLevel(l)).not.toBe(modeForLevel(l - 2));
    }
  });

  it('ends each world (from world 2) on a longer défi', () => {
    expect(isBossLevel(10)).toBe(false);
    expect(isBossLevel(20)).toBe(true);
    expect(isBossLevel(21)).toBe(false);
    for (let l = 20; l <= STORY_LEVEL_COUNT; l += 10) {
      const lvl = getStoryLevel(l);
      expect(lvl.boss).toBe(true);
      expect(lvl.questionCount).toBeGreaterThan(1); // always a count-based mode
      expect(lvl.questionCount).toBe(Math.min(8, 3 + Math.floor(l / 45)) + 2);
    }
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

  it('past level 300, eases at the start of each world and peaks at the défi', () => {
    const mid = (b: { minRank: number; maxRank: number }) => (b.minRank + b.maxRank) / 2;
    expect(mid(difficultyBand(701))).toBeLessThan(mid(difficultyBand(710)));
    expect(difficultyBand(710)).toEqual(difficultyBand(300));
    for (let l = 301; l <= STORY_LEVEL_COUNT; l++) {
      const b = difficultyBand(l);
      expect(b.maxRank - b.minRank).toBeGreaterThanOrEqual(55); // never narrower than level 300's band
    }
  });

  it('question count ramps up for count-based modes', () => {
    expect(questionCountFor(1, 'globe')).toBe(3);
    expect(questionCountFor(299, 'globe')).toBe(8);
    expect(questionCountFor(300, 'globe')).toBe(10); // a défi
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
    const K = TIERS_PER_BIOME;
    expect(K).toBeGreaterThanOrEqual(3); // an environment lasts 30+ levels
    expect(biomeForTier(1).key).toBe(BIOMES[0].key);
    expect(biomeForTier(K).key).toBe(BIOMES[0].key);
    expect(biomeForTier(K + 1).key).toBe(BIOMES[1].key);
    expect(biomeForTier(N * K).key).toBe(BIOMES[N - 1].key);
    expect(biomeForTier(N * K + 1).key).toBe(BIOMES[0].key); // wraps
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
      expect(u.level).toBeLessThanOrEqual(STORY_LEVEL_COUNT);
    }
  });

  it('spreads the rewards over the whole campaign, further apart as it goes', () => {
    const levels = STORY_COSMETIC_UNLOCKS.map((u) => u.level);
    expect(levels[levels.length - 1]).toBe(STORY_LEVEL_COUNT);
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeGreaterThanOrEqual(50);
  });

  it('pays coins only on every 10th level', () => {
    expect(coinRewardForLevel(9)).toBe(0);
    expect(coinRewardForLevel(10)).toBeGreaterThan(0);
    expect(nextCoinLevel(1)).toBe(10);
    expect(nextCoinLevel(10)).toBe(10);
    expect(nextCoinLevel(11)).toBe(20);
    expect(nextCoinLevel(STORY_LEVEL_COUNT + 1)).toBeNull();
  });

  it('exclusive parts are free and never enter the priced catalogue', () => {
    const exclusives = ALL_PARTS.filter((p) => p.exclusive);
    expect(exclusives.length).toBeGreaterThanOrEqual(9);
    for (const p of exclusives) expect(p.price).toBe(0);
  });
});

describe('world star gates', () => {
  it('asks 2.0 stars per earlier level at world 2, rising to 2.5 at world 50 then flat', () => {
    expect(starsRequiredForTier(1)).toBe(0);
    expect(starsRequiredForTier(2)).toBe(20);
    expect(starsRequiredForTier(50)).toBe(Math.ceil(49 * 10 * 2.5));
    expect(starsRequiredForTier(STORY_TIER_COUNT)).toBe(Math.ceil((STORY_TIER_COUNT - 1) * 10 * 2.5));
    for (let t = 2; t <= STORY_TIER_COUNT; t++) {
      const levels = (t - 1) * 10;
      // integer formula == ceil(levels × (190 + min(t, 50)) / 96), always reachable (≤ 3★/level)
      expect(starsRequiredForTier(t)).toBe(Math.ceil((levels * (190 + Math.min(t, 50))) / 96 - 1e-9));
      expect(starsRequiredForTier(t)).toBeLessThan(levels * 3);
      expect(starsRequiredForTier(t)).toBeGreaterThanOrEqual(starsRequiredForTier(t - 1));
    }
  });

  it('only stands in front of a world\'s first level', () => {
    expect(gateForLevel(1, {})).toBeNull();
    expect(gateForLevel(10, {})).toBeNull();
    expect(gateForLevel(12, {})).toBeNull();
    expect(tierOfLevel(11)).toBe(2);
    const stars: Record<number, number> = {};
    for (let l = 1; l <= 10; l++) stars[l] = 2;
    expect(gateForLevel(11, stars)).toEqual({ tier: 2, required: 20, have: 20, open: true });
    stars[3] = 1;
    expect(gateForLevel(11, stars)?.open).toBe(false);
    // stars earned AFTER the gate don't count toward it
    stars[11] = 3;
    expect(gateForLevel(11, stars)?.have).toBe(19);
  });
});
