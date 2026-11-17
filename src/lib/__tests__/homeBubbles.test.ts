jest.mock('../supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('../log', () => ({
  log: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../analytics', () => ({ track: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}) },
}));

import { CHEST_REWARDS, chestDay, chestReady, chestReward, nextStreak } from '../chest';
import { isRushHour, msLeftInRush, nextRushStart } from '../rush';
import { TOURNAMENT_MODES, msUntilTournamentEnd, tournamentMode, weekStart } from '../tournament';
import { MENU_MODES } from '../../data/menuModes';

describe('Coffre du jour', () => {
  it('grows over 7 days then loops', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(chestReward)).toEqual([...CHEST_REWARDS]);
    expect(chestReward(8)).toBe(CHEST_REWARDS[0]);
    expect(chestDay(14)).toBe(7);
  });

  it('streak: +1 the next day, reset after a gap, same day unchanged', () => {
    expect(nextStreak({ lastClaim: '2026-11-16', streak: 3 }, '2026-11-17')).toBe(4);
    expect(nextStreak({ lastClaim: '2026-11-14', streak: 3 }, '2026-11-17')).toBe(1);
    expect(nextStreak({ lastClaim: '2026-11-17', streak: 3 }, '2026-11-17')).toBe(3);
    expect(nextStreak({ lastClaim: null, streak: 0 }, '2026-11-17')).toBe(1);
    expect(chestReady({ lastClaim: '2026-11-17', streak: 3 }, '2026-11-17')).toBe(false);
    expect(chestReady({ lastClaim: '2026-11-16', streak: 3 }, '2026-11-17')).toBe(true);
  });
});

describe('Duel 20h', () => {
  it('is live only between 19:00 and 20:00 UTC', () => {
    expect(isRushHour(new Date('2026-11-17T18:59:59Z'))).toBe(false);
    expect(isRushHour(new Date('2026-11-17T19:00:00Z'))).toBe(true);
    expect(isRushHour(new Date('2026-11-17T19:59:59Z'))).toBe(true);
    expect(isRushHour(new Date('2026-11-17T20:00:00Z'))).toBe(false);
  });

  it('next start: today before/during, tomorrow after', () => {
    expect(nextRushStart(new Date('2026-11-17T08:00:00Z')).toISOString()).toBe('2026-11-17T19:00:00.000Z');
    expect(nextRushStart(new Date('2026-11-17T19:30:00Z')).toISOString()).toBe('2026-11-17T19:00:00.000Z');
    expect(nextRushStart(new Date('2026-11-17T20:30:00Z')).toISOString()).toBe('2026-11-18T19:00:00.000Z');
    expect(msLeftInRush(new Date('2026-11-17T19:45:00Z'))).toBe(15 * 60_000);
    expect(msLeftInRush(new Date('2026-11-17T12:00:00Z'))).toBe(0);
  });
});

describe('Tournoi de la semaine', () => {
  it('weeks start on Monday UTC', () => {
    expect(weekStart(new Date('2026-11-16T00:00:00Z'))).toBe('2026-11-16'); // lundi
    expect(weekStart(new Date('2026-11-22T23:59:59Z'))).toBe('2026-11-16'); // dimanche
    expect(weekStart(new Date('2026-11-23T00:00:00Z'))).toBe('2026-11-23');
    expect(msUntilTournamentEnd(new Date('2026-11-22T23:00:00Z'))).toBe(3_600_000);
  });

  it('rotates through every mode, one per week, matching the SQL formula', () => {
    // SQL : ((week - 2024-01-01) / 7) % 8 → 2024-01-01 = silhouette.
    expect(tournamentMode('2024-01-01')).toBe('silhouette');
    expect(tournamentMode('2024-01-08')).toBe('higherlower');
    expect(tournamentMode('2023-12-25')).toBe('split');
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      seen.add(tournamentMode(weekStart(new Date(Date.UTC(2026, 10, 16 + i * 7)))));
    }
    expect(seen.size).toBe(8);
  });

  it('every tournament mode is a playable solo mode with a menu entry', () => {
    for (const m of TOURNAMENT_MODES) expect(MENU_MODES.some((d) => d.mode === m)).toBe(true);
  });
});
