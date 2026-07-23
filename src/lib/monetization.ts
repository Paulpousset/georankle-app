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
 * The native SDK is loaded via ./adsSdk (platform-split: adsSdk.web.ts stubs
 * it out so web bundles never touch it), and only after the flag check, so
 * nothing ad-related runs while the flag is off.
 *
 * ── Web (AdSense) — INTEGRATED (2026-07-22) ──────────────────────────────────
 * On web the same rewarded/interstitial entry points route to AdSense ad
 * breaks (./adsWeb, Ad Placement API) instead of AdMob — same flags, same
 * server-side claims, same interstitial gate. Web is ADDITIONALLY gated on the
 * 'web_ads' flag so it goes live only once the AdSense site is approved,
 * independently of mobile. Desktop also gets non-blocking side-rail display
 * units (SideRailAds.web.tsx). Checklist: guide-pubs-web.md.
 *
 * ⚠️ react-native-google-mobile-ads is pinned EXACTLY at 16.3.0: 16.4.0 pulls
 * play-services-ads 25.4.0 whose Kotlin metadata (2.3) can't be read by this
 * Expo SDK's Kotlin 2.1 toolchain — the Android build fails on
 * :react-native-google-mobile-ads:compileReleaseKotlin. Only unpin after the
 * Expo SDK ships Kotlin ≥ 2.2.
 */
import { Platform } from 'react-native';

import { loadAdsSdk, type AdsSdk } from './adsSdk';
import { initWebAds, showWebInterstitial, showWebRewardedAd, webAdsSupported } from './adsWeb';
import { supabase } from './supabase';
import { isFeatureEnabled } from './featureFlags';
import { recordGameAndShouldShow } from './interstitialGate';
import { track } from './analytics';
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

// Interstitial ad-unit ids. ⚠️ Paul must create an INTERSTITIAL unit per platform
// in the AdMob console and paste the ids here; until then we fall back to Google
// TEST ids so the flow is exercisable without serving real (policy-violating) ads.
const INTERSTITIAL_AD_UNIT_IDS: Record<string, string> = {
  android: '',
  ios: '',
};

/** How long to wait for an ad to load before giving up. */
const AD_LOAD_TIMEOUT_MS = 15000;

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
        // The timeout only guards the LOAD phase — the ad itself runs 15-30s,
        // so letting the timer keep running would reject mid-playback and
        // unsubscribe EARNED_REWARD before the user finishes watching.
        clearTimeout(timer);
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

/**
 * Whether the "watch an ad" button may be shown at all. Also kicks off the
 * one-time SDK start as soon as we know ads are enabled — Google's SDK
 * expects `start()` shortly after the native module is touched, not deferred
 * until the user taps "watch"; touching the module without ever starting it
 * trips the SDK's own internal publisher-initialization check and crashes.
 */
export async function rewardedAdsAvailable(): Promise<boolean> {
  if (!(await isFeatureEnabled('rewarded_ads'))) return false;
  if (Platform.OS === 'web') {
    if (!webAdsSupported() || !(await isFeatureEnabled('web_ads'))) return false;
    initWebAds(); // preload ad breaks so the first tap has an ad ready
    return true;
  }
  const sdk = loadAdsSdk();
  if (!sdk) return false;
  initAdsOnce(sdk).catch((e) => log.warn('ads SDK init failed', e));
  return true;
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
 * Play one rewarded ad and resolve to whether the reward was genuinely earned.
 * Shared by every "watch an ad" entry point; returns a typed reason on failure
 * so each caller can claim its own kind of reward afterwards.
 */
export async function watchRewardedAd(): Promise<
  { earned: true } | { earned: false; reason: RewardedAdResult['reason'] }
> {
  if (!(await isFeatureEnabled('rewarded_ads'))) return { earned: false, reason: 'disabled' };
  if (Platform.OS === 'web') {
    if (!webAdsSupported() || !(await isFeatureEnabled('web_ads'))) {
      return { earned: false, reason: 'disabled' };
    }
    const outcome = await showWebRewardedAd();
    if (outcome === 'viewed') return { earned: true };
    return { earned: false, reason: outcome === 'dismissed' ? 'dismissed' : 'failed' };
  }
  const sdk = loadAdsSdk();
  if (!sdk) return { earned: false, reason: 'not_implemented' };
  try {
    await initAdsOnce(sdk);
    const earned = await loadAndShowAd(sdk);
    return earned ? { earned: true } : { earned: false, reason: 'dismissed' };
  } catch (e) {
    log.warn('rewarded ad failed', e);
    return { earned: false, reason: 'failed' };
  }
}

/**
 * Show one AdMob rewarded ad, then claim the flat coins server-side (flag-gated,
 * 5/day cap — see claim_rewarded_ad). Every failure mode resolves to a typed
 * reason so the UI can toast something sensible.
 */
export async function showRewardedAd(): Promise<RewardedAdResult> {
  const res = await watchRewardedAd();
  if (!res.earned) return { granted: false, reason: res.reason };
  return claimRewardedAd();
}

/**
 * Show one rewarded ad, then multiply THIS game's coins server-side.
 * `base` is the session's original award; `stage` is 1 (→ ×2) or 2 (→ ×4).
 * Shares the flat rewarded-ad daily cap. See claim_coin_multiplier.
 */
export async function showCoinMultiplierAd(base: number, stage: 1 | 2): Promise<RewardedAdResult> {
  const res = await watchRewardedAd();
  if (!res.earned) return { granted: false, reason: res.reason };
  return claimCoinMultiplier(base, stage);
}

/** Server claim for a multiplier ad — exported for testability. */
export async function claimCoinMultiplier(base: number, stage: 1 | 2): Promise<RewardedAdResult> {
  const { data, error } = await supabase.rpc('claim_coin_multiplier', {
    p_base: base,
    p_stage: stage,
  });
  if (error) return { granted: false, reason: 'failed' };
  const res = (data ?? {}) as { granted?: boolean; coins?: number; reason?: string };
  return {
    granted: res.granted === true,
    coins: res.coins,
    reason: res.granted ? undefined : (res.reason as RewardedAdResult['reason']) ?? 'failed',
  };
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

// ── Interstitial ads (flag-gated, frequency-capped) ──────────────────────────
// Unlike rewarded ads, interstitials are shown proactively at natural breaks
// (leaving a finished game) and grant nothing — so there's no server claim, just
// the ad. The frequency gate (interstitialGate.ts) protects retention.

/** Load + show one interstitial; resolves when it closes (or fails). */
function loadAndShowInterstitial(sdk: AdsSdk): Promise<void> {
  const configured = INTERSTITIAL_AD_UNIT_IDS[Platform.OS];
  const unitId = configured && configured.length > 0 ? configured : sdk.TestIds.INTERSTITIAL;
  const ad = sdk.InterstitialAd.createForAdRequest(unitId);
  return new Promise<void>((resolve, reject) => {
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
      () => settle(() => reject(new Error('interstitial load timeout'))),
      AD_LOAD_TIMEOUT_MS,
    );
    subs.push(
      ad.addAdEventListener(sdk.AdEventType.LOADED, () => {
        clearTimeout(timer);
        ad.show().catch((e) => settle(() => reject(e)));
      }),
      ad.addAdEventListener(sdk.AdEventType.CLOSED, () => settle(() => resolve())),
      ad.addAdEventListener(sdk.AdEventType.ERROR, (e) => settle(() => reject(e))),
    );
    ad.load();
  });
}

/**
 * Maybe show an interstitial at a natural break. Call this once per finished
 * game — it records the play and decides internally whether to actually show
 * (flag off, or under the per-N-games / daily-cap threshold → no-op). Fire and
 * forget: navigation can proceed behind the ad. Never throws.
 */
export async function maybeShowInterstitial(): Promise<void> {
  if (!(await isFeatureEnabled('interstitial_ads'))) return;
  // Web needs its own flag too — checked BEFORE the gate so an off switch
  // doesn't burn gate credits.
  const web = Platform.OS === 'web';
  if (web && !(webAdsSupported() && (await isFeatureEnabled('web_ads')))) return;
  // Count the game & consult the gate BEFORE touching the SDK.
  if (!(await recordGameAndShouldShow())) return;
  if (web) {
    const shown = await showWebInterstitial();
    track(shown ? 'interstitial_shown' : 'interstitial_failed', {});
    return;
  }
  const sdk = loadAdsSdk();
  if (!sdk) return;
  try {
    await initAdsOnce(sdk);
    await loadAndShowInterstitial(sdk);
    track('interstitial_shown', {});
  } catch (e) {
    log.warn('interstitial failed', e);
    track('interstitial_failed', {});
  }
}
