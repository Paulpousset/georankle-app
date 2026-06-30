/**
 * Free-for-all (FFA) match logic — pure helpers for online custom matches with
 * 2–8 players (each player for themselves). Mirrors the server-authoritative
 * resolution in multiplayer_ffa.sql so the client can render standings and decide
 * round outcomes consistently. No I/O — unit-tested in ffa.test.ts.
 *
 * Model: each round every player submits a score; the round is won by the top
 * scorer(s). After `best_of` rounds the champion is the player with the most
 * rounds won, ties broken by cumulative total score.
 */

export const MIN_FFA_PLAYERS = 2;
export const MAX_FFA_PLAYERS = 8;

export interface FfaPlayer {
  /** Stable identifier (slot index or user id). */
  id: string | number;
  roundsWon: number;
  totalScore: number;
}

/** Indices of the player(s) with the strictly highest score this round (ties → several). */
export function roundWinners(scores: number[]): number[] {
  if (scores.length === 0) return [];
  const max = Math.max(...scores);
  const winners: number[] = [];
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] === max) winners.push(i);
  }
  return winners;
}

/** Whether `n` is a valid FFA player count. */
export const isValidPlayerCount = (n: number) =>
  Number.isInteger(n) && n >= MIN_FFA_PLAYERS && n <= MAX_FFA_PLAYERS;

/** The series is decided once all `bestOf` rounds have been played. */
export const isSeriesOver = (roundsPlayed: number, bestOf: number) => roundsPlayed >= bestOf;

/**
 * Final standings, best first: ordered by rounds won, then cumulative total score.
 * Returns a new array; ties keep their relative input order (stable).
 */
export function standings<T extends FfaPlayer>(players: T[]): T[] {
  return [...players].sort((a, b) =>
    b.roundsWon - a.roundsWon || b.totalScore - a.totalScore,
  );
}

/** Champion(s) — the top of the standings, including any exact ties on both keys. */
export function champions<T extends FfaPlayer>(players: T[]): T[] {
  if (players.length === 0) return [];
  const ranked = standings(players);
  const top = ranked[0];
  return ranked.filter((p) => p.roundsWon === top.roundsWon && p.totalScore === top.totalScore);
}
