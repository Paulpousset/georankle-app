/**
 * Desktop-only AdSense side rails — the non-blocking web ads. Two standard
 * skyscraper units fixed in the empty gutters beside the centered (≤600px)
 * game content; railSize() guarantees they only render when the viewport
 * spares the space, so they never cover content and vanish on phone widths
 * (phones/tablets keep the rewarded/interstitial flows only).
 *
 * Self-gating like RewardedAdButton: renders nothing while the 'web_ads' flag
 * is off, and a rail whose slot id isn't configured yet is simply skipped —
 * shipping this before the AdSense console work is done is safe.
 */
import { useEffect, useState } from 'react';

import {
  WEB_AD_CLIENT,
  WEB_SIDE_RAIL_SLOTS,
  ensureAdsScript,
  railSize,
  webAdsSupported,
  type RailSize,
} from '../lib/adsWeb';
import { isFeatureEnabled } from '../lib/featureFlags';

function RailUnit({ slot, size, side }: { slot: string; size: RailSize; side: 'left' | 'right' }) {
  useEffect(() => {
    ensureAdsScript();
    try {
      const w = window as unknown as { adsbygoogle?: Array<Record<string, unknown>> };
      (w.adsbygoogle = w.adsbygoogle || []).push({});
    } catch {
      /* adblocker / script failure — the empty <ins> is invisible anyway */
    }
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        transform: 'translateY(-50%)',
        [side]: 16,
        width: size.width,
        height: size.height,
        overflow: 'hidden',
        // Behind the app's own overlays (toasts, modals, OfflineBanner).
        zIndex: 0,
      }}
    >
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: size.width, height: size.height }}
        data-ad-client={WEB_AD_CLIENT}
        data-ad-slot={slot}
      />
    </div>
  );
}

export function SideRailAds() {
  const [enabled, setEnabled] = useState(false);
  const [dims, setDims] = useState(() =>
    typeof window === 'undefined' ? { w: 0, h: 0 } : { w: window.innerWidth, h: window.innerHeight },
  );

  useEffect(() => {
    if (!webAdsSupported()) return;
    let alive = true;
    isFeatureEnabled('web_ads')
      .then((on) => {
        if (alive) setEnabled(on);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const size = railSize(dims.w, dims.h);
  if (!enabled || !size) return null;

  return (
    <>
      {/* key remounts the <ins> when the size bucket changes — AdSense fills a
          given <ins> exactly once, so a resize needs a fresh element. */}
      {WEB_SIDE_RAIL_SLOTS.left ? (
        <RailUnit key={`l${size.width}`} slot={WEB_SIDE_RAIL_SLOTS.left} size={size} side="left" />
      ) : null}
      {WEB_SIDE_RAIL_SLOTS.right ? (
        <RailUnit key={`r${size.width}`} slot={WEB_SIDE_RAIL_SLOTS.right} size={size} side="right" />
      ) : null}
    </>
  );
}
