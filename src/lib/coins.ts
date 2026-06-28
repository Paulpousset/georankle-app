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

export async function awardSoloCoins(gameMode: string): Promise<CoinAwardResult> {
  try {
    const { data, error } = await supabase.rpc('award_solo_coins', { p_game_mode: gameMode });
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
