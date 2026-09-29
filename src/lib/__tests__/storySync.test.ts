// Story progress played signed out must catch up on the server (Sentry GEOG-11:
// « level N not unlocked » once the local map ran ahead of story_max_level).
jest.mock('../supabase', () => {
  const { makeSupabaseMock } = require('../../../test-utils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

// log.ts pulls in @sentry/react-native (untranspiled ESM) — irrelevant here.
jest.mock('../log', () => ({
  log: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
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
import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { _internal, getStorySnapshot, recordLevel } from '../story';
import type { SupabaseMock } from '../../../test-utils/supabaseMock';

const sb = supabase as unknown as SupabaseMock;
const user = { id: 'u1' } as User;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  sb.__reset();
  await AsyncStorage.clear();
});

describe('levelsToBackfill', () => {
  const progress = (maxLevel: number, stars: Record<string, number>) => ({
    maxLevel,
    levels: Object.fromEntries(Object.entries(stars).map(([k, s]) => [k, { stars: s, score: 500 }])),
  });

  it('lists the levels the server has not seen, in order', () => {
    expect(_internal.levelsToBackfill(progress(4, { 1: 3, 2: 2, 3: 1, 4: 3 }), 1)).toEqual([2, 3, 4]);
  });

  it('stops at the first level without a star', () => {
    expect(_internal.levelsToBackfill(progress(4, { 1: 3, 2: 0, 3: 1, 4: 3 }), 1)).toEqual([]);
    expect(_internal.levelsToBackfill(progress(4, { 1: 3, 2: 2, 4: 3 }), 0)).toEqual([1, 2]);
  });

  it('is empty when the server is level with the map', () => {
    expect(_internal.levelsToBackfill(progress(3, { 1: 3, 2: 2, 3: 1 }), 3)).toEqual([]);
  });
});

describe('getStorySnapshot backfill', () => {
  it('replays guest levels to the server once signed in', async () => {
    await recordLevel(null, 1, 800, 3);
    await recordLevel(null, 2, 600, 2);
    sb.rpc.mockImplementation((name: string) =>
      Promise.resolve({ data: name === 'get_story_state' ? { lives: 5, max_level: 0 } : {}, error: null }),
    );

    const snap = await getStorySnapshot(user);
    await flush();

    expect(snap.maxLevel).toBe(2);
    const completions = sb.rpc.mock.calls.filter(([name]) => name === 'complete_story_level');
    expect(completions.map(([, args]) => args)).toEqual([
      { p_level: 1, p_score: 800, p_stars: 3 },
      { p_level: 2, p_score: 600, p_stars: 2 },
    ]);
  });

  it('stops at the first refusal', async () => {
    await recordLevel(null, 1, 800, 3);
    await recordLevel(null, 2, 600, 2);
    sb.rpc.mockImplementation((name: string) =>
      Promise.resolve(
        name === 'get_story_state'
          ? { data: { lives: 5, max_level: 0 }, error: null }
          : { data: null, error: { code: 'P0001', message: 'level 1 not unlocked' } },
      ),
    );

    await getStorySnapshot(user);
    await flush();

    expect(sb.rpc.mock.calls.filter(([name]) => name === 'complete_story_level')).toHaveLength(1);
  });
});
