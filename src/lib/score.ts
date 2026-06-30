/**
 * Cross-mode score normalization.
 *
 * Every game mode scores on its own native scale (globe/regions 0..N*1000,
 * guess 0-1000, versus 0..N*5, streak unbounded, classic an efficiency %). In a
 * multi-mode ranked/custom match those raw totals are not comparable, so the
 * cumulative points can't act as a fair tiebreaker.
 *
 * `normalizeRoundScore` maps any mode's raw per-round score onto a single
 * 0..ROUND_SCORE_MAX integer scale. The mapping is **monotonic non-decreasing**
 * in the raw score for every mode, so the per-round winner (decided by comparing
 * the two players' scores for that same mode) is never changed by normalization;
 * only the cross-mode comparability (and therefore the points tiebreaker) is.
 *
 * Single source of truth — used at every screen's `onRoundComplete` boundary.
 */
import type { MatchMode } from '../types';

/** All normalized round scores live in [0, ROUND_SCORE_MAX]. */
export const ROUND_SCORE_MAX = 1000;

/**
 * Streak length that maps to a full ROUND_SCORE_MAX. A streak past the cap still
 * maps to the ceiling (and ties there) — reaching it in a 1v1 round is already
 * dominant. Tune with the product owner.
 */
export const STREAK_CAP = 20;

export interface NormalizeCtx {
  /** globe / regions / versus: number of questions in the round. */
  numQuestions?: number;
  /** versus: max points obtainable per question (CASH = 5). */
  maxPointsPerQuestion?: number;
  /** streak: length mapping to the ceiling (defaults to STREAK_CAP). */
  streakCap?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Maps a mode's raw per-round score to an integer in [0, ROUND_SCORE_MAX]. */
export function normalizeRoundScore(
  mode: MatchMode,
  rawScore: number,
  ctx: NormalizeCtx = {},
): number {
  const raw = Number.isFinite(rawScore) ? rawScore : 0;

  switch (mode) {
    case 'guess':
      // Already on the 0..1000 scale (calcScore).
      return clamp(Math.round(raw), 0, ROUND_SCORE_MAX);

    case 'classic': {
      // Raw is an efficiency percentage (0..100, higher is better).
      return clamp(Math.round(raw * 10), 0, ROUND_SCORE_MAX);
    }

    case 'globe':
    case 'regions': {
      // Raw = correctCount * 1000, max = numQuestions * 1000.
      const n = ctx.numQuestions ?? 0;
      if (n <= 0) return clamp(Math.round(raw), 0, ROUND_SCORE_MAX);
      return clamp(Math.round((raw / (n * 1000)) * ROUND_SCORE_MAX), 0, ROUND_SCORE_MAX);
    }

    case 'versus': {
      // Raw = sum of per-question points, max = numQuestions * maxPointsPerQuestion.
      const n = ctx.numQuestions ?? 0;
      const per = ctx.maxPointsPerQuestion ?? 5;
      const max = n * per;
      if (max <= 0) return 0;
      return clamp(Math.round((raw / max) * ROUND_SCORE_MAX), 0, ROUND_SCORE_MAX);
    }

    case 'streak': {
      // Raw = consecutive-correct count (unbounded).
      const cap = ctx.streakCap ?? STREAK_CAP;
      if (cap <= 0) return 0;
      return clamp(Math.round((Math.min(raw, cap) / cap) * ROUND_SCORE_MAX), 0, ROUND_SCORE_MAX);
    }

    case 'challenge': {
      // CARRÉ/DUO/CASH quiz: raw = sum of per-question points; the ceiling is
      // every question answered the hardest way (CASH = 5 pts). Both players face
      // the same seeded questions, so this is a fair monotonic mapping.
      const n = ctx.numQuestions ?? 0;
      const per = ctx.maxPointsPerQuestion ?? 5;
      const max = n * per;
      if (max <= 0) return clamp(Math.round(raw), 0, ROUND_SCORE_MAX);
      return clamp(Math.round((raw / max) * ROUND_SCORE_MAX), 0, ROUND_SCORE_MAX);
    }

    default:
      return clamp(Math.round(raw), 0, ROUND_SCORE_MAX);
  }
}
