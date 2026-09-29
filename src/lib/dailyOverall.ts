/**
 * Classement général du Défi du Jour — tous les dailies d'une journée combinés.
 *
 * Le calcul vit entièrement côté serveur (daily_overall.sql) : chaque mode vaut
 * au plus 1000 points, (score / meilleur score du jour dans ce mode) × 1000,
 * et le podium d'une journée terminée est payé en pièces par un cron à
 * 00:10 UTC. Le client ne fait que lire.
 */
import type { AvatarConfig } from '../types';
import { supabase } from './supabase';
import { log } from './log';

/** Pièces du podium, 1er → 3e. Miroir de `prizes` dans award_daily_overall. */
export const DAILY_OVERALL_PRIZES = [20, 10, 5] as const;

export interface DailyOverallEntry {
  user_id: string;
  username: string | null;
  avatarConfig: AvatarConfig | null;
  avatarUrl: string | null;
  /** Somme des scores normalisés (≤ 1000 par mode). */
  total: number;
  modesPlayed: number;
  rank: number;
  /** Pièces versées pour ce jour (null tant que le jour n'est pas payé). */
  coins: number | null;
}

/** La veille UTC d'une date `YYYY-MM-DD`. */
export function previousDayUTC(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function fetchDailyOverall(date: string): Promise<DailyOverallEntry[]> {
  const { data, error } = await supabase.rpc('daily_overall_leaderboard', { p_date: date });
  if (error) {
    log.error('Daily overall leaderboard fetch error:', error);
    throw error;
  }
  return (data ?? []).map((row) => ({
    user_id: row.user_id,
    username: row.username,
    avatarConfig: (row.avatar_config as AvatarConfig | null) ?? null,
    avatarUrl: row.avatar_url,
    total: row.total,
    modesPlayed: row.modes_played,
    rank: row.rank,
    coins: row.coins,
  }));
}

export interface DailyOverallNotice {
  date: string;
  rank: number;
  coins: number;
}

/**
 * Podiums gagnés que le joueur n'a pas encore vus — et les marque vus dans le
 * même appel, donc chaque victoire n'est annoncée qu'une fois.
 */
export async function claimDailyOverallNotices(): Promise<DailyOverallNotice[]> {
  const { data, error } = await supabase.rpc('claim_daily_overall_notices');
  if (error) {
    log.warn('claim_daily_overall_notices failed:', error);
    return [];
  }
  return (data ?? []).map((row) => ({ date: row.puzzle_date, rank: row.rank, coins: row.coins }));
}
