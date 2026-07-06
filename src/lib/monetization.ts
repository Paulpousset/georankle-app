/**
 * Monetization scaffolding — DISABLED AND INVISIBLE by design (decision
 * 2026-07-02): the store paperwork (Play Console / App Store / RevenueCat /
 * AdMob accounts, privacy updates) is not done, so nothing here may surface in
 * the UI while the feature flags are off.
 *
 * This module is the SINGLE integration point for the real SDKs later:
 *
 * ── Coin packs (IAP) ─────────────────────────────────────────────────────────
 * 1. `npx expo install react-native-purchases` and configure RevenueCat with
 *    the product ids below.
 * 2. In `purchaseCoinPack`, replace the stub with Purchases.purchaseProduct().
 * 3. Point the RevenueCat webhook at the `revenuecat-webhook` edge function —
 *    coins are credited SERVER-SIDE via grant_iap_coins (idempotent per store
 *    transaction), never by the client.
 * 4. Flip the 'iap' feature flag.
 *
 * ── Rewarded ads — INTEGRATED (2026-07-05), running on Google TEST ids ───────
 * The SDK flow below is complete; remaining steps to go live:
 * 1. Replace REWARDED_AD_UNIT_IDS below AND the app ids in app.json with the
 *    real AdMob ids (account paperwork — see the ads plan).
 * 2. (Hardening, later) wire AdMob SSV so a claim requires a real impression.
 * 3. Flip the 'rewarded_ads' feature flag.
 *
 * The native SDK is require()d lazily so jest/web bundles never touch it, and
 * only after the flag check, so nothing ad-related runs while the flag is off.
 *
 * ⚠️ react-native-google-mobile-ads is pinned EXACTLY at 16.3.0: 16.4.0 pulls
 * play-services-ads 25.4.0 whose Kotlin metadata (2.3) can't be read by this
 * Expo SDK's Kotlin 2.1 toolchain — the Android build fails on
 * :react-native-google-mobile-ads:compileReleaseKotlin. Only unpin after the
 * Expo SDK ships Kotlin ≥ 2.2.
 */
import { Platform } from 'react-native';

import { supabase } from './supabase';
import { isFeatureEnabled } from './featureFlags';
import { log } from './log';

/** Store product ids ↔ coins (must mirror grant_iap_coins in SQL). */
export const COIN_PACKS = [
  { productId: 'coins_300', coins: 300 },
  { productId: 'coins_800', coins: 800 },
  { productId: 'coins_2000', coins: 2000 },
] as const;

export interface PurchaseResult {
  ok: boolean;
  reason?: 'disabled' | 'not_implemented' | 'failed';
}

/** Whether the coin-pack shop section may be shown at all. */
export async function iapAvailable(): Promise<boolean> {
  // Flag first; when the SDK lands, also require Purchases.isConfigured().
  return await isFeatureEnabled('iap');
}

/** Stub — becomes RevenueCat's purchase flow once the SDK is integrated. */
export async function purchaseCoinPack(_productId: string): Promise<PurchaseResult> {
  if (!(await isFeatureEnabled('iap'))) return { ok: false, reason: 'disabled' };
  // The flag is only flipped after the SDK integration, so this is unreachable
  // in production; kept explicit for the integration checklist above.
  return { ok: false, reason: 'not_implemented' };
}

export interface RewardedAdResult {
  granted: boolean;
  coins?: number;
  reason?: 'disabled' | 'capped' | 'not_implemented' | 'dismissed' | 'failed';
}

/** Must mirror claim_rewarded_ad in seasons_monetization.sql. */
export const REWARDED_DAILY_CAP = 5;
export const REWARDED_COINS = 5;

// Real AdMob rewarded ad-unit ids (2026-07-06) — the app ids live in app.json.
const REWARDED_AD_UNIT_IDS: Record<string, string> = {
  android: 'ca-app-pub-2429865520138981/3361572181',
  ios: 'ca-app-pub-2429865520138981/2431633897',
};

/** How long to wait for an ad to load before giving up. */
const AD_LOAD_TIMEOUT_MS = 15000;

type AdsSdk = typeof import('react-native-google-mobile-ads');

/** The native SDK, or null on web/jest/Expo Go where it isn't linked. */
function loadAdsSdk(): AdsSdk | null {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-google-mobile-ads') as AdsSdk;
  } catch {
    return null;
  }
}

let initPromise: Promise<void> | null = null;

/**
 * One-time SDK start: ATT prompt (iOS), UMP consent form (shows only once the
 * GDPR message is published in the AdMob console — a no-op until then), then
 * SDK init. Reset on failure so a later tap can retry.
 */
function initAdsOnce(sdk: AdsSdk): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      if (Platform.OS === 'ios') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const att = require('expo-tracking-transparency');
          await att.requestTrackingPermissionsAsync();
        } catch (e) {
          log.warn('ATT prompt failed', e);
        }
      }
      try {
        await sdk.AdsConsent.gatherConsent();
      } catch (e) {
        // No consent message configured yet, or the user is outside the EEA —
        // ads still serve (non-personalized where consent is missing).
        log.warn('UMP consent gathering failed', e);
      }
      await sdk.MobileAds().initialize();
    })();
    initPromise.catch(() => {
      initPromise = null;
    });
  }
  return initPromise;
}

/** Load + show one rewarded ad; resolves to whether the reward was earned. */
function loadAndShowAd(sdk: AdsSdk): Promise<boolean> {
  const unitId = REWARDED_AD_UNIT_IDS[Platform.OS] ?? sdk.TestIds.REWARDED;
  const ad = sdk.RewardedAd.createForAdRequest(unitId);
  return new Promise<boolean>((resolve, reject) => {
    let earned = false;
    let settled = false;
    const subs: Array<() => void> = [];
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subs.forEach((off) => off());
      fn();
    };
    const timer = setTimeout(
      () => settle(() => reject(new Error('rewarded ad load timeout'))),
      AD_LOAD_TIMEOUT_MS,
    );
    subs.push(
      ad.addAdEventListener(sdk.RewardedAdEventType.LOADED, () => {
        ad.show().catch((e) => settle(() => reject(e)));
      }),
      ad.addAdEventListener(sdk.RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      }),
      ad.addAdEventListener(sdk.AdEventType.CLOSED, () => settle(() => resolve(earned))),
      ad.addAdEventListener(sdk.AdEventType.ERROR, (e) => settle(() => reject(e))),
    );
    ad.load();
  });
}

/** Whether the "watch an ad" button may be shown at all. */
export async function rewardedAdsAvailable(): Promise<boolean> {
  if (!(await isFeatureEnabled('rewarded_ads'))) return false;
  return loadAdsSdk() !== null;
}

/**
 * Ad claims left today for the signed-in user (server cap: 5/day, UTC), or
 * null when it can't be read — callers should then just show the button.
 */
export async function getRewardedAdsRemaining(): Promise<number | null> {
  try {
    const today = new Date().toISOString().slice(0, 10); // UTC, matches the SQL cap window
    const { data, error } = await supabase
      .from('ad_claims')
      .select('count')
      .eq('day', today)
      .maybeSingle();
    if (error) return null;
    return Math.max(0, REWARDED_DAILY_CAP - (data?.count ?? 0));
  } catch {
    return null;
  }
}

/**
 * Show one AdMob rewarded ad, then claim the coins server-side (flag-gated,
 * 5/day cap — see claim_rewarded_ad). Every failure mode resolves to a typed
 * reason so the UI can toast something sensible.
 */
export async function showRewardedAd(): Promise<RewardedAdResult> {
  if (!(await isFeatureEnabled('rewarded_ads'))) return { granted: false, reason: 'disabled' };
  const sdk = loadAdsSdk();
  if (!sdk) return { granted: false, reason: 'not_implemented' };
  let earned = false;
  try {
    await initAdsOnce(sdk);
    earned = await loadAndShowAd(sdk);
  } catch (e) {
    log.warn('rewarded ad failed', e);
    return { granted: false, reason: 'failed' };
  }
  if (!earned) return { granted: false, reason: 'dismissed' };
  return claimRewardedAd();
}

/**
 * Server claim after a genuinely watched ad — called by the future SDK flow,
 * exported now so the whole path is testable end-to-end.
 */
export async function claimRewardedAd(): Promise<RewardedAdResult> {
  const { data, error } = await supabase.rpc('claim_rewarded_ad');
  if (error) return { granted: false, reason: 'failed' };
  const res = (data ?? {}) as { granted?: boolean; coins?: number; reason?: string };
  return {
    granted: res.granted === true,
    coins: res.coins,
    reason: res.granted ? undefined : (res.reason as RewardedAdResult['reason']) ?? 'failed',
  };
}
