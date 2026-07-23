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
    expect(leagueModesFor('2026-07-23')).toEqual(['quiz-capital', 'classic', 'globe']);
    expect(leagueModesFor('2026-07-24')).toEqual(['regions', 'higherlower', 'silhouette']);
    expect(leagueModesFor('2026-01-01')).toEqual(['globe', 'quiz-capital', 'streak']);
    expect(leagueModesFor('2027-03-15')).toEqual(['guess', 'classic', 'quiz-capital']);
  });

  it('never reorders the pool (frozen — mirrors leagues.sql)', () => {
    expect(LEAGUE_MODE_POOL).toEqual([
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
  });
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
