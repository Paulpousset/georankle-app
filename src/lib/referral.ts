/**
 * Referral / parrainage client — the reward half of the viral loop.
 *
 * A code captured from a deep link is stashed locally until the user has a
 * session, then redeemed server-side (`redeem_referral`), crediting both parent
 * and child. `get_referral_info` returns the caller's own code + how many
 * friends they've brought in. All server logic (idempotency, anti-abuse cap,
 * flag gate) lives in referral.sql — this is a thin, typed wrapper.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { track } from './analytics';
import { log } from './log';
import { referralLink } from './links';

const PENDING_KEY = 'pending_referral_code';

export interface ReferralInfo {
  /** The caller's own shareable code. */
  code: string;
  /** How many friends this user has successfully brought in. */
  count: number;
  /** True once this user has already redeemed someone else's code. */
  alreadyReferred: boolean;
}

export interface RedeemResult {
  granted: boolean;
  coins?: number;
  reason?: string;
}

/** Persist a code captured from a deep link until the user is logged in. */
export async function storePendingReferral(code: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_KEY, code);
  } catch {
    /* best-effort */
  }
}

async function getPendingReferral(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

async function clearPendingReferral(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch {
    /* best-effort */
  }
}

/** The caller's own referral info (code + count). Null if logged out / on error. */
export async function getReferralInfo(): Promise<ReferralInfo | null> {
  const { data, error } = await supabase.rpc('get_referral_info');
  if (error) {
    log.warn('referral.info', error);
    return null;
  }
  const r = (data ?? {}) as { code?: string; count?: number; already_referred?: boolean };
  if (!r.code) return null;
  return { code: r.code, count: r.count ?? 0, alreadyReferred: r.already_referred === true };
}

/** Full share URL for a given code. */
export function myReferralLink(code: string): string {
  return referralLink(code);
}

/** Redeem a friend's code (once). Safe to call logged out — the RPC no-ops. */
export async function redeemReferral(code: string): Promise<RedeemResult> {
  const { data, error } = await supabase.rpc('redeem_referral', { p_code: code });
  if (error) {
    log.warn('referral.redeem', error);
    return { granted: false, reason: 'failed' };
  }
  const r = (data ?? {}) as { granted?: boolean; coins?: number; reason?: string };
  return { granted: r.granted === true, coins: r.coins, reason: r.reason };
}

/**
 * If a referral code was captured before login, redeem it now that a session
 * exists. Clears the pending code on success or on any terminal reason (so we
 * don't retry a bad/duplicate code forever); a transient 'failed' is kept for a
 * later retry. Returns null when there was nothing pending.
 */
export async function redeemPendingReferral(): Promise<RedeemResult | null> {
  const code = await getPendingReferral();
  if (!code) return null;
  const res = await redeemReferral(code);
  if (res.granted || (res.reason && res.reason !== 'failed')) {
    await clearPendingReferral();
  }
  if (res.granted) track('referral_redeemed', { coins: res.coins });
  return res;
}
