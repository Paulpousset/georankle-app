jest.mock('../supabase', () => ({
  supabase: { rpc: jest.fn(async () => ({ data: null, error: null })) },
}));
jest.mock('../log', () => ({
  log: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';

import { DAILY_MODES } from '../daily';
import {
  bonusProgress,
  FEATURED_ROTATION,
  featuredDailyMode,
  hasAutostarted,
  markAutostarted,
  shouldAutostart,
} from '../featuredDaily';

const fresh = { streak: 0, best: 0, todayCount: 0 };

describe('featuredDailyMode', () => {
  it('only features modes that have a daily puzzle', () => {
    for (const m of FEATURED_ROTATION) expect(DAILY_MODES).toContain(m);
  });

  it('is the same all day and never repeats two days in a row', () => {
    const days = Array.from({ length: 60 }, (_, i) =>
      new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10),
    );
    for (let i = 1; i < days.length; i++) {
      expect(featuredDailyMode(days[i])).not.toBe(featuredDailyMode(days[i - 1]));
    }
    expect(featuredDailyMode('2026-11-17')).toBe(featuredDailyMode('2026-11-17'));
  });

  it('cycles through the whole rotation', () => {
    const seen = new Set<string>();
    for (let i = 0; i < FEATURED_ROTATION.length; i++) {
      seen.add(featuredDailyMode(new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)));
    }
    expect(seen.size).toBe(FEATURED_ROTATION.length);
  });
});

describe('bonusProgress', () => {
  it('counts the other modes only', () => {
    const results = {
      guess: { mode: 'guess', date: 'd', score: 1 },
      globe: { mode: 'globe', date: 'd', score: 1 },
    } as never;
    expect(bonusProgress({ results }, 'guess')).toEqual({
      done: 1,
      total: DAILY_MODES.length - 1,
    });
  });
});

describe('shouldAutostart', () => {
  it('opens the puzzle for a brand-new player only', () => {
    expect(shouldAutostart(false, false, fresh)).toBe(true);
    expect(shouldAutostart(true, false, fresh)).toBe(false);
    expect(shouldAutostart(false, true, fresh)).toBe(false);
    expect(shouldAutostart(false, false, { ...fresh, best: 3 })).toBe(false);
    expect(shouldAutostart(false, false, { ...fresh, todayCount: 1 })).toBe(false);
  });

  it('remembers it already happened on this device', async () => {
    await AsyncStorage.clear();
    expect(await hasAutostarted()).toBe(false);
    await markAutostarted();
    expect(await hasAutostarted()).toBe(true);
  });
});
