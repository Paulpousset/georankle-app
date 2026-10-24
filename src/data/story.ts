/**
 * Story mode — a single 1000-level campaign, identical for every player.
 *
 * Everything is DERIVED from the level number (no 300 hand-authored objects), so
 * the catalogue is deterministic and the same for everyone:
 *  - `storySeedFor(level)` — FNV-1a seed, reused as each mode's content seed.
 *  - `modeForLevel(level)` — one game mode per level, drawn from a pool that
 *    *expands* as you climb (harder modes unlock later), never repeating the
 *    mode of the previous level(s).
 *  - `isBossLevel(level)` — each world's last level is a « défi »: a longer
 *    round, at the hard edge of the world's difficulty.
 *  - `difficultyBand(level)` — a notoriety window that slides from famous
 *    (level 1) to obscure (level 300) for the country-answer modes, then
 *    breathes inside each world (easier openers, hardest at the défi).
 *  - `questionCountFor` / star thresholds — the rest of the difficulty ramp.
 *  - `starsRequiredForTier` — the star gate between two worlds (tiers).
 *
 * Mode → screen rendering lives in StoryGameHost; scoring is the shared 0..1000
 * `normalizeRoundScore`, so a level's result maps straight onto star thresholds.
 */
import { createSeededRng } from '../lib/rng';
import { NOTORIETY_COUNT } from '../lib/notoriety';
import type { GameMode, MatchMode } from '../types';

export const STORY_LEVEL_COUNT = 1000;

/**
 * Levels over which the notoriety ramp climbs. It stayed at 300 when the
 * campaign grew to 500 then 1000 so the levels already played keep their
 * difficulty; past 300 the band only eases at the start of each world.
 */
const DIFFICULTY_RAMP_LEVELS = 300;

/** Levels per world (tier / biome band on the map). */
export const LEVELS_PER_TIER = 10;
export const STORY_TIER_COUNT = Math.ceil(STORY_LEVEL_COUNT / LEVELS_PER_TIER);

/**
 * Coins are paid on the first clear of every COIN_LEVEL_STEP-th level (a world's
 * défi), not on every level: since a life is now only lost on a failed level,
 * the campaign moves faster and the coins had to come less often. MUST mirror
 * complete_story_level (migrations/20261024_01_story_1000.sql).
 */
export const COIN_LEVEL_STEP = 10;
export const STORY_COIN_REWARD = 60;

/** Coins a first clear of this level pays (0 for most levels). */
export function coinRewardForLevel(level: number): number {
  return level % COIN_LEVEL_STEP === 0 ? STORY_COIN_REWARD : 0;
}

/** Next level (≥ level) whose first clear pays coins, or null past the end. */
export function nextCoinLevel(level: number): number | null {
  const next = Math.ceil(Math.max(level, 1) / COIN_LEVEL_STEP) * COIN_LEVEL_STEP;
  return next <= STORY_LEVEL_COUNT ? next : null;
}

/** Star cutoffs on the normalized 0..1000 score. ≥1 star unlocks the next level. */
export const STAR_THRESHOLDS = [400, 650, 850] as const;
export const PASS_SCORE = STAR_THRESHOLDS[0];

export type StoryQuestionType = 'CAPITAL' | 'FLAG';

export interface StoryBand {
  /** Most-famous rank allowed (1 = the most famous country). */
  minRank: number;
  /** Most-obscure rank allowed (NOTORIETY_COUNT = the most obscure). */
  maxRank: number;
}

export interface StoryLevel {
  level: number;
  /** App-level mode key (drives the StoryGameHost screen switch). */
  mode: GameMode;
  /** Round-engine mode (drives the synthetic matchData game_mode). */
  matchMode: MatchMode;
  /** For versus modes only. */
  questionType?: StoryQuestionType;
  /** Questions/rounds for modes that read a count; intrinsic-length modes use 1. */
  questionCount: number;
  /** Notoriety window for country-answer modes; null when the mode self-seeds. */
  band: StoryBand | null;
  /** Deterministic content seed, identical for all players. */
  seed: number;
  /** 1-based tier (group of 10 levels) — used for the map's section banners. */
  tier: number;
  /** The world's last level: a longer « défi » round. */
  boss: boolean;
}

// ── Seed ──────────────────────────────────────────────────────────────────────

/** FNV-1a over `story:${level}` → uint32. Same as daily's seedFor keyed on level. */
export function storySeedFor(level: number): number {
  const s = `story:${level}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ── Mode rotation (harder modes unlock later) ──────────────────────────────────

/** Modes whose answer country we can bias by notoriety via roundCountries. */
const BAND_MODES: ReadonlySet<GameMode> = new Set(['guess', 'globe', 'quiz-capital', 'quiz-flag']);

/**
 * The pool of modes available at a given level (grows with progression).
 *
 * ⚠️ Adding a mode here changes modeForLevel for EVERY level at or above its
 * threshold, including ones players have already cleared: story_progress stores
 * stars per level and not the mode, so nothing is corrupted, but replaying an
 * old level can now serve a different game. Pick thresholds accordingly.
 */
function unlockedModes(level: number): GameMode[] {
  const modes: GameMode[] = ['quiz-flag', 'quiz-capital', 'guess'];
  if (level >= 8) modes.push('globe');
  if (level >= 25) modes.push('higherlower');
  if (level >= 45) modes.push('silhouette');
  if (level >= 55) modes.push('pinpoint');
  if (level >= 60) modes.push('languages');
  if (level >= 80) modes.push('borders');
  if (level >= 120) modes.push('streak');
  if (level >= 160) modes.push('classic');
  return modes;
}

/**
 * Story difficulty ramp for « Langues ». The notoriety band (difficultyBand)
 * means nothing here — there is no answer country — so obscurity is ramped
 * through the language tiers instead: mainstream languages early, traps late.
 */
export function languageTierForLevel(level: number): 1 | 2 | 3 {
  if (level <= 100) return 1;
  if (level <= 200) return 2;
  return 3;
}

/** Modes that read a question count — the only ones a défi can lengthen. */
const COUNT_MODES: ReadonlySet<GameMode> = new Set([
  'quiz-flag', 'quiz-capital', 'globe', 'silhouette', 'pinpoint', 'languages',
]);

/** A world's last level (from world 2 on) is its « défi ». */
export function isBossLevel(level: number): boolean {
  return level >= 2 * LEVELS_PER_TIER && level % LEVELS_PER_TIER === 0;
}

/**
 * Modes already drawn, index = level - 1. Each level depends on the previous
 * ones (no repeats), so they're computed in order once and memoized.
 */
const modeMemo: GameMode[] = [];

function drawMode(level: number): GameMode {
  let pool = unlockedModes(level);
  if (isBossLevel(level)) pool = pool.filter((m) => COUNT_MODES.has(m));
  // Never the previous level's mode — nor the one before once the pool allows it.
  const recent = modeMemo.slice(Math.max(0, level - (pool.length >= 5 ? 3 : 2)), level - 1);
  const fresh = pool.filter((m) => !recent.includes(m));
  if (fresh.length) pool = fresh;
  const rng = createSeededRng(storySeedFor(level) ^ 0x9e3779b9);
  return pool[Math.floor(rng() * pool.length)] ?? 'quiz-flag';
}

/** Deterministic single mode for a level (same for everyone). */
export function modeForLevel(level: number): GameMode {
  for (let l = modeMemo.length + 1; l <= level; l++) modeMemo.push(drawMode(l));
  return modeMemo[level - 1] ?? 'quiz-flag';
}

function matchModeOf(mode: GameMode): MatchMode {
  switch (mode) {
    case 'quiz-capital':
    case 'quiz-flag':
      return 'versus';
    case 'guess':
      return 'guess';
    case 'globe':
      return 'globe';
    case 'silhouette':
      return 'silhouette';
    case 'pinpoint':
      return 'pinpoint';
    case 'languages':
      return 'languages';
    case 'borders':
      return 'borders';
    case 'higherlower':
      return 'higherlower';
    case 'streak':
      return 'streak';
    case 'classic':
      return 'classic';
    default:
      return 'versus';
  }
}

// ── Difficulty ramp ────────────────────────────────────────────────────────────

/**
 * Past the ramp, how far (in notoriety ranks) a world's levels step back toward
 * famous countries: openers breathe, the défi plays at the hardest band.
 */
const WORLD_EASE = [60, 45, 30, 20, 10, 0, 0, 0, 0, 0] as const;

/**
 * Notoriety window for a level. The window's centre slides from famous (~rank 12)
 * at level 1 to obscure (~rank 185) at level 300, with a wide half-width so
 * there are always plenty of candidate countries to pick from. After 300 the
 * centre stays obscure but eases off at the start of each world.
 */
export function difficultyBand(level: number): StoryBand {
  const N = NOTORIETY_COUNT;
  const t = (Math.min(Math.max(level, 1), DIFFICULTY_RAMP_LEVELS) - 1) / (DIFFICULTY_RAMP_LEVELS - 1);
  let center = 12 + t * (N - 10 - 12);
  if (level > DIFFICULTY_RAMP_LEVELS) center -= WORLD_EASE[(level - 1) % LEVELS_PER_TIER];
  const half = 45;
  const minRank = Math.max(1, Math.round(center - half));
  const maxRank = Math.min(N, Math.round(center + half));
  return { minRank, maxRank };
}

/** Questions/rounds for count-based modes; intrinsic-length modes return 1. */
export function questionCountFor(level: number, mode: GameMode): number {
  if (mode === 'guess' || mode === 'borders' || mode === 'streak' || mode === 'higherlower' || mode === 'classic') {
    return 1; // these have their own inherent length
  }
  const base = Math.min(8, 3 + Math.floor(level / 45)); // 3 → 8 as levels rise
  return isBossLevel(level) ? base + 2 : base; // a défi runs longer
}

// ── Level accessor + catalogue ─────────────────────────────────────────────────

/** Build a single level's descriptor (deterministic). */
export function getStoryLevel(level: number): StoryLevel {
  const mode = modeForLevel(level);
  const matchMode = matchModeOf(mode);
  const questionType: StoryQuestionType | undefined =
    mode === 'quiz-capital' ? 'CAPITAL' : mode === 'quiz-flag' ? 'FLAG' : undefined;
  return {
    level,
    mode,
    matchMode,
    questionType,
    questionCount: questionCountFor(level, mode),
    band: BAND_MODES.has(mode) ? difficultyBand(level) : null,
    seed: storySeedFor(level),
    tier: tierOfLevel(level),
    boss: isBossLevel(level),
  };
}

// ── World gates ────────────────────────────────────────────────────────────────

/** 1-based world (tier) of a level. */
export function tierOfLevel(level: number): number {
  return Math.floor((level - 1) / LEVELS_PER_TIER) + 1;
}

/** First level of a world. */
export function firstLevelOfTier(tier: number): number {
  return (tier - 1) * LEVELS_PER_TIER + 1;
}

/** World at which the star gate stops tightening (2.5 stars per level). */
const GATE_RAMP_TIERS = 50;

/**
 * Stars needed (over every earlier level) to ENTER a world. World 1 is free;
 * after that the bar is an average of 2.0 stars per level played so far, rising
 * to 2.5 at world 50 and flat after — so you can't rush through on one-star
 * clears, and the bar never climbs past the 3 stars a level can give.
 *
 * Integer-only on purpose: complete_story_level
 * (migrations/20261024_01_story_1000.sql) computes the exact same number to refuse a completion past a closed gate —
 * ceil(levels × (190 + min(tier, 50)) / 96).
 */
export function starsRequiredForTier(tier: number): number {
  if (tier <= 1) return 0;
  const levelsBefore = (tier - 1) * LEVELS_PER_TIER;
  return Math.floor((levelsBefore * (190 + Math.min(tier, GATE_RAMP_TIERS)) + 95) / 96);
}

/** Stars earned on the levels BEFORE a given one (what its gate compares). */
export function starsBeforeLevel(stars: Record<number, number>, level: number): number {
  let total = 0;
  for (const [k, v] of Object.entries(stars)) if (Number(k) < level) total += v;
  return total;
}

/**
 * The gate standing in front of a level, or null when it isn't a world's first
 * level (or is the free first world). `open` compares the stars earned before it.
 */
export function gateForLevel(
  level: number,
  stars: Record<number, number>,
): { tier: number; required: number; have: number; open: boolean } | null {
  if (level <= 1 || (level - 1) % LEVELS_PER_TIER !== 0) return null;
  const tier = tierOfLevel(level);
  const required = starsRequiredForTier(tier);
  const have = starsBeforeLevel(stars, level);
  return { tier, required, have, open: have >= required };
}

/** The full catalogue (memoized). */
let cached: StoryLevel[] | null = null;
export function buildStoryLevels(): StoryLevel[] {
  if (cached) return cached;
  cached = Array.from({ length: STORY_LEVEL_COUNT }, (_, i) => getStoryLevel(i + 1));
  return cached;
}

/** Stars earned for a normalized 0..1000 score. */
export function starsForScore(score: number): number {
  let stars = 0;
  for (const t of STAR_THRESHOLDS) if (score >= t) stars += 1;
  return stars;
}
