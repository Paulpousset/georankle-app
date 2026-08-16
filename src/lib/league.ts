/**
 * Ligues entre amis — private groups layered on top of the Daily Challenge.
 *
 * A league is a named group joined by invite code. Every UTC day, THREE modes
 * are drawn deterministically from a frozen pool (same draw for everyone, in
 * every league). Members simply play the existing daily puzzles — scores land
 * in `daily_results` via the untouched `complete_daily` RPC — and the league
 * leaderboards (day / month / total) are server-side aggregations of those
 * rows, normalised to 0-1000 per mode (see leagues.sql `league_norm_score`).
 *
 * ⚠️ The pools and the FNV-1a draw below are mirrored EXACTLY by
 * `league_daily_modes` in leagues.sql. Changing either side breaks the
 * client/server parity for the whole history — never reorder a pool.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AvatarConfig, GameMode } from '../types';
import { supabase } from './supabase';
import { track } from './analytics';

/**
 * The pool is VERSIONED BY DATE, never edited in place.
 *
 * The draw is `fnv1a(...) % pool.length`, so appending one entry would turn
 * every `% 10` into a `% 11` — for past dates too. And `league_leaderboard`
 * filters historical rows through `league_daily_modes(puzzle_date)`, so every
 * month/total standing ever computed would silently change. Dating the switch
 * keeps history frozen while letting the pool grow.
 *
 * Side benefit: until the cutover date, an old client, a new client and the
 * server all still compute the v1 draw — so the SQL and the app release can go
 * out in any order, and stragglers catch up on their own.
 */

/** UTC date (inclusive) from which poolV2 applies. FROZEN once shipped. */
export const LEAGUE_POOL_V2_FROM = '2026-09-15';

/** FROZEN FOREVER — never reorder, never append. */
const LEAGUE_MODE_POOL_V1: GameMode[] = [
  'globe',
  'regions',
  'guess',
  'borders',
  'silhouette',
  'higherlower',
  'classic',
  'streak',
  'quiz-capital',
  'quiz-flag',
];

/** V2 = V1 in the SAME order, new modes appended. Keep it a strict prefix. */
const LEAGUE_MODE_POOL_V2: GameMode[] = [...LEAGUE_MODE_POOL_V1, 'languages'];

/**
 * The pool in force on a date. Lexicographic comparison on `YYYY-MM-DD` is
 * chronological — no Date parsing, no timezone, and trivially reproducible in
 * SQL, which is what keeps the two implementations honest.
 */
export function leaguePoolFor(date: string): GameMode[] {
  return date >= LEAGUE_POOL_V2_FROM ? LEAGUE_MODE_POOL_V2 : LEAGUE_MODE_POOL_V1;
}

/** The pool in force today — what the screens list. */
export const LEAGUE_MODE_POOL = LEAGUE_MODE_POOL_V2;

/** Test/parity hooks. */
export const __LEAGUE_POOL_V1 = LEAGUE_MODE_POOL_V1;
export const __LEAGUE_POOL_V2 = LEAGUE_MODE_POOL_V2;

/** How many modes are drawn each day. */
export const LEAGUE_MODES_PER_DAY = 3;

/** FNV-1a 32-bit over an ASCII string (same maths as daily.ts `seedFor`). */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The 3 league modes for a UTC date (`YYYY-MM-DD`) — deterministic partial
 * Fisher-Yates seeded per (date, pick index). Mirrors SQL `league_daily_modes`.
 */
export function leagueModesFor(date: string): GameMode[] {
  const pool = [...leaguePoolFor(date)];
  const picked: GameMode[] = [];
  for (let k = 0; k < LEAGUE_MODES_PER_DAY; k++) {
    const idx = fnv1a(`${date}:league:${k}`) % pool.length;
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface League {
  id: string;
  name: string;
  /** 8-hex invite code shown/shared to friends. */
  code: string;
  ownerId: string;
  memberCount: number;
  createdAt: string;
}

export type LeaguePeriod = 'day' | 'month' | 'total';

export interface LeagueEntry {
  userId: string;
  username: string;
  avatarConfig: AvatarConfig | null;
  avatarUrl: string | null;
  /** Sum of normalised (0-1000/mode) daily scores over the period. */
  total: number;
  /** Number of counting daily puzzles played over the period. */
  played: number;
}

/** Failure reasons surfaced by the create/join RPCs (mapped to copy in UI). */
export type LeagueFailReason =
  | 'bad_name'
  | 'too_many_leagues'
  | 'invalid_code'
  | 'already_member'
  | 'full'
  | 'not_member'
  | 'error';

export interface LeagueOpResult {
  ok: boolean;
  reason?: LeagueFailReason;
  league?: Pick<League, 'id' | 'name' | 'code'>;
}

// ── RPC wrappers ─────────────────────────────────────────────────────────────

interface RawLeague {
  id: string;
  name: string;
  code: string;
  owner_id: string;
  member_count: number;
  created_at: string;
}

/** All leagues the signed-in user belongs to (owner first-party or joined). */
export async function getMyLeagues(): Promise<League[]> {
  const { data, error } = await supabase.rpc('get_my_leagues');
  if (error) throw error;
  return ((data ?? []) as unknown as RawLeague[]).map((l) => ({
    id: l.id,
    name: l.name,
    code: l.code,
    ownerId: l.owner_id,
    memberCount: l.member_count,
    createdAt: l.created_at,
  }));
}

export async function createLeague(name: string): Promise<LeagueOpResult> {
  const { data, error } = await supabase.rpc('create_league', { p_name: name.trim() });
  if (error) return { ok: false, reason: 'error' };
  const d = data as { ok?: boolean; reason?: LeagueFailReason; league_id?: string; name?: string; code?: string } | null;
  if (!d?.ok) return { ok: false, reason: d?.reason ?? 'error' };
  return { ok: true, league: { id: d.league_id!, name: d.name!, code: d.code! } };
}

export async function joinLeague(code: string): Promise<LeagueOpResult> {
  const { data, error } = await supabase.rpc('join_league', { p_code: code.trim() });
  if (error) return { ok: false, reason: 'error' };
  const d = data as { ok?: boolean; reason?: LeagueFailReason; league_id?: string; name?: string } | null;
  if (!d?.ok) return { ok: false, reason: d?.reason ?? 'error' };
  return { ok: true, league: { id: d.league_id!, name: d.name!, code: '' } };
}

export async function leaveLeague(leagueId: string): Promise<LeagueOpResult> {
  const { data, error } = await supabase.rpc('leave_league', { p_league: leagueId });
  if (error) return { ok: false, reason: 'error' };
  const d = data as { ok?: boolean; reason?: LeagueFailReason } | null;
  return d?.ok ? { ok: true } : { ok: false, reason: d?.reason ?? 'error' };
}

// ── Invite deep link (mirror of referral.ts's pending-code flow) ─────────────
// A `?league=CODE` link can open the app logged out; the code is stashed until
// a session exists, then joined automatically (see useDeepLinks).

const PENDING_LEAGUE_KEY = 'league:pending_join_code';

/** Persist a league code captured from a deep link until the user is logged in. */
export async function storePendingLeagueJoin(code: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_LEAGUE_KEY, code);
  } catch {
    /* best-effort */
  }
}

/**
 * If a league invite was captured before login, join it now that a session
 * exists. Clears the pending code on success or any terminal refusal (invalid,
 * full, already member…) so a bad code is never retried forever; only a
 * transient network 'error' is kept for later. Returns the joined league's
 * name, or null when nothing was pending / nothing was joined.
 */
export async function joinPendingLeague(): Promise<{ name: string } | null> {
  let code: string | null = null;
  try {
    code = await AsyncStorage.getItem(PENDING_LEAGUE_KEY);
  } catch {
    return null;
  }
  if (!code) return null;
  const res = await joinLeague(code);
  if (res.ok || (res.reason && res.reason !== 'error')) {
    try {
      await AsyncStorage.removeItem(PENDING_LEAGUE_KEY);
    } catch {
      /* best-effort */
    }
  }
  if (!res.ok) return null;
  track('league_joined', { via: 'link' });
  return { name: res.league?.name ?? '' };
}

interface RawEntry {
  user_id: string;
  username: string | null;
  avatar_config: AvatarConfig | null;
  avatar_url: string | null;
  total: number;
  played: number;
}

/** Server-ranked leaderboard for one league and period (already sorted). */
export async function fetchLeagueLeaderboard(
  leagueId: string,
  period: LeaguePeriod,
): Promise<LeagueEntry[]> {
  const { data, error } = await supabase.rpc('league_leaderboard', {
    p_league: leagueId,
    p_period: period,
  });
  if (error) throw error;
  return ((data ?? []) as unknown as RawEntry[]).map((r) => ({
    userId: r.user_id,
    username: r.username ?? 'Anonyme',
    avatarConfig: r.avatar_config,
    avatarUrl: r.avatar_url,
    total: r.total,
    played: r.played,
  }));
}
