/**
 * <FfaPodium> — « Le podium » : la fin d'une mêlée à 3–8 joueurs.
 *
 * Trois marches sortent du sol (0 – 0,6 s). Les globes tombent dans l'ordre
 * 3e (0,7 s), 2e (1,1 s), 1er (1,5 s), avec le rebond du socle commun. Le
 * vainqueur reçoit sa couronne et ses confettis (1,6 s). Les autres font la
 * haie en bas, en petit, et glissent depuis la droite (1,8 s). Le globe du
 * joueur porte l'accent, où qu'il finisse.
 *
 * Purement visuel : FfaMatch fournit le classement et les profils.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import type { AvatarConfig } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getColors, PALETTE } from '../../theme/colors';
import { FONTS } from '../../theme/typography';
import { NATIVE_ANIM, useReducedMotion } from '../../lib/motion';
import { tr } from '../../i18n';
import { a11yHidden } from '../../lib/a11y';
import { Avatar } from '../Avatar';
import { Confetti } from './Confetti';
import { Reveal } from './Reveal';

export interface PodiumPlayer {
  id: string;
  name: string;
  config: AvatarConfig | null;
  photoUrl?: string | null;
}

interface FfaPodiumProps {
  /** Classement, meilleur en premier. */
  ranked: PodiumPlayer[];
  meId: string;
  width?: number;
}

const GOLD = '#f5b301';
const STEP_H = [88, 116, 64]; // 2e, 1er, 3e
const DROP_AT = [1100, 1500, 700];
const GLOBE = 64;

/** Couronne dorée posée sur le globe du vainqueur. */
function Crown({ at }: { at: number }) {
  return (
    <Reveal at={at} kind="pop" style={{ alignSelf: 'auto' }}>
      <View style={{ width: 34, height: 18, alignItems: 'center', justifyContent: 'flex-end' }} {...a11yHidden}>
        <View style={{ position: 'absolute', bottom: 0, width: 34, height: 10, backgroundColor: GOLD, borderRadius: 2, borderWidth: 1, borderColor: '#8a5a00' }} />
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              bottom: 6,
              left: 2 + i * 11,
              width: 0,
              height: 0,
              borderLeftWidth: 5,
              borderRightWidth: 5,
              borderBottomWidth: i === 1 ? 14 : 10,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderBottomColor: GOLD,
            }}
          />
        ))}
      </View>
    </Reveal>
  );
}

function DroppingGlobe({ player, at, isMe, size }: { player: PodiumPlayer; at: number; isMe: boolean; size: number }) {
  const rm = useReducedMotion();
  const drop = useState(() => new Animated.Value(rm ? 1 : 0))[0];
  useEffect(() => {
    if (rm) return;
    const t = setTimeout(() => {
      Animated.timing(drop, { toValue: 1, duration: 650, easing: Easing.bounce, useNativeDriver: NATIVE_ANIM }).start();
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), 380);
    }, at);
    return () => clearTimeout(t);
  }, [at, drop, rm]);
  return (
    <Animated.View
      style={{
        opacity: drop.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 1, 1] }),
        transform: [{ translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-120, 0] }) }],
      }}
    >
      <Avatar config={player.config} photoUrl={player.photoUrl} username={player.name} size={size} ringColor={isMe ? PALETTE.forestGreen : undefined} ringWidth={3} />
    </Animated.View>
  );
}

export function FfaPodium({ ranked, meId, width = 320 }: FfaPodiumProps) {
  const rm = useReducedMotion();
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const rise = useState(() => new Animated.Value(rm ? 1 : 0))[0];

  useEffect(() => {
    if (rm) return;
    Animated.timing(rise, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_ANIM }).start();
  }, [rise, rm]);

  // Ordre visuel : 2e à gauche, 1er au centre, 3e à droite.
  const slots = [ranked[1], ranked[0], ranked[2]];
  const rest = ranked.slice(3);
  const stepW = Math.min(100, Math.floor((width - 16) / 3));
  const podiumH = STEP_H[1] + GLOBE + 40;

  return (
    <View style={{ width, alignItems: 'center' }}>
      <View
        style={{ width, height: podiumH, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8 }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={tr(language, 'Podium : {0}', 'Podium: {0}', [
          ranked.slice(0, 3).map((p, i) => `${i + 1}. ${p.name}`).join(', '),
        ])}
      >
        {ranked[0] ? <Confetti at={1650} width={width} height={podiumH + 120} top={-80} count={54} /> : null}
        {slots.map((p, i) => {
          if (!p) return <View key={`empty-${i}`} style={{ width: stepW }} />;
          const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
          const isMe = p.id === meId;
          return (
            <View key={p.id} style={{ width: stepW, alignItems: 'center', justifyContent: 'flex-end' }}>
              <View style={{ alignItems: 'center', marginBottom: 6, height: GLOBE + 30, justifyContent: 'flex-end' }}>
                {rank === 1 ? <Crown at={1650} /> : <View style={{ height: 18 }} />}
                <DroppingGlobe player={p} at={DROP_AT[i]} isMe={isMe} size={GLOBE} />
              </View>
              <Reveal at={DROP_AT[i] + 650} kind="fade" style={{ alignSelf: 'auto' }}>
                <Text numberOfLines={1} style={{ color: isMe ? PALETTE.forestGreen : c.text, fontFamily: FONTS.heading, fontSize: 13, maxWidth: stepW }}>
                  {p.name}
                </Text>
              </Reveal>
              <Animated.View
                style={{
                  width: stepW,
                  height: STEP_H[i],
                  marginTop: 4,
                  backgroundColor: c.card,
                  borderWidth: 1.5,
                  borderColor: rank === 1 ? GOLD : c.border,
                  borderTopLeftRadius: 10,
                  borderTopRightRadius: 10,
                  alignItems: 'center',
                  paddingTop: 10,
                  // On grandit depuis le bas : l'origine par défaut est le centre.
                  transformOrigin: 'bottom',
                  transform: [{ scaleY: rise }],
                }}
              >
                <Animated.Text style={{ color: rank === 1 ? GOLD : c.textMuted, fontFamily: FONTS.headingBlack, fontSize: 28, opacity: rise }}>
                  {rank}
                </Animated.Text>
              </Animated.View>
            </View>
          );
        })}
      </View>

      {rest.length > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
          {rest.map((p, i) => (
            <Reveal key={p.id} at={1800 + i * 120} kind="rise" style={{ alignSelf: 'auto', width: 64 }}>
              <Avatar config={p.config} photoUrl={p.photoUrl} username={p.name} size={40} ringColor={p.id === meId ? PALETTE.forestGreen : undefined} ringWidth={2} />
              <Text numberOfLines={1} style={{ color: p.id === meId ? PALETTE.forestGreen : c.textMuted, fontFamily: FONTS.monoBold, fontSize: 10, marginTop: 4 }}>
                {`${i + 4}. ${p.name}`}
              </Text>
            </Reveal>
          ))}
        </View>
      )}
    </View>
  );
}
