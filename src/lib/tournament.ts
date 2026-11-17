/**
 * « Tournoi de la semaine » : un mode solo par semaine (du lundi 00h UTC au
 * lundi suivant). Le classement prend le meilleur score de la semaine dans ce
 * mode (table `scores`, déjà écrite par chaque partie solo). Les 10 premiers
 * réclament leur lot la semaine suivante (`claim_tournament_prize`).
 */
import type { GameMode } from '../types';
import { supabase } from './supabase';

/** Rotation des modes — même liste et même époque que `tournament_mode` (SQL). */
export const TOURNAMENT_MODES = [
  'silhouette',
  'higherlower',
  'guess',
  'borders',
  'streak',
  'pinpoint',
  'scale',
  'split',
] as const satisfies readonly GameMode[];
export type TournamentMode = (typeof TOURNAMENT_MODES)[number];

/** Lots par rang (4e à 10e : 100). */
export const TOURNAMENT_PRIZES = [500, 300, 200, 100, 100, 100, 100, 100, 100, 100] as const;

const EPOCH = Date.UTC(2024, 0, 1); // un lundi
const WEEK = 7 * 86_400_000;

/** Le lundi (UTC, `YYYY-MM-DD`) de la semaine de `d`. */
export function weekStart(d: Date = new Date()): string {
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (new Date(day).getUTCDay() + 6) % 7; // lundi = 0
  return new Date(day - dow * 86_400_000).toISOString().slice(0, 10);
}

export function tournamentMode(week: string = weekStart()): TournamentMode {
  const idx = Math.floor((Date.parse(week + 'T00:00:00Z') - EPOCH) / WEEK);
  return TOURNAMENT_MODES[((idx % 8) + 8) % 8];
}

/** Millisecondes avant la fin du tournoi en cours. */
export function msUntilTournamentEnd(d: Date = new Date()): number {
  return Date.parse(weekStart(d) + 'T00:00:00Z') + WEEK - d.getTime();
}

export interface TournamentRow {
  user_id: string;
  username: string | null;
  best: number;
  games: number;
}

export async function fetchTournamentLeaderboard(
  week: string = weekStart(),
): Promise<TournamentRow[]> {
  const { data, error } = await supabase.rpc('tournament_leaderboard', {
    p_week: week,
    p_limit: 50,
  });
  if (error) throw error;
  return (data ?? []) as TournamentRow[];
}

export interface TournamentPrize {
  week: string;
  rank: number | null;
  coins: number;
}

/** Verse le lot de la semaine passée s'il est dû (idempotent). */
export async function claimTournamentPrize(): Promise<TournamentPrize | null> {
  const { data, error } = await supabase.rpc('claim_tournament_prize');
  if (error) return null;
  const r = (data ?? {}) as { week?: string; rank?: number | null; coins?: number };
  return { week: r.week ?? '', rank: r.rank ?? null, coins: r.coins ?? 0 };
}
