/**
 * Anchored AdMob banner for the bottom of calm screens (menu, results) —
 * never inside a game. Renders nothing until `bannerAdConfig()` says the
 * `banner_ads` flag is on and the SDK is ready (so web, jest, Expo Go and a
 * flag-off build all render null), and collapses again if the ad fails to load.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { bannerAdConfig } from '../lib/monetization';

type Config = NonNullable<Awaited<ReturnType<typeof bannerAdConfig>>>;

export function AdBanner() {
  const [config, setConfig] = useState<Config | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    bannerAdConfig()
      .then((c) => {
        if (alive) setConfig(c);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!config || failed) return null;
  const { BannerAd, BannerAdSize } = config.sdk;
  return (
    <View style={{ alignItems: 'center' }}>
      <BannerAd
        unitId={config.unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}
