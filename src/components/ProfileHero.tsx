/**
 * <ProfileHero> — the full-bleed showcase at the top of both profile screens
 * (Mon profil and another player's). The live 3D World avatar fills the width,
 * its equipped cosmos is the backdrop, and the identity (username + rank chip)
 * sits on a bottom gradient — a game's "character screen", not a form.
 *
 * Only the corner buttons are interactive above the scene; the identity layer
 * is pointerEvents="none" so a drag on the globe reaches the WebView and spins
 * it. The hero lives OUTSIDE the screen's ScrollView on purpose: the list
 * scrolls below it, so the spin gesture never fights the scroll.
 *
 * Players who opted for a photo (useCustom === false) get the photo as a
 * medallion on the default night backdrop — same hero, same identity layer.
 */
import React, { useEffect, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { RotateCw } from 'lucide-react-native';

import type { AvatarConfig } from '../types';
import type { RankInfo } from '../lib/ranked';
import { getPartById } from '../data/cosmetics';
import { useFeatureFlag } from '../lib/featureFlags';
import { useViewport } from '../lib/uiScale';
import { consumeGlobeHint } from '../lib/profileHint';
import { tr } from '../i18n';
import { useLanguage } from '../contexts/LanguageContext';
import { FONTS } from '../theme/typography';
import { AvatarPreview3D } from './AvatarPreview3D';
import { WorldAvatar } from './WorldAvatar';
import { Avatar } from './Avatar';
import { ScoreText } from './ScoreText';

/** Widest the hero gets on a desktop browser — beyond that it floats centred. */
const HERO_MAX_WIDTH = 520;
const HERO_MIN_HEIGHT = 220;
const HERO_MAX_HEIGHT = 320;
const HINT_VISIBLE_MS = 2800;

interface ProfileHeroProps {
  /** World to render; null when the player shows a photo/initials instead. */
  worldConfig: AvatarConfig | null;
  avatarConfig: AvatarConfig | null;
  photoUrl: string | null;
  username: string;
  /** Rank chip; pass null when the player hides their rank. */
  rank: RankInfo | null;
  elo: number;
  /** Floating corner controls (back, logout…) — the screen owns their handlers. */
  leftButton?: ReactNode;
  rightButton?: ReactNode;
  /** Snapshot not loaded yet: backdrop + name only, no scene to swap later. */
  loading?: boolean;
}

/** Shared look of the floating corner buttons: translucent night over any cosmos. */
export const heroIconBtnStyle = {
  width: 40,
  height: 40,
  borderRadius: 12,
  borderWidth: 1,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: 'rgba(5,8,20,0.55)',
  borderColor: 'rgba(255,255,255,0.18)',
};

function cosmosBackdrop(config: AvatarConfig | null): string {
  const cosmos = config?.layers.cosmos;
  if (!cosmos) return '#0b1230';
  return cosmos.tint ?? getPartById(cosmos.id)?.swatch ?? '#0b1230';
}

export function ProfileHero({
  worldConfig,
  avatarConfig,
  photoUrl,
  username,
  rank,
  elo,
  leftButton,
  rightButton,
  loading = false,
}: ProfileHeroProps) {
  const { language } = useLanguage();
  const { width: vw, height: vh } = useViewport();
  const avatar3d = useFeatureFlag('avatar_3d');

  const heroWidth = Math.min(vw, HERO_MAX_WIDTH);
  const heroHeight = Math.round(Math.min(HERO_MAX_HEIGHT, Math.max(HERO_MIN_HEIGHT, vh * 0.34)));
  const floating = heroWidth < vw;
  const backdrop = cosmosBackdrop(worldConfig);

  // "Drag to spin" hint: first openings only (see profileHint), and only when
  // there is a live scene to spin — the SVG fallback and photos don't turn.
  const [hint] = useState(() => new Animated.Value(0));
  const [hintOn, setHintOn] = useState(false);
  const spinnable = avatar3d && !!worldConfig && !loading;
  useEffect(() => {
    if (!spinnable) return;
    let alive = true;
    consumeGlobeHint().then((show) => {
      if (!alive || !show) return;
      setHintOn(true);
      Animated.sequence([
        Animated.timing(hint, { toValue: 1, duration: 300, delay: 600, useNativeDriver: true }),
        Animated.delay(HINT_VISIBLE_MS),
        Animated.timing(hint, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start(() => alive && setHintOn(false));
    });
    return () => {
      alive = false;
    };
  }, [spinnable, hint]);

  const rankLabel = rank ? tr(language, rank.nameFr, rank.name) : null;

  return (
    <View style={[styles.wrap, floating && styles.wrapFloating]}>
      <View
        style={[
          styles.hero,
          { width: heroWidth, height: heroHeight, backgroundColor: backdrop },
          floating && styles.heroFloating,
        ]}
      >
        {loading ? null : worldConfig ? (
          avatar3d ? (
            <AvatarPreview3D config={worldConfig} size={heroHeight} width={heroWidth} height={heroHeight} />
          ) : (
            <View style={styles.center}>
              <WorldAvatar config={worldConfig} size={heroHeight} animate />
            </View>
          )
        ) : (
          <View style={styles.center}>
            <Avatar
              config={avatarConfig}
              photoUrl={photoUrl}
              username={username}
              size={Math.round(heroHeight * 0.5)}
              ringColor={rank?.color ?? 'rgba(255,255,255,0.35)'}
              ringWidth={3}
            />
          </View>
        )}

        {/* Identity layer — never intercepts the spin gesture. */}
        <View style={styles.identity} pointerEvents="none">
          <Svg width={heroWidth} height={140} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="profileHeroFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#05081a" stopOpacity="0" />
                <Stop offset="1" stopColor="#05081a" stopOpacity="0.88" />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={heroWidth} height={140} fill="url(#profileHeroFade)" />
          </Svg>
          <View
            style={styles.identityText}
            accessible
            accessibilityRole="header"
            accessibilityLabel={
              rankLabel
                ? tr(language, '{0}, rang {1}, {2} ELO', '{0}, rank {1}, {2} ELO', [username, rankLabel, elo])
                : username
            }
          >
            <Text style={styles.username} numberOfLines={1}>{username}</Text>
            <View style={styles.metaRow}>
              {rank && rankLabel ? (
                <View style={[styles.rankChip, { borderColor: `${rank.color}99`, backgroundColor: `${rank.color}2e` }]}>
                  <View style={[styles.rankDot, { backgroundColor: rank.color }]} />
                  <ScoreText style={[styles.rankText, { color: rank.color }]}>
                    {rankLabel} · {elo}
                  </ScoreText>
                </View>
              ) : null}
              {hintOn ? (
                <Animated.View style={[styles.hint, { opacity: hint }]}>
                  <RotateCw color="rgba(255,255,255,0.8)" size={12} />
                  <Text style={styles.hintText}>{tr(language, 'Glisse pour tourner', 'Drag to spin')}</Text>
                </Animated.View>
              ) : null}
            </View>
          </View>
        </View>

        {leftButton ? <View style={[styles.corner, styles.cornerLeft]}>{leftButton}</View> : null}
        {rightButton ? <View style={[styles.corner, styles.cornerRight]}>{rightButton}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  wrapFloating: { paddingTop: 12 },
  hero: { overflow: 'hidden' },
  heroFloating: { borderRadius: 18 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  identity: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 140, justifyContent: 'flex-end' },
  identityText: { paddingHorizontal: 16, paddingBottom: 12, gap: 6 },
  username: {
    color: '#fff',
    fontSize: 26,
    fontFamily: FONTS.headingBlack,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  rankChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
  },
  rankDot: { width: 8, height: 8, borderRadius: 4 },
  rankText: { fontSize: 12, fontFamily: FONTS.monoBold },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  hintText: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontFamily: FONTS.mono },
  corner: { position: 'absolute', top: 10 },
  cornerLeft: { left: 12 },
  cornerRight: { right: 12 },
});
