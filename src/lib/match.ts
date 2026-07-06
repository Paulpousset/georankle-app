/**
 * Best-of series outcome logic shared by the match result screen. Pure.
 */

export interface MatchOutcome {
  /** Rounds needed to win the series (majority of bestOf). */
  neededToWin: number;
  /** Whether the local player won the series. */
  iWon: boolean;
  /** Whether the series ended level. */
  isDraw: boolean;
}

/**
 * Computes the series outcome for a best-of-`bestOf` match. When `myTotalScore`
 * and `opponentTotalScore` are provided, a rounds-won tie is broken by cumulative
 * points ("en cas d'égalité, les points priment"); only when those are also equal
 * is it a true draw. Mirrors the server's apply_ranked_result tiebreaker.
 */
export function computeMatchOutcome(
  bestOf: number,
  myRoundsWon: number,
  opponentRoundsWon: number,
  myTotalScore?: number,
  opponentTotalScore?: number,
): MatchOutcome {
  const neededToWin = Math.ceil(bestOf / 2);
  const roundsTied = myRoundsWon === opponentRoundsWon;
  const hasTotals = myTotalScore !== undefined && opponentTotalScore !== undefined;
  const iWon =
    myRoundsWon > opponentRoundsWon ||
    (roundsTied && hasTotals && (myTotalScore as number) > (opponentTotalScore as number));
  const isDraw =
    roundsTied && (!hasTotals || (myTotalScore as number) === (opponentTotalScore as number));
  return { neededToWin, iWon, isDraw };
}

/**
 * Formats a round score for display. Every mode now reports on the same unified
 * 0–1000 scale (see `normalizeRoundScore` in lib/score.ts), so a single format is
 * used everywhere — the numbers are directly comparable across modes and serve as
 * the match tiebreaker. Single source of truth shared by the round summary and
 * match result screens.
 *
 * The `gameMode` parameter is kept for call-site compatibility (and in case a
 * mode ever needs a bespoke unit again) but no longer changes the unit.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function formatMatchScore(gameMode: string, score: number): string {
  return `${score} / 1000`;
}

/**
 * Seconds of match inactivity before the present player may claim the win
 * (mirrors the default window of the forfeit_match RPC in match_reconnect.sql).
 */
export const FORFEIT_WINDOW_SECONDS = 120;

/**
 * Whether the forfeit window has elapsed for a match whose shared activity
 * clock (`matches.last_activity_at`) last ticked at `lastActivityAt`.
 *
 * Client-side estimate only — the forfeit_match RPC re-checks server-side, so a
 * skewed device clock can at worst show the claim button early/late, never
 * grant an early win. An unparseable timestamp reports the window as NOT
 * elapsed (fail closed). Shared by the 1v1 engine and the FFA screen.
 */
export function forfeitWindowElapsed(
  lastActivityAt: string,
  nowMs: number,
  windowSeconds: number = FORFEIT_WINDOW_SECONDS,
): boolean {
  const last = new Date(lastActivityAt).getTime();
  if (Number.isNaN(last)) return false;
  return nowMs - last >= windowSeconds * 1000;
}
