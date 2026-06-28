import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, waitFor, act } from '@testing-library/react-native';

import { cacheGet, cacheSet, cacheClear, useCachedData } from '../cache';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── Pure storage helpers ──────────────────────────────────────────────────────

describe('cacheGet / cacheSet / cacheClear', () => {
  it('round-trips a value inside a timestamped envelope', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_234_567);
    await cacheSet('k', { hello: 'world' });

    const env = await cacheGet<{ hello: string }>('k');
    expect(env).toEqual({ ts: 1_234_567, value: { hello: 'world' } });
  });

  it('returns null for a missing key', async () => {
    expect(await cacheGet('absent')).toBeNull();
  });

  it('returns null (never throws) on corrupt JSON', async () => {
    await AsyncStorage.setItem('cache:bad', 'not-json{');
    expect(await cacheGet('bad')).toBeNull();
  });

  it('returns null when the read itself throws', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    expect(await cacheGet('k')).toBeNull();
  });

  it('swallows write failures', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('full'));
    await expect(cacheSet('k', 1)).resolves.toBeUndefined();
  });

  it('clears a stored key', async () => {
    await cacheSet('k', 1);
    await cacheClear('k');
    expect(await cacheGet('k')).toBeNull();
  });
});

// ── useCachedData hook ────────────────────────────────────────────────────────

describe('useCachedData', () => {
  it('fetches and persists when the cache is empty', async () => {
    const fetcher = jest.fn().mockResolvedValue({ v: 1 });
    const { result } = renderHook(() => useCachedData('empty', fetcher));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual({ v: 1 }));
    expect(result.current.loading).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);

    expect((await cacheGet<{ v: number }>('empty'))?.value).toEqual({ v: 1 });
  });

  it('hydrates from a stale cache instantly, then revalidates (SWR)', async () => {
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    await cacheSet('swr', { v: 'old' });
    now += 6 * 60 * 1000; // past the 5-minute default TTL → stale

    const d = deferred<{ v: string }>();
    const fetcher = jest.fn(() => d.promise);
    const { result } = renderHook(() => useCachedData('swr', fetcher));

    // Phase 1: cached value shown immediately, background refetch in flight.
    await waitFor(() => expect(result.current.data).toEqual({ v: 'old' }));
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(true);

    // Phase 2: fresh value replaces the stale one.
    await act(async () => {
      d.resolve({ v: 'new' });
    });
    await waitFor(() => expect(result.current.data).toEqual({ v: 'new' }));
    expect(result.current.refreshing).toBe(false);
  });

  it('trusts a fresh cache within the TTL and skips the network', async () => {
    let now = 2_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    await cacheSet('fresh', { v: 'cached' });
    now += 60 * 1000; // 1 min < 5 min TTL

    const fetcher = jest.fn().mockResolvedValue({ v: 'network' });
    const { result } = renderHook(() => useCachedData('fresh', fetcher));

    await waitFor(() => expect(result.current.data).toEqual({ v: 'cached' }));
    await act(async () => {}); // flush any pending microtasks
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.refreshing).toBe(false);
  });

  it('refetch() forces a network call even within the TTL (invalidation)', async () => {
    let now = 3_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    await cacheSet('forced', { v: 'cached' });
    now += 60 * 1000;

    const fetcher = jest.fn().mockResolvedValue({ v: 'forced' });
    const { result } = renderHook(() => useCachedData('forced', fetcher));

    await waitFor(() => expect(result.current.data).toEqual({ v: 'cached' }));
    expect(fetcher).not.toHaveBeenCalled();

    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.data).toEqual({ v: 'forced' }));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('ignores a stale in-flight response after the key changes (race)', async () => {
    const a = deferred<{ v: string }>();
    const fetcherA = jest.fn(() => a.promise);
    const fetcherB = jest.fn().mockResolvedValue({ v: 'B' });

    const { result, rerender } = renderHook(
      ({ k, f }: { k: string; f: () => Promise<{ v: string }> }) => useCachedData(k, f),
      { initialProps: { k: 'A', f: fetcherA } },
    );

    await waitFor(() => expect(fetcherA).toHaveBeenCalled());

    // Switch keys while A's fetch is still pending.
    rerender({ k: 'B', f: fetcherB });
    await waitFor(() => expect(result.current.data).toEqual({ v: 'B' }));

    // A resolves late — its result must NOT clobber the current (B) data.
    await act(async () => {
      a.resolve({ v: 'A-late' });
    });
    expect(result.current.data).toEqual({ v: 'B' });
  });
});
