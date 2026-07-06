/**
 * Server feature flags (public.feature_flags) — remote kill-switches read by
 * the client. Rows are written from the Supabase dashboard/SQL only; flipping
 * `enabled` is the whole activation procedure (no new build needed).
 *
 * Every gated RPC ALSO re-checks its flag server-side, so this client cache is
 * purely cosmetic (what UI to show) — never a security boundary.
 */
import { supabase } from './supabase';

/** Known flags (rows created by seasons_monetization.sql, all OFF). */
export type FeatureFlag = 'iap' | 'rewarded_ads';

const TTL_MS = 5 * 60 * 1000;

let cache: { at: number; flags: Record<string, boolean> } | null = null;

/** All flags, cached in memory for a few minutes. Fails closed (all false). */
export async function fetchFeatureFlags(): Promise<Record<string, boolean>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.flags;
  try {
    const { data, error } = await supabase.from('feature_flags').select('key, enabled');
    if (error) throw error;
    const flags = Object.fromEntries((data ?? []).map((r) => [r.key, r.enabled]));
    cache = { at: Date.now(), flags };
    return flags;
  } catch {
    return cache?.flags ?? {};
  }
}

/** Whether a single flag is on. Unknown/unreachable → false (fail closed). */
export async function isFeatureEnabled(flag: FeatureFlag): Promise<boolean> {
  const flags = await fetchFeatureFlags();
  return flags[flag] === true;
}

/** Test hook: drop the in-memory cache. */
export function __resetFeatureFlagCache(): void {
  cache = null;
}
