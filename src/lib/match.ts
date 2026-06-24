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

/** Computes the series outcome for a best-of-`bestOf` match. */
export function computeMatchOutcome(
  bestOf: number,
  myRoundsWon: number,
  opponentRoundsWon: number,
): MatchOutcome {
  const neededToWin = Math.ceil(bestOf / 2);
  return {
    neededToWin,
    iWon: myRoundsWon >= neededToWin,
    isDraw: myRoundsWon === opponentRoundsWon,
  };
}

/**
 * Formats a round score for display according to the game mode, so the unit
 * matches how that mode actually scores. Single source of truth shared by the
 * round summary and match result screens.
 *
 * - `classic`: efficiency percentage (0-100)        → "95%"
 * - `streak`:  count of consecutive correct answers → "12"
 * - everything else (`versus`, `globe`, `guess`):
 *              raw points                            → "47 pts"
 */
export function formatMatchScore(gameMode: string, score: number): string {
  if (gameMode === 'classic') return `${score}%`;
  if (gameMode === 'streak') return `${score}`;
  return `${score} pts`;
}
