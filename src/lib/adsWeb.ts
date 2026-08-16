/**
 * Web ads (Google AdSense) — the web twin of the native AdMob integration in
 * monetization.ts, plus the desktop side-rail display units.
 *
 * Two surfaces share the same adsbygoogle script and publisher account:
 *  - Ad Placement API ("H5 Games Ads"): rewarded + interstitial ad breaks,
 *    called from monetization.ts behind the same feature flags and the same
 *    server-side claims as native. Nothing full-screen ever pops on its own —
 *    rewarded is user-initiated, interstitials go through interstitialGate.
 *  - Display units: the desktop side rails (SideRailAds.web.tsx), non-blocking
 *    by design — they live in the empty gutters beside the centered content
 *    and disappear the moment the viewport is too narrow to spare the space.
 *
 * Everything web is ADDITIONALLY gated on the 'web_ads' feature flag: AdSense
 * site approval (playgeog.com) is a separate process from the AdMob app
 * paperwork, so web must be switchable independently of mobile. Go-live
 * checklist for Paul: see guide-pubs-web.md.
 *
 * This module is import-safe everywhere (native bundles + jest): it touches
 * window/document only inside functions, after a Platform check.
 */
import { Platform } from 'react-native';

import { STAGE_MAX_WIDTH } from './stage';

/**
 * Google publisher id — same publisher as the AdMob account
 * (pub-2429865520138981); AdMob sign-up provisions the matching AdSense
 * account. Verify in AdSense → Account → Settings if ads don't serve.
 */
export const WEB_AD_CLIENT = 'ca-pub-2429865520138981';

/**
 * Display slot ids for the desktop side rails. ⚠️ Paul: create two Display
 * units in the AdSense console (see guide-pubs-web.md) and paste their
 * data-ad-slot ids here — a rail with an empty slot id is simply not rendered.
 */
export const WEB_SIDE_RAIL_SLOTS = { left: '2383979543', right: '7231760353' };

/**
 * Force the Ad Placement API's test mode outside __DEV__ (fake ads, no
 * policy risk) — useful to verify a Vercel preview before AdSense approval.
 */
const FORCE_ADBREAK_TEST = false;

/** How long to wait for an ad break to produce an ad before giving up —
 * guards the no-fill / adblocker / script-never-loaded cases only. */
const BREAK_READY_TIMEOUT_MS = 15000;

/** Whether this runtime can serve web ads at all (before any flag check). */
export function webAdsSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    WEB_AD_CLIENT.length > 0
  );
}

/** The adsbygoogle command queue (works before the script loads). */
function queue(): Array<Record<string, unknown>> {
  const w = window as unknown as { adsbygoogle?: Array<Record<string, unknown>> };
  w.adsbygoogle = w.adsbygoogle || [];
  return w.adsbygoogle;
}

let scriptInjected = false;

/** Inject the adsbygoogle script once (idempotent, no-op off web). */
export function ensureAdsScript(): void {
  if (!webAdsSupported() || scriptInjected) return;
  scriptInjected = true;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${WEB_AD_CLIENT}`;
  s.setAttribute('data-ad-client', WEB_AD_CLIENT);
  // Floor between two ad breaks, enforced Google-side on top of our own
  // interstitialGate (which stays the real frequency policy).
  s.setAttribute('data-ad-frequency-hint', '60s');
  if (__DEV__ || FORCE_ADBREAK_TEST) s.setAttribute('data-adbreak-test', 'on');
  document.head.appendChild(s);
}

let configured = false;

/** One-time web ads start: script + preload ad breaks (the adConfig call). */
export function initWebAds(): void {
  if (!webAdsSupported()) return;
  ensureAdsScript();
  if (configured) return;
  configured = true;
  try {
    queue().push({ preloadAdBreaks: 'on', sound: 'on' });
  } catch {
    configured = false;
  }
}

export type WebAdOutcome = 'viewed' | 'dismissed' | 'unavailable';

/**
 * Show one rewarded ad break; resolves to whether the reward was genuinely
 * earned ('viewed'), the user bailed ('dismissed'), or no ad could be shown
 * ('unavailable'). Never rejects.
 */
export function showWebRewardedAd(): Promise<WebAdOutcome> {
  if (!webAdsSupported()) return Promise.resolve('unavailable');
  initWebAds();
  return new Promise<WebAdOutcome>((resolve) => {
    let settled = false;
    let shown = false;
    const settle = (o: WebAdOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(o);
    };
    // Only guards the "does an ad exist" phase — once beforeReward fires the
    // ad is on screen and may run far longer than the timeout.
    const timer = setTimeout(() => settle('unavailable'), BREAK_READY_TIMEOUT_MS);
    try {
      queue().push({
        type: 'reward',
        name: 'coin_reward',
        beforeReward: (showAdFn: () => void) => {
          shown = true;
          clearTimeout(timer);
          showAdFn();
        },
        adViewed: () => settle('viewed'),
        adDismissed: () => settle('dismissed'),
        // Fires for every placement, shown or not — resolves the no-ad path.
        adBreakDone: (info?: { breakStatus?: string }) => {
          if (!shown) settle('unavailable');
          else settle(info?.breakStatus === 'viewed' ? 'viewed' : 'dismissed');
        },
      });
    } catch {
      settle('unavailable');
    }
  });
}

/**
 * Show one interstitial ad break at a natural pause; resolves to whether an ad
 * was actually displayed. Never rejects.
 */
export function showWebInterstitial(): Promise<boolean> {
  if (!webAdsSupported()) return Promise.resolve(false);
  initWebAds();
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let shown = false;
    const settle = (v: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => settle(false), BREAK_READY_TIMEOUT_MS);
    try {
      queue().push({
        type: 'browse',
        name: 'game_over',
        beforeAd: () => {
          shown = true;
          clearTimeout(timer);
        },
        adBreakDone: () => settle(shown),
      });
    } catch {
      settle(false);
    }
  });
}

export interface RailSize {
  width: 160 | 300;
  height: 600;
}

/** Marge minimale entre un rail et la colonne de jeu (et le bord de fenêtre). */
const RAIL_MARGIN = 30;

/**
 * Which standard AdSense skyscraper fits the current viewport, or null when
 * the rails must be hidden. Pure — unit-tested.
 *
 * La géométrie : DesktopStage borne le jeu à STAGE_MAX_WIDTH, centré. Chaque
 * gouttière vaut donc (largeur − STAGE_MAX_WIDTH) / 2, et un rail ne s'affiche
 * que s'il y tient avec RAIL_MARGIN de chaque côté — il ne peut donc jamais
 * chevaucher le jeu.
 *
 * ⚠️ Avant le 16/08/2026 ce calcul supposait un contenu centré à 600px alors
 * que le jeu occupait toute la largeur : les rails étaient rendus mais
 * intégralement recouverts, donc jamais vus. Ne pas revenir en arrière sans
 * vérifier que DesktopStage est bien monté.
 */
export function railSize(windowWidth: number, windowHeight: number): RailSize | null {
  if (windowHeight < 660) return null; // 600px unit + margins doesn't fit
  const gutter = (windowWidth - STAGE_MAX_WIDTH) / 2;
  if (gutter >= 300 + RAIL_MARGIN * 2) return { width: 300, height: 600 }; // half-page
  if (gutter >= 160 + RAIL_MARGIN * 2) return { width: 160, height: 600 }; // wide skyscraper
  return null;
}

/**
 * Distance entre le bord de la fenêtre et le rail : le rail est centré dans sa
 * gouttière, ce qui l'écarte autant du jeu que du bord de l'écran.
 */
export function railOffset(windowWidth: number, size: RailSize): number {
  const gutter = (windowWidth - STAGE_MAX_WIDTH) / 2;
  return Math.max(RAIL_MARGIN, Math.round((gutter - size.width) / 2));
}
