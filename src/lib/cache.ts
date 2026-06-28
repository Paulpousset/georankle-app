import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Lightweight stale-while-revalidate cache backed by AsyncStorage.
 *
 * Screens read their last known value instantly (no empty flash on revisit),
 * then refetch in the background and update once fresh data arrives.
 */

const PREFIX = 'cache:';
/** Default freshness window — cached data is shown but a background refetch runs. */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

interface CacheEnvelope<T> {
  ts: number;
  value: T;
}

export async function cacheGet<T>(key: string): Promise<CacheEnvelope<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEnvelope<T>;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T): Promise<void> {
  try {
    // Timestamp comes from the JS clock; harmless if slightly skewed.
    const envelope: CacheEnvelope<T> = { ts: Date.now(), value };
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(envelope));
  } catch {
    // Best-effort cache — ignore write failures.
  }
}

export async function cacheClear(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

interface UseCachedDataResult<T> {
  data: T | null;
  /** True only while loading with no cached value to show. */
  loading: boolean;
  /** True while a background revalidation is in flight. */
  refreshing: boolean;
  error: boolean;
  refetch: () => void;
}

interface UseCachedDataOptions {
  /** Skip fetching entirely (e.g. while the user id is unknown). */
  enabled?: boolean;
  /** Freshness window in ms; within it the background refetch is skipped. */
  ttl?: number;
}

/**
 * Stale-while-revalidate data hook.
 *
 * - Hydrates from AsyncStorage synchronously-ish on mount (instant content).
 * - Always refetches in the background unless the cache is still within `ttl`.
 * - Persists every successful fetch for the next visit.
 *
 * `key` must change when the logical query changes (include ids/tabs in it).
 */
export function useCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseCachedDataOptions = {},
): UseCachedDataResult<T> {
  const { enabled = true, ttl = DEFAULT_TTL_MS } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  // Keep the latest fetcher without making it a dependency (avoids refetch loops).
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const load = useCallback(
    async (force: boolean, isActive: () => boolean) => {
      if (!enabled) {
        setLoading(false);
        return;
      }
      let isStale = true;
      const cached = await cacheGet<T>(key);
      if (!isActive()) return;
      if (cached) {
        setData(cached.value);
        setLoading(false);
        isStale = Date.now() - cached.ts > ttl;
      }
      // Within the TTL and not forced → trust the cache, skip the network.
      if (!force && cached && !isStale) return;

      setRefreshing(true);
      try {
        const fresh = await fetcherRef.current();
        if (!isActive()) return;
        setData(fresh);
        setError(false);
        cacheSet(key, fresh);
      } catch {
        if (isActive() && !cached) setError(true);
      } finally {
        if (isActive()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [key, enabled, ttl],
  );

  // Monotonic generation id. Each mount, key change and unmount bumps it, so an
  // async load captured from an earlier generation is ignored when it finally
  // resolves. (A boolean "active" flag can't distinguish a brand-new generation
  // from a revived stale one: switching keys while a fetch is in flight would
  // let the old response clobber the new key's data — see the race test.)
  const genRef = useRef(0);

  useEffect(() => {
    const gen = (genRef.current += 1);
    const isActive = () => genRef.current === gen;
    // Drop any previous-key data so a stale value isn't shown for a new query.
    setData(null);
    setLoading(true);
    setError(false);
    void load(false, isActive);
    return () => {
      // Invalidate this generation; the next effect (or unmount) supersedes it.
      genRef.current += 1;
    };
  }, [load]);

  const refetch = useCallback(() => {
    const gen = genRef.current;
    void load(true, () => genRef.current === gen);
  }, [load]);

  return { data, loading, refreshing, error, refetch };
}
