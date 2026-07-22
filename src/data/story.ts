/**
 * Story mode — a single 300-level campaign, identical for every player.
 *
 * Everything is DERIVED from the level number (no 300 hand-authored objects), so
 * the catalogue is deterministic and the same for everyone:
 *  - `storySeedFor(level)` — FNV-1a seed, reused as each mode's content seed.
 *  - `modeForLevel(level)` — one game mode per level, drawn from a pool that
 *    *expands* as you climb (harder modes unlock later).
 *  - `difficultyBand(level)` — a notoriety window that slides from famous
 *    (level 1) to obscure (level 300) for the country-answer modes.
 *  - `questionCountFor` / star thresholds — the rest of the difficulty ramp.
 *
 * Mode → screen rendering lives in StoryGameHost; scoring is the shared 0..1000
 * `normalizeRoundScore`, so a level's result maps straight onto star thresholds.
 */
import { createSeededRng } from '../lib/rng';
import { NOTORIETY_COUNT } from '../lib/notoriety';
import type { GameMode, MatchMode } from '../types';

export const STORY_LEVEL_COUNT = 300;

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

/** The pool of modes available at a given level (grows with progression). */
function unlockedModes(level: number): GameMode[] {
  const modes: GameMode[] = ['quiz-flag', 'quiz-capital', 'guess'];
  if (level >= 8) modes.push('globe');
  if (level >= 25) modes.push('higherlower');
  if (level >= 45) modes.push('silhouette');
  if (level >= 80) modes.push('borders');
  if (level >= 120) modes.push('streak');
  if (level >= 160) modes.push('classic');
  return modes;
}

/** Deterministic single mode for a level (same for everyone). */
export function modeForLevel(level: number): GameMode {
  const pool = unlockedModes(level);
  const rng = createSeededRng(storySeedFor(level) ^ 0x9e3779b9);
  return pool[Math.floor(rng() * pool.length)] ?? 'quiz-flag';
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
 * Notoriety window for a level. The window's centre slides from famous (~rank 12)
 * at level 1 to obscure (~rank 185) at level 300, with a wide half-width so there
 * are always plenty of candidate countries to pick from.
 */
export function difficultyBand(level: number): StoryBand {
  const N = NOTORIETY_COUNT;
  const t = (Math.min(Math.max(level, 1), STORY_LEVEL_COUNT) - 1) / (STORY_LEVEL_COUNT - 1);
  const center = 12 + t * (N - 10 - 12);
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
  return Math.min(8, 3 + Math.floor(level / 45)); // 3 → 8 as levels rise
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
    tier: Math.floor((level - 1) / 10) + 1,
  };
}

/** The full 300-level catalogue (memoized). */
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
