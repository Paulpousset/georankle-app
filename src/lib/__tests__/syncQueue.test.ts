// Mock the Supabase client (its module throws without env vars) and AsyncStorage
// so the queue's pure storage logic can be tested in isolation.
jest.mock('../supabase', () => ({
  supabase: {
    rpc: jest.fn(async () => ({ data: null, error: null })),
    auth: { getSession: jest.fn(async () => ({ data: { session: null } })) },
  },
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

import { enqueue, getPendingCount, subscribePending, _resetMemo } from '../syncQueue';

beforeEach(async () => {
  await AsyncStorage.clear();
  _resetMemo();
});

describe('syncQueue.enqueue + dedupe', () => {
  it('queues distinct ops and reports the pending count', async () => {
    await enqueue({ type: 'coins', gameMode: 'classic' });
    await enqueue({ type: 'daily', date: '2024-06-01', mode: 'streak', score: 5, grid: null });
    expect(await getPendingCount()).toBe(2);
  });

  it('collapses repeated coin awards for the same mode', async () => {
    await enqueue({ type: 'coins', gameMode: 'classic' });
    await enqueue({ type: 'coins', gameMode: 'classic' });
    await enqueue({ type: 'coins', gameMode: 'streak' });
    expect(await getPendingCount()).toBe(2); // classic collapsed, streak separate
  });

  it('keeps a single daily op per (date, mode), preferring the higher score', async () => {
    await enqueue({ type: 'daily', date: '2024-06-01', mode: 'classic', score: 40, grid: 'a' });
    await enqueue({ type: 'daily', date: '2024-06-01', mode: 'classic', score: 90, grid: 'b' });
    expect(await getPendingCount()).toBe(1);

    const raw = await AsyncStorage.getItem('sync:queue');
    const ops = JSON.parse(raw!);
    expect(ops[0].score).toBe(90);
    expect(ops[0].grid).toBe('b');
  });

  it('notifies subscribers with the current count', async () => {
    const seen: number[] = [];
    const unsub = subscribePending((n) => seen.push(n));
    await enqueue({ type: 'coins', gameMode: 'classic' });
    unsub();
    // Initial emit (0) plus the post-enqueue emit (1).
    expect(seen[seen.length - 1]).toBe(1);
  });
});
