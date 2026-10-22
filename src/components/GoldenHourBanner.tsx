/**
 * GoldenHourBanner — main-menu card for the golden hour (pubs ×3, plafond
 * relevé). During a slot it carries the rewarded-ad button itself, so one tap
 * starts the ad; in the 24 h before a slot it shrinks to a one-line teaser.
 *
 * Self-gating like RewardedAdButton: nothing while rewarded ads are off or
 * unavailable on this device, nor for signed-out players (claims need an
 * account).
 */
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';

import { formatClock, formatCountdown, useGoldenHour } from '../lib/goldenHour';
import { rewardedAdsAvailable } from '../lib/monetization';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { tr } from '../i18n';
import { RewardedAdButton } from './RewardedAdButton';

const GOLD = '#f5b301';
const TEASER_WINDOW_MS = 24 * 60 * 60 * 1000;

interface GoldenHourBannerProps {
  maxWidth: number;
}

export function GoldenHourBanner({ maxWidth }: GoldenHourBannerProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const golden = useGoldenHour();
  const [adsOk, setAdsOk] = useState(false);
  // Mount time is precise enough for "in 3 h": the menu remounts often.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    rewardedAdsAvailable()
      .then((ok) => {
        if (alive) setAdsOk(ok);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!adsOk) return null;

  if (golden.active && golden.endsAt) {
    return (
      <View
        style={{
          width: '100%',
          maxWidth,
          marginBottom: 18,
          borderRadius: 18,
          borderWidth: 2,
          borderColor: GOLD,
          backgroundColor: c.surface,
          padding: 14,
          gap: 12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: GOLD,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles color="#2c1810" size={20} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.headingBlack, fontSize: 16, color: c.text }}>
              {tr(language, 'Heure dorée', 'Golden hour')}
            </Text>
            <Text style={{ fontFamily: FONTS.mono, fontSize: 11.5, color: c.textMuted, marginTop: 2, lineHeight: 16 }}>
              {tr(
                language,
                'Chaque pub rapporte {0} fois plus de pièces, jusqu’à {1}.',
                'Every ad pays {0} times the coins, until {1}.',
                [golden.multiplier, formatClock(golden.endsAt)],
              )}
            </Text>
          </View>
        </View>
        <RewardedAdButton context="golden_hour" />
      </View>
    );
  }

  const next = golden.nextStartsAt;
  if (!next || next.getTime() - now > TEASER_WINDOW_MS) return null;

  return (
    <View
      style={{
        width: '100%',
        maxWidth,
        marginBottom: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <Sparkles color={GOLD} size={14} />
      <Text style={{ fontFamily: FONTS.mono, fontSize: 11.5, color: c.textMuted }}>
        {tr(language, 'Heure dorée dans {0} : pubs ×{1}', 'Golden hour in {0}: ads ×{1}', [
          formatCountdown(next, now),
          golden.nextMultiplier ?? 3,
        ])}
      </Text>
    </View>
  );
}
