// Mock the Supabase client (its module throws without env vars) and AsyncStorage
// so the pure daily logic can be tested in isolation.
jest.mock('../supabase', () => ({
  supabase: { rpc: jest.fn(async () => ({ data: null, error: null })) },
}));

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
      clear: jest.fn(async () => {
        for (const k of Object.keys(store)) delete store[k];
      }),
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  computeStreak,
  completeDaily,
  getLocalState,
  getPuzzleNumber,
  getTodayUTC,
  msUntilNextPuzzle,
  seedFor,
} from '../daily';
import { buildShareMessage } from '../share';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('seedFor', () => {
  it('is deterministic for identical (date, mode)', () => {
    expect(seedFor('2024-06-01', 'classic')).toBe(seedFor('2024-06-01', 'classic'));
  });

  it('differs across modes and across dates', () => {
    expect(seedFor('2024-06-01', 'classic')).not.toBe(seedFor('2024-06-01', 'streak'));
    expect(seedFor('2024-06-01', 'classic')).not.toBe(seedFor('2024-06-02', 'classic'));
  });

  it('returns a non-negative 32-bit integer', () => {
    const s = seedFor('2024-06-01', 'globe');
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2 ** 32);
  });
});

describe('getPuzzleNumber', () => {
  it('is 0 at the epoch and increments by day (UTC)', () => {
    expect(getPuzzleNumber(new Date('2024-01-01T00:00:00Z'))).toBe(0);
    expect(getPuzzleNumber(new Date('2024-01-02T12:00:00Z'))).toBe(1);
    expect(getPuzzleNumber(new Date('2024-01-31T23:59:59Z'))).toBe(30);
  });
});

describe('getTodayUTC', () => {
  it('formats as YYYY-MM-DD in UTC', () => {
    expect(getTodayUTC(new Date('2024-06-09T05:00:00Z'))).toBe('2024-06-09');
  });
});

describe('msUntilNextPuzzle', () => {
  it('counts down to the next UTC midnight', () => {
    expect(msUntilNextPuzzle(new Date('2024-06-01T23:00:00Z'))).toBe(60 * 60 * 1000);
    expect(msUntilNextPuzzle(new Date('2024-06-01T00:00:00Z'))).toBe(24 * 60 * 60 * 1000);
  });
});

describe('computeStreak', () => {
  it('starts at 1 from a blank state', () => {
    expect(computeStreak({ streak: 0, best: 0, lastDate: null }, '2024-06-01')).toEqual({
      streak: 1,
      best: 1,
      lastDate: '2024-06-01',
    });
  });

  it('increments on a consecutive day and tracks best', () => {
    expect(computeStreak({ streak: 7, best: 7, lastDate: '2024-06-01' }, '2024-06-02')).toEqual({
      streak: 8,
      best: 8,
      lastDate: '2024-06-02',
    });
  });

  it('is unchanged when completing again the same day', () => {
    expect(computeStreak({ streak: 5, best: 9, lastDate: '2024-06-01' }, '2024-06-01')).toEqual({
      streak: 5,
      best: 9,
      lastDate: '2024-06-01',
    });
  });

  it('resets to 1 after a gap and keeps the best', () => {
    expect(computeStreak({ streak: 5, best: 9, lastDate: '2024-06-01' }, '2024-06-05')).toEqual({
      streak: 1,
      best: 9,
      lastDate: '2024-06-05',
    });
  });
});

describe('local state (recordLocal via completeDaily, logged-out)', () => {
  it('records today’s result, advances the streak, and counts completions', async () => {
    const today = getTodayUTC();
    const state = await completeDaily(null, { mode: 'classic', date: today, score: 87 });
    expect(state.streak).toBe(1);
    expect(state.todayCount).toBe(1);
    expect(state.results.classic.score).toBe(87);

    const reloaded = await getLocalState();
    expect(reloaded.todayCount).toBe(1);
    expect(reloaded.streak).toBe(1);
  });

  it('keeps the best score and does not double-count the day across modes', async () => {
    const today = getTodayUTC();
    await completeDaily(null, { mode: 'classic', date: today, score: 50 });
    await completeDaily(null, { mode: 'classic', date: today, score: 80 }); // higher → kept
    await completeDaily(null, { mode: 'streak', date: today, score: 3 });
    const state = await getLocalState();
    expect(state.results.classic.score).toBe(80);
    expect(state.todayCount).toBe(2);
    expect(state.streak).toBe(1); // same day, two modes → streak stays 1
  });
});

describe('buildShareMessage', () => {
  it('includes the title, grid, score and link for classic', () => {
    const msg = buildShareMessage(
      { mode: 'classic', date: '2024-06-01', score: 87, grid: '🟩🟩🟨' },
      5,
      'fr',
    );
    expect(msg).toContain('GeoRankle');
    expect(msg).toContain('#');
    expect(msg).toContain('🟩🟩🟨');
    expect(msg).toContain('87%');
    expect(msg).toContain('🔥');
    expect(msg).toContain('georankle.app');
  });

  it('falls back to a score line when a mode ships no grid', () => {
    const msg = buildShareMessage({ mode: 'streak', date: '2024-06-01', score: 12 }, 1, 'en');
    expect(msg).toContain('Streak of 12');
    expect(msg).not.toContain('🔥'); // streak of 1 → no streak line
  });
});
