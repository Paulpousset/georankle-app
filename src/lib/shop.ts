/**
 * Cosmetic purchase — the network core of the Shop "buy" flow, pulled out of the
 * screen so its happy / RPC-error / thrown-exception paths can be unit-tested
 * without rendering the whole Shop.
 *
 * The server RPC `purchase_cosmetic` debits coins and grants the item
 * atomically. On success we drop the cached Profile snapshot so the wallet shown
 * there doesn't diverge from the new balance until its TTL expires. The screen
 * keeps the UI side effects (haptics, optimistic state, toast, analytics).
 */
import { supabase } from './supabase';
import { cacheClear } from './cache';

export type PurchaseResult =
  | { ok: true; alreadyOwned: boolean; newBalance: number }
  | { ok: false; message: string };

/**
 * Best-effort human-readable message for whatever was thrown. Supabase errors
 * are plain `{ message, code, ... }` objects (not `Error` instances), so a naive
 * `String(e)` would render the unhelpful "[object Object]" in the failure toast.
 */
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return String(e);
}

export async function purchaseCosmetic(itemId: string, userId: string): Promise<PurchaseResult> {
  try {
    // `error` covers RPC-level failures; the try/catch also catches a thrown
    // network exception (which previously left the spinner stuck forever).
    const { data, error } = await supabase.rpc('purchase_cosmetic', { p_item_id: itemId });
    if (error) throw error;
    const result = data as { already_owned: boolean; new_balance: number };
    // Invalidate the Profile coin snapshot so it reflects the new balance.
    void cacheClear(`profile:${userId}`);
    return { ok: true, alreadyOwned: result.already_owned, newBalance: result.new_balance };
  } catch (e: unknown) {
    return { ok: false, message: errorMessage(e) };
  }
}

export type BundlePurchaseResult =
  | { ok: true; granted: string[]; newBalance: number }
  | { ok: false; message: string };

/** Atomic pack purchase — the server debits once and grants every missing item. */
export async function purchaseBundle(bundleId: string, userId: string): Promise<BundlePurchaseResult> {
  try {
    const { data, error } = await supabase.rpc('purchase_bundle', { p_bundle_id: bundleId });
    if (error) throw error;
    const result = data as { granted: string[]; new_balance: number };
    void cacheClear(`profile:${userId}`);
    return { ok: true, granted: result.granted ?? [], newBalance: result.new_balance };
  } catch (e: unknown) {
    return { ok: false, message: errorMessage(e) };
  }
}

export interface FeaturedCosmetic {
  itemId: string;
  /** Discounted price actually charged by purchase_cosmetic today. */
  price: number;
  basePrice: number;
}

/**
 * Daily featured item (server-picked, 30% off). The server is the source of
 * truth for both the pick and the discounted price, so the banner can never
 * disagree with what purchase_cosmetic charges.
 */
export async function fetchFeaturedCosmetic(): Promise<FeaturedCosmetic | null> {
  try {
    const { data, error } = await supabase.rpc('get_featured_cosmetic');
    if (error) throw error;
    const row = data as { item_id: string; price: number; base_price: number } | null;
    if (!row?.item_id) return null;
    return { itemId: row.item_id, price: row.price, basePrice: row.base_price };
  } catch {
    return null; // the shop simply renders without the banner
  }
}
