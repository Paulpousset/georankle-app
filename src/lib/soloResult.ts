/**
 * What a solo run is worth — one place deciding whether it counts.
 *
 * Solo play can now be biased in three ways: a continent scope ("réviser
 * l'Afrique"), the no-pressure Entraînement mode, and the Révision mode that
 * replays your past mistakes. None of those draw from the standard worldwide
 * pool, so none of them may enter the leaderboard: a 1000 scored over Oceania's
 * 14 countries is not the same feat as a 1000 over 195, and a review run is
 * deliberately stacked with countries you've already met.
 *
 * Coins are treated differently on purpose — a player shouldn't lose their
 * daily reward for choosing to learn — so only Entraînement, which removes the
 * timer and reveals every answer, forgoes them.
 *
 * Screens keep their own `awardSoloCoins` call (the score they feed it is
 * mode-specific) and their own leaderboard value; this module only gates them.
 */
import { supabase } from './supabase';
import { log } from './log';
import { continentLabel } from '../data/continents';
import type { ContinentId } from '../data/continents';
import type { GameMode, Language } from '../types';

export interface SoloRunContext {
  /** Continent the pool was narrowed to; null/undefined = worldwide. */
  scope?: ContinentId | null;
  /** Entraînement: no timer, every answer revealed, nothing at stake. */
  training?: boolean;
  /** Révision: the pool is stacked with the player's past mistakes. */
  review?: boolean;
}

/** True when the run drew from the standard worldwide pool under normal rules. */
export function countsForLeaderboard(ctx: SoloRunContext = {}): boolean {
  return !ctx.scope && !ctx.training && !ctx.review;
}

/** True when the run may still earn coins (everything except Entraînement). */
export function earnsCoins(ctx: SoloRunContext = {}): boolean {
  return !ctx.training;
}

/**
 * Persists a solo score to the leaderboard, unless the run was biased.
 *
 * `score` stays whatever the calling screen already stored (some modes save a
 * raw session score, some the normalized 0–1000 one) — this must not change, or
 * existing leaderboards would stop comparing like with like.
 */
export async function saveSoloScore(
  user: { id: string } | null,
  mode: GameMode,
  score: number,
  ctx: SoloRunContext = {},
  onError?: () => void,
): Promise<void> {
  if (!user || !countsForLeaderboard(ctx)) return;
  const { error } = await supabase
    .from('scores')
    .insert({ user_id: user.id, game_mode: mode, score });
  if (error) {
    log.error(`Error saving ${mode} score:`, error);
    onError?.();
  }
}

/**
 * The "this run is off the leaderboard" line for the results screen, or null
 * when the run counts normally.
 */
export function offLeaderboardNotice(ctx: SoloRunContext, language: Language): string | null {
  if (countsForLeaderboard(ctx)) return null;
  if (ctx.training) {
    return language === 'fr'
      ? 'Entraînement — ni pièces ni classement'
      : 'Training — no coins, no leaderboard';
  }
  if (ctx.review) {
    return language === 'fr'
      ? 'Révision — hors classement'
      : 'Review — off the leaderboard';
  }
  const zone = continentLabel(ctx.scope ?? undefined, language);
  return language === 'fr'
    ? `Partie ${zone} — hors classement`
    : `${zone} run — off the leaderboard`;
}
