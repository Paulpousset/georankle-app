/**
 * Solo coin award — shared by ClassicGame and StreakGame so the
 * "award + queue-on-failure" behaviour lives in one place.
 *
 * Returns what the results UI needs to render: how many coins were credited,
 * whether the daily cap was hit, and crucially whether the server actually
 * confirmed the award (`synced`). On failure the award is queued for retry on
 * reconnect, so the player isn't silently shortchanged.
 */
import { supabase } from './supabase';
import { enqueue } from './syncQueue';

export interface CoinAwardResult {
  coinsAwarded: number;
  capped: boolean;
  /** False when the server didn't confirm — the award was queued for retry. */
  synced: boolean;
}

/** How long to wait for the award RPC before giving up and queueing it. */
const AWARD_TIMEOUT_MS = 8000;

const TIMEOUT = Symbol('timeout');

/**
 * Race a promise against a timeout. We deliberately do NOT retry the RPC inline:
 * `award_solo_coins` is guarded by a daily cap rather than being binary
 * idempotent, so a blind retry after a lost response could burn a cap slot. A
 * timeout instead prevents an indefinitely-pending request from hanging the
 * results screen; the award is then queued and replayed once on reconnect.
 */
function withTimeout<T>(p: PromiseLike<T>): Promise<T | typeof TIMEOUT> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<typeof TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), AWARD_TIMEOUT_MS);
  });
  // Clear the timer once the race settles so it never dangles (which would keep
  // a test worker — or the JS timer queue — alive needlessly).
  return Promise.race([Promise.resolve(p), timeout]).finally(() => clearTimeout(timer));
}

export async function awardSoloCoins(gameMode: string): Promise<CoinAwardResult> {
  try {
    const result = await withTimeout(supabase.rpc('award_solo_coins', { p_game_mode: gameMode }));
    if (result === TIMEOUT) {
      // The request never resolved in time — queue it instead of hanging.
      await enqueue({ type: 'coins', gameMode });
      return { coinsAwarded: 0, capped: false, synced: false };
    }
    const { data, error } = result;
    if (error) {
      await enqueue({ type: 'coins', gameMode });
      return { coinsAwarded: 0, capped: false, synced: false };
    }
    const res = data as { coins_awarded?: number; capped?: boolean } | null;
    return { coinsAwarded: res?.coins_awarded ?? 0, capped: !!res?.capped, synced: true };
  } catch {
    // Network/exception path (the old code only checked `error` and hung).
    await enqueue({ type: 'coins', gameMode });
    return { coinsAwarded: 0, capped: false, synced: false };
  }
}
