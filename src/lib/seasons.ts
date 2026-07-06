/**
 * Ranked seasons — read side. A season is a row in public.seasons; closing one
 * (tier rewards + ELO soft reset) is the admin-only `close_season` RPC, run
 * manually at the end of each quarter.
 */
import { supabase } from './supabase';

export interface Season {
  id: number;
  name: string;
  /** ISO timestamps. */
  startsAt: string;
  endsAt: string;
}

/** The season covering `now`, or null when none is open. */
export async function fetchCurrentSeason(): Promise<Season | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('seasons')
    .select('id, name, starts_at, ends_at')
    .eq('closed', false)
    .lte('starts_at', nowIso)
    .gte('ends_at', nowIso)
    .order('ends_at', { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const s = data[0];
  return { id: s.id, name: s.name, startsAt: s.starts_at, endsAt: s.ends_at };
}

/** Whole days left before the season ends (0 on the last day). Pure. */
export function seasonDaysLeft(season: Pick<Season, 'endsAt'>, nowMs: number): number {
  const left = new Date(season.endsAt).getTime() - nowMs;
  return Math.max(0, Math.floor(left / 86_400_000));
}
