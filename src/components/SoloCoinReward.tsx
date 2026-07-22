/**
 * SoloCoinReward — end-of-game coin reveal for solo modes.
 *
 * Renders the coins earned this session with a count-up animation, then (while
 * the 'rewarded_ads' flag is on and the daily cap has room) offers a "double
 * your coins" ladder: one ad → ×2, a second ad → ×4. Each grant re-animates the
 * total up to its new value. The flat "watch an ad: +N coins" button is kept
 * below, per the 2026-07-20 product decision to offer both.
 *
 * Shared by every solo summary (Classic, Streak, Borders, HigherLower,
 * Silhouette) so the animation + doubler live in one place. Self-gating: with
 * ads unavailable it degrades to just the animated coin card.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Text, TouchableOpacity, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Coins, Play } from 'lucide-react-native';

import { getRewardedAdsRemaining, rewardedAdsAvailable, showCoinMultiplierAd } from '../lib/monetization';
import { track } from '../lib/analytics';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { tr } from '../i18n';
import { a11yButton, announce } from '../lib/a11y';
import { useToast } from './ToastProvider';
import { ScoreText } from './ScoreText';
import { RewardedAdButton } from './RewardedAdButton';

// A rich, saturated gold that reads as a *filled* element on both the cream
// parchment (light) and the navy chart (dark) backgrounds.
const GOLD = '#f5b301';
const GOLD_DEEP = '#8a5a00'; // coin number on light bg — parchment gold is too faint
const INK = '#2c1810'; // sepia ink: text/icons that sit ON gold
const RED = '#c0392b';

/** Soft drop shadow shared by the card and the primary button. */
const SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.16,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
} as const;

/** Multiplier the total reaches after each successfully-watched ad. */
const LADDER = [2, 4] as const; // stage 1 → ×2, stage 2 → ×4

interface SoloCoinRewardProps {
  /** Coins the server credited for this session (null = award still pending / hidden). */
  coinsEarned: number | null;
  /** Daily solo cap was already hit (no base coins this run). */
  coinsCapped?: boolean;
  /** Award couldn't be confirmed and was queued for retry. */
  coinsSyncFailed?: boolean;
  /** Outer container style (margins differ per screen). */
  containerStyle?: StyleProp<ViewStyle>;
}

export function SoloCoinReward({
  coinsEarned,
  coinsCapped = false,
  coinsSyncFailed = false,
  containerStyle,
}: SoloCoinRewardProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const toast = useToast();
  const c = getColors(isDarkMode);

  const base = coinsEarned && coinsEarned > 0 ? coinsEarned : 0;

  // How many multiplier ads have been watched (0 → ×1, 1 → ×2, 2 → ×4).
  const [stage, setStage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [adsOk, setAdsOk] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  // Animated count-up: `anim` drives the displayed integer via a listener.
  const [anim] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(1));
  const [display, setDisplay] = useState(0);
  const target = base * (stage === 0 ? 1 : LADDER[stage - 1]);

  useEffect(() => {
    const id = anim.addListener(({ value }) => setDisplay(Math.round(value)));
    return () => anim.removeListener(id);
  }, [anim]);

  // Animate up to the current target whenever it changes (initial reveal + each grant).
  useEffect(() => {
    if (target <= 0) return;
    Animated.timing(anim, {
      toValue: target,
      duration: 750,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    Animated.sequence([
      Animated.timing(pop, { toValue: 1.25, duration: 180, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  }, [target, anim, pop]);

  const refreshAds = useCallback(async () => {
    const ok = await rewardedAdsAvailable();
    if (!ok) {
      setAdsOk(false);
      return;
    }
    setAdsOk(true);
    setRemaining(await getRewardedAdsRemaining());
  }, []);

  useEffect(() => {
    let alive = true;
    refreshAds().catch(() => {
      if (alive) setAdsOk(false);
    });
    return () => {
      alive = false;
    };
  }, [refreshAds]);

  const nextMult = stage < LADDER.length ? LADDER[stage] : null;

  const onDouble = async () => {
    if (busy || nextMult === null) return;
    const claimStage = (stage + 1) as 1 | 2;
    setBusy(true);
    track('coin_multiplier_requested', { stage: claimStage, base });
    try {
      const result = await showCoinMultiplierAd(base, claimStage);
      if (result.granted) {
        const gained = result.coins ?? 0;
        setStage(claimStage);
        toast.success(tr(language, `Pièces ×${nextMult} ! +${gained}`, `Coins ×${nextMult}! +${gained}`));
        announce(tr(language, `Pièces multipliées par ${nextMult}`, `Coins multiplied by ${nextMult}`));
        track('coin_multiplier_earned', { stage: claimStage, coins: gained, mult: nextMult });
      } else if (result.reason === 'capped') {
        toast.info(tr(language, 'Plafond quotidien de pubs atteint — reviens demain !', 'Daily ad cap reached — come back tomorrow!'));
        setAdsOk(false);
      } else if (result.reason === 'dismissed') {
        toast.info(tr(language, 'Pub interrompue — pas de bonus.', 'Ad skipped — no bonus.'));
      } else if (result.reason !== 'disabled') {
        toast.error(tr(language, 'Pub indisponible — réessaie plus tard.', 'Ad unavailable — try again later.'));
        track('coin_multiplier_failed', { stage: claimStage, reason: result.reason ?? 'failed' });
      }
    } finally {
      setBusy(false);
      refreshAds().catch(() => {});
    }
  };

  if (coinsEarned == null) return null;

  const showDoubler = base > 0 && adsOk && nextMult !== null && (remaining === null || remaining > 0);

  const coinNumberColor = isDarkMode ? '#ffdd33' : GOLD_DEEP;

  return (
    <View style={containerStyle}>
      {/* Animated coin card */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          alignSelf: 'stretch',
          justifyContent: base > 0 ? 'flex-start' : 'center',
          backgroundColor: c.card,
          borderRadius: 18,
          borderWidth: 1.5,
          borderColor: base > 0 ? GOLD : coinsSyncFailed ? RED : c.border,
          paddingVertical: 14,
          paddingHorizontal: 16,
          ...(base > 0 ? SHADOW : null),
        }}
      >
        {/* Filled gold medallion — pops on both parchment and navy. */}
        <Animated.View
          style={{
            transform: [{ scale: pop }],
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: base > 0 ? GOLD : c.surface,
            alignItems: 'center',
            justifyContent: 'center',
            ...(base > 0 ? SHADOW : null),
          }}
        >
          <Coins color={base > 0 ? INK : c.textMuted} size={24} />
        </Animated.View>
        {base > 0 ? (
          <View style={{ flex: 1 }}>
            <Animated.View
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                gap: 6,
                transform: [{ scale: pop }],
              }}
            >
              <ScoreText style={{ color: coinNumberColor, fontSize: 30, fontFamily: FONTS.headingBlack }}>
                {`+${display}`}
              </ScoreText>
              {stage > 0 && (
                <View style={{ backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 1 }}>
                  <Text style={{ color: INK, fontSize: 12, fontFamily: FONTS.monoBold }}>{`×${LADDER[stage - 1]}`}</Text>
                </View>
              )}
            </Animated.View>
            <Text style={{ color: c.textMuted, fontSize: 12, fontFamily: FONTS.mono, marginTop: 1 }}>
              {tr(language, 'pièces gagnées', 'coins earned')}
            </Text>
          </View>
        ) : coinsSyncFailed ? (
          <Text style={{ color: RED, fontSize: 13, fontFamily: FONTS.mono, textAlign: 'center' }}>
            {tr(language, 'Pièces non synchronisées — réessai à la reconnexion', 'Coins not synced — will retry on reconnect')}
          </Text>
        ) : (
          <Text style={{ color: c.textMuted, fontSize: 13, fontFamily: FONTS.mono, textAlign: 'center' }}>
            {coinsCapped
              ? tr(language, 'Plafond quotidien atteint', 'Daily coin cap reached')
              : tr(language, 'Aucune pièce cette fois', 'No coins this time')}
          </Text>
        )}
      </View>

      {/* Doubler ladder (hidden without a base award or while ads are unavailable). */}
      {showDoubler && (
        <TouchableOpacity
          onPress={onDouble}
          disabled={busy}
          activeOpacity={0.85}
          {...a11yButton(
            tr(language, `Regarder une pub pour multiplier tes pièces par ${nextMult}`, `Watch an ad to multiply your coins by ${nextMult}`),
            { disabled: busy },
          )}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            marginTop: 10,
            backgroundColor: GOLD,
            borderRadius: 16,
            paddingVertical: 12,
            paddingHorizontal: 12,
            opacity: busy ? 0.6 : 1,
            ...SHADOW,
          }}
        >
          {/* Dark play medallion */}
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: INK,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {busy ? (
              <ActivityIndicator size="small" color={GOLD} />
            ) : (
              <Play color={GOLD} size={16} fill={GOLD} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.headingBlack, color: INK, fontSize: 15 }}>
              {stage === 0
                ? tr(language, 'Doubler mes pièces', 'Double my coins')
                : tr(language, 'Encore plus de pièces', 'Even more coins')}
            </Text>
            <Text style={{ fontFamily: FONTS.mono, color: 'rgba(44,24,16,0.7)', fontSize: 11, marginTop: 1 }}>
              {tr(language, 'Regarder une courte pub', 'Watch a short ad')}
            </Text>
          </View>
          <View style={{ backgroundColor: INK, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontFamily: FONTS.headingBlack, color: GOLD, fontSize: 15 }}>{`×${nextMult}`}</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Max multiplier reached — small confirmation. */}
      {base > 0 && stage >= LADDER.length && (
        <Text style={{ marginTop: 8, textAlign: 'center', color: c.textMuted, fontSize: 12, fontFamily: FONTS.mono }}>
          {tr(language, `Multiplicateur maximum ×${LADDER[LADDER.length - 1]} atteint 🎉`, `Max multiplier ×${LADDER[LADDER.length - 1]} reached 🎉`)}
        </Text>
      )}

      {/* Flat rewarded-ad button (kept alongside the doubler). */}
      <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
        <RewardedAdButton context="solo_summary" />
      </View>
    </View>
  );
}
