/**
 * League logic tests — the deterministic daily draw is the critical piece: it
 * is mirrored byte-for-byte by `league_daily_modes` in leagues.sql, so the
 * frozen fixtures below guard the client half of that parity. If this test
 * breaks, the SQL side is broken too (or the pool was reordered — forbidden).
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => (k in store ? store[k] : null)),
      setItem: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
      removeItem: jest.fn(async (k: string) => {
        delete store[k];
      }),
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  LEAGUE_MODE_POOL,
  LEAGUE_MODES_PER_DAY,
  LEAGUE_POOL_V2_FROM,
  LEAGUE_POOL_V3_FROM,
  LEAGUE_POOL_V4_FROM,
  __LEAGUE_POOL_V1,
  __LEAGUE_POOL_V2,
  __LEAGUE_POOL_V3,
  __LEAGUE_POOL_V4,
  createLeague,
  fetchLeagueLeaderboard,
  getMyLeagues,
  joinLeague,
  joinPendingLeague,
  leagueModesFor,
  storePendingLeagueJoin,
} from '../league';

jest.mock('../supabase', () => {
  const { makeSupabaseMock } = require('../../../test-utils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});
import { supabase } from '../supabase';

const sb = supabase as unknown as {
  __reset: () => void;
  rpc: jest.Mock;
};

beforeEach(() => sb.__reset());

describe('leagueModesFor', () => {
  it('draws exactly 3 distinct modes from the frozen pool', () => {
    for (const date of ['2026-07-23', '2026-12-31', '2030-06-15']) {
      const modes = leagueModesFor(date);
      expect(modes).toHaveLength(LEAGUE_MODES_PER_DAY);
      expect(new Set(modes).size).toBe(LEAGUE_MODES_PER_DAY);
      for (const m of modes) expect(LEAGUE_MODE_POOL).toContain(m);
    }
  });

  it('is deterministic — same date, same draw', () => {
    expect(leagueModesFor('2026-07-23')).toEqual(leagueModesFor('2026-07-23'));
  });

  it('matches the frozen fixtures mirrored by leagues.sql', () => {
    // Recomputing these means the algorithm changed → SQL parity is broken.
    // These three predate LEAGUE_POOL_V2_FROM and must NEVER move: they are the
    // proof that adding a mode did not rewrite the league history.
    expect(leagueModesFor('2026-07-23')).toEqual(['quiz-capital', 'classic', 'globe']);
    expect(leagueModesFor('2026-07-24')).toEqual(['regions', 'higherlower', 'silhouette']);
    expect(leagueModesFor('2026-01-01')).toEqual(['globe', 'quiz-capital', 'streak']);
    // One vector per pool window, each frozen for its own era. A vector only
    // ever moves when its window's pool is the one being extended.
    expect(leagueModesFor('2026-09-20')).toEqual(['higherlower', 'silhouette', 'quiz-flag']);
    expect(leagueModesFor('2027-03-15')).toEqual(['challenge', 'pinpoint', 'borders']);
  });

  it('switches pools exactly on the cutover dates', () => {
    expect(LEAGUE_POOL_V2_FROM).toBe('2026-09-15');
    expect(LEAGUE_POOL_V3_FROM).toBe('2026-10-15');
    expect(LEAGUE_POOL_V4_FROM).toBe('2026-11-15');
    // Last v1 day / first v2 day — the pair the SQL must reproduce verbatim.
    expect(leagueModesFor('2026-09-14')).toEqual(['quiz-capital', 'regions', 'higherlower']);
    expect(leagueModesFor('2026-09-15')).toEqual(['globe', 'quiz-flag', 'higherlower']);
    // Same for the v2 → v3 boundary.
    expect(leagueModesFor('2026-10-14')).toEqual(['classic', 'regions', 'silhouette']);
    expect(leagueModesFor('2026-10-15')).toEqual(['regions', 'guess', 'quiz-flag']);
    // And the v3 → v4 boundary.
    expect(leagueModesFor('2026-11-14')).toEqual(['streak', 'quiz-flag', 'borders']);
    expect(leagueModesFor('2026-11-15')).toEqual(['silhouette', 'regions', 'classic']);
  });

  it('never draws a mode before its cutover, and draws it after', () => {
    const day = (base: number, i: number) => new Date(base + i * 86400000).toISOString().slice(0, 10);
    const before = Date.UTC(2025, 0, 1);
    for (let i = 0; i < 300; i++) {
      expect(leagueModesFor(day(before, i))).not.toContain('languages');
    }
    // 'challenge' must stay out of every draw right up to the v3 cutover —
    // 2025-01-01 + 651 days = 2026-10-14, the last v2 day.
    for (let i = 0; i < 651; i++) {
      expect(leagueModesFor(day(before, i))).not.toContain('challenge');
    }
    const afterV2 = Array.from({ length: 300 }, (_, i) => leagueModesFor(day(Date.UTC(2026, 8, 15), i)));
    expect(afterV2.some((modes) => modes.includes('languages'))).toBe(true);
    const afterV3 = Array.from({ length: 300 }, (_, i) => leagueModesFor(day(Date.UTC(2026, 9, 15), i)));
    expect(afterV3.some((modes) => modes.includes('challenge'))).toBe(true);
    // 'pinpoint' stays out until the v4 cutover — 2025-01-01 + 682 days =
    // 2026-11-14, the last v3 day.
    for (let i = 0; i < 683; i++) {
      expect(leagueModesFor(day(before, i))).not.toContain('pinpoint');
    }
    const afterV4 = Array.from({ length: 300 }, (_, i) => leagueModesFor(day(Date.UTC(2026, 10, 15), i)));
    expect(afterV4.some((modes) => modes.includes('pinpoint'))).toBe(true);
  });

  it('keeps older pools frozen and each new one a strict superset (mirrors leagues.sql)', () => {
    // Appending to V2 is safe; touching V1 or reordering either rewrites history.
    expect(__LEAGUE_POOL_V1).toEqual([
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
    ]);
    expect(__LEAGUE_POOL_V2.slice(0, __LEAGUE_POOL_V1.length)).toEqual(__LEAGUE_POOL_V1);
    expect(__LEAGUE_POOL_V2).toContain('languages');
    expect(new Set(__LEAGUE_POOL_V2).size).toBe(__LEAGUE_POOL_V2.length);
    expect(__LEAGUE_POOL_V3.slice(0, __LEAGUE_POOL_V2.length)).toEqual(__LEAGUE_POOL_V2);
    expect(__LEAGUE_POOL_V3).toContain('challenge');
    expect(new Set(__LEAGUE_POOL_V3).size).toBe(__LEAGUE_POOL_V3.length);
    expect(__LEAGUE_POOL_V4.slice(0, __LEAGUE_POOL_V3.length)).toEqual(__LEAGUE_POOL_V3);
    expect(__LEAGUE_POOL_V4).toContain('pinpoint');
    expect(new Set(__LEAGUE_POOL_V4).size).toBe(__LEAGUE_POOL_V4.length);
    // The exported pool is the one in force today.
    expect(LEAGUE_MODE_POOL).toEqual(__LEAGUE_POOL_V4);
  });
  // The "every league mode must also be a daily mode" invariant lives in
  // modeRegistry.test.ts, which already mocks daily.ts's Supabase/Sentry chain.
});

describe('RPC wrappers', () => {
  it('createLeague maps a success payload', async () => {
    sb.rpc.mockResolvedValue({
      data: { ok: true, league_id: 'L1', name: 'Les potes', code: 'ABCD1234' },
      error: null,
    });
    const res = await createLeague('  Les potes  ');
    expect(sb.rpc).toHaveBeenCalledWith('create_league', { p_name: 'Les potes' });
    expect(res).toEqual({ ok: true, league: { id: 'L1', name: 'Les potes', code: 'ABCD1234' } });
  });

  it('createLeague surfaces a server refusal reason', async () => {
    sb.rpc.mockResolvedValue({ data: { ok: false, reason: 'too_many_leagues' }, error: null });
    const res = await createLeague('x');
    expect(res).toEqual({ ok: false, reason: 'too_many_leagues' });
  });

  it('joinLeague maps invalid codes and network errors', async () => {
    sb.rpc.mockResolvedValue({ data: { ok: false, reason: 'invalid_code' }, error: null });
    expect(await joinLeague('NOPE')).toEqual({ ok: false, reason: 'invalid_code' });

    sb.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await joinLeague('NOPE')).toEqual({ ok: false, reason: 'error' });
  });

  it('getMyLeagues converts snake_case rows', async () => {
    sb.rpc.mockResolvedValue({
      data: [
        {
          id: 'L1',
          name: 'Les potes',
          code: 'ABCD1234',
          owner_id: 'U1',
          member_count: 3,
          created_at: '2026-07-23T10:00:00Z',
        },
      ],
      error: null,
    });
    expect(await getMyLeagues()).toEqual([
      {
        id: 'L1',
        name: 'Les potes',
        code: 'ABCD1234',
        ownerId: 'U1',
        memberCount: 3,
        createdAt: '2026-07-23T10:00:00Z',
      },
    ]);
  });

  it('joinPendingLeague joins a stashed invite code and clears it', async () => {
    await storePendingLeagueJoin('660B2111');
    sb.rpc.mockResolvedValue({ data: { ok: true, league_id: 'L1', name: 'Copains BX' }, error: null });
    expect(await joinPendingLeague()).toEqual({ name: 'Copains BX' });
    expect(sb.rpc).toHaveBeenCalledWith('join_league', { p_code: '660B2111' });
    // Cleared → a second call is a no-op.
    expect(await joinPendingLeague()).toBeNull();
  });

  it('joinPendingLeague clears terminal refusals but keeps transient errors', async () => {
    await storePendingLeagueJoin('660B2111');
    // Transient network failure → the code stays for a later retry.
    sb.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await joinPendingLeague()).toBeNull();
    expect(await AsyncStorage.getItem('league:pending_join_code')).toBe('660B2111');
    // Terminal refusal (bad code) → cleared, never retried.
    sb.rpc.mockResolvedValue({ data: { ok: false, reason: 'invalid_code' }, error: null });
    expect(await joinPendingLeague()).toBeNull();
    expect(await AsyncStorage.getItem('league:pending_join_code')).toBeNull();
  });

  it('fetchLeagueLeaderboard converts entries and defaults the username', async () => {
    sb.rpc.mockResolvedValue({
      data: [
        {
          user_id: 'U1',
          username: null,
          avatar_config: null,
          avatar_url: null,
          total: 1450,
          played: 2,
        },
      ],
      error: null,
    });
    const rows = await fetchLeagueLeaderboard('L1', 'month');
    expect(sb.rpc).toHaveBeenCalledWith('league_leaderboard', { p_league: 'L1', p_period: 'month' });
    expect(rows).toEqual([
      {
        userId: 'U1',
        username: 'Anonyme',
        avatarConfig: null,
        avatarUrl: null,
        total: 1450,
        played: 2,
      },
    ]);
  });
});
