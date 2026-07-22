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

// log.ts pulls in @sentry/react-native (untranspiled ESM) — irrelevant here.
jest.mock('../log', () => ({
  log: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../supabase';
import { enqueue, flushQueue, getPendingCount, subscribePending, _resetMemo } from '../syncQueue';

beforeEach(async () => {
  await AsyncStorage.clear();
  _resetMemo();
});

describe('syncQueue.enqueue + dedupe', () => {
  it('queues distinct ops and reports the pending count', async () => {
    await enqueue({ type: 'coins', gameMode: 'classic', score: 500 });
    await enqueue({ type: 'daily', date: '2024-06-01', mode: 'streak', score: 5, grid: null });
    expect(await getPendingCount()).toBe(2);
  });

  it('collapses repeated coin awards for the same mode, keeping the higher score', async () => {
    await enqueue({ type: 'coins', gameMode: 'classic', score: 300 });
    await enqueue({ type: 'coins', gameMode: 'classic', score: 800 });
    await enqueue({ type: 'coins', gameMode: 'streak', score: 500 });
    expect(await getPendingCount()).toBe(2); // classic collapsed, streak separate

    const ops = JSON.parse((await AsyncStorage.getItem('sync:queue'))!);
    const classic = ops.find((o: { gameMode: string }) => o.gameMode === 'classic');
    expect(classic.score).toBe(800);
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
    await enqueue({ type: 'coins', gameMode: 'classic', score: 500 });
    unsub();
    // Initial emit (0) plus the post-enqueue emit (1).
    expect(seen[seen.length - 1]).toBe(1);
  });
});

describe('syncQueue.flushQueue error handling', () => {
  const mockSession = () =>
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
    });

  it('drops a permanently rejected op instead of blocking the queue forever', async () => {
    mockSession();
    // First op is rejected by the server for good (RAISE EXCEPTION → P0001),
    // second op succeeds — the queue must end up empty.
    (supabase.rpc as jest.Mock)
      .mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'bad game mode' } })
      .mockResolvedValue({ data: {}, error: null });

    await enqueue({ type: 'coins', gameMode: 'stale-mode', score: 500 });
    await enqueue({ type: 'coins', gameMode: 'classic', score: 500 });
    await flushQueue();

    expect(await getPendingCount()).toBe(0);
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });

  it('keeps ops queued on a transient (network-ish) failure', async () => {
    mockSession();
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'FetchError: network request failed' },
    });

    await enqueue({ type: 'coins', gameMode: 'classic', score: 500 });
    await flushQueue();

    expect(await getPendingCount()).toBe(1); // still there for the next retry
  });
});
