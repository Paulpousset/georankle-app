/**
 * RewardedAdButton — the single "watch an ad → +5 coins" entry point, reused in
 * the Shop, the daily quests card and the solo end-of-game summary.
 *
 * Fully self-gating: renders nothing while the 'rewarded_ads' feature flag is
 * off (fail closed), when the native SDK isn't available, or once the server's
 * daily cap is spent — so shipping it visible-nowhere is safe today.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Play } from 'lucide-react-native';

import {
  REWARDED_COINS,
  REWARDED_DAILY_CAP,
  getRewardedAdsRemaining,
  rewardedAdsAvailable,
  showRewardedAd,
} from '../lib/monetization';
import { track } from '../lib/analytics';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { tr } from '../i18n';
import { a11yButton, announce } from '../lib/a11y';
import { useToast } from './ToastProvider';
import { ScoreText } from './ScoreText';

interface RewardedAdButtonProps {
  /** Where the button lives — analytics dimension only. */
  context: 'shop' | 'quests' | 'solo_summary';
  /** Called with the coins granted after a successful claim (e.g. refresh a balance). */
  onEarned?: (coins: number) => void;
}

export function RewardedAdButton({ context, onEarned }: RewardedAdButtonProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const toast = useToast();
  const c = getColors(isDarkMode);

  const [visible, setVisible] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const ok = await rewardedAdsAvailable();
    if (!ok) {
      setVisible(false);
      return;
    }
    const left = await getRewardedAdsRemaining();
    setRemaining(left);
    setVisible(left === null || left > 0);
  }, []);

  useEffect(() => {
    let alive = true;
    refresh().catch(() => {
      if (alive) setVisible(false);
    });
    return () => {
      alive = false;
    };
  }, [refresh]);

  const onPress = async () => {
    if (busy) return;
    setBusy(true);
    track('rewarded_ad_requested', { context });
    try {
      const result = await showRewardedAd();
      if (result.granted) {
        const coins = result.coins ?? REWARDED_COINS;
        toast.success(tr(language, `+${coins} pièces !`, `+${coins} coins!`));
        announce(tr(language, `${coins} pièces gagnées`, `${coins} coins earned`));
        track('rewarded_ad_earned', { context, coins });
        onEarned?.(coins);
      } else if (result.reason === 'capped') {
        toast.info(tr(language, 'Plafond quotidien atteint — reviens demain !', 'Daily cap reached — come back tomorrow!'));
      } else if (result.reason === 'dismissed') {
        toast.info(tr(language, 'Pub interrompue — pas de récompense.', 'Ad skipped — no reward.'));
      } else if (result.reason !== 'disabled') {
        toast.error(tr(language, 'Pub indisponible — réessaie plus tard.', 'Ad unavailable — try again later.'));
        track('rewarded_ad_failed', { context, reason: result.reason ?? 'failed' });
      }
    } finally {
      setBusy(false);
      refresh().catch(() => {});
    }
  };

  if (!visible) return null;

  const counter = remaining !== null ? ` (${remaining}/${REWARDED_DAILY_CAP})` : '';
  const label = tr(
    language,
    `Regarder une pub : ${REWARDED_COINS} pièces${counter}`,
    `Watch an ad: ${REWARDED_COINS} coins${counter}`,
  );

  const GOLD = '#f5b301';
  const INK = '#2c1810';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.85}
      {...a11yButton(label, { disabled: busy })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: c.surface,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: GOLD,
        paddingVertical: 8,
        paddingHorizontal: 10,
        opacity: busy ? 0.6 : 1,
      }}
    >
      {/* Gold play medallion */}
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: GOLD,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={INK} />
        ) : (
          <Play color={INK} size={15} fill={INK} />
        )}
      </View>
      <Text style={{ flex: 1, fontFamily: FONTS.heading, color: c.text, fontSize: 14 }}>
        {tr(language, 'Regarder une pub', 'Watch an ad')}
      </Text>
      {remaining !== null && (
        <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 11 }}>
          {remaining}/{REWARDED_DAILY_CAP}
        </Text>
      )}
      {/* Gold reward chip */}
      <View style={{ backgroundColor: GOLD, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 }}>
        <ScoreText style={{ color: INK, fontFamily: FONTS.monoBold, fontSize: 14 }}>
          +{REWARDED_COINS}
        </ScoreText>
      </View>
    </TouchableOpacity>
  );
}
