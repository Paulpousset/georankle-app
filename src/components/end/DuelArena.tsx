/**
 * <DuelArena> — « Le choc » : la fin d'un match 1 contre 1.
 *
 * Les deux globes se foncent dessus (0 – 0,65 s, accéléré). Impact : flash,
 * vibreur lourd, l'arène tremble. Le perdant vole en éclats et ses étincelles
 * prennent la couleur de son anneau ; le gagnant recule, puis grossit et vient
 * au centre sous trois ondes ; les confettis tombent si c'est le joueur qui
 * gagne. Défaite : c'est le globe du joueur qui éclate, pas de confettis, la
 * scène s'assombrit. Égalité : les deux globes se cognent et repartent, sans
 * casse.
 *
 * Purement visuel : profils et issue viennent de MatchResult.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import type { AvatarConfig } from '../../types';
import { RARITY_META } from '../../data/cosmetics';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getColors } from '../../theme/colors';
import { FONTS } from '../../theme/typography';
import { NATIVE_ANIM, useReducedMotion } from '../../lib/motion';
import { tr } from '../../i18n';
import { a11yHidden } from '../../lib/a11y';
import { Avatar } from '../Avatar';
import { equippedGlobePart } from '../PlayerGlobe';
import { Burst, Confetti, WaveRings } from './Confetti';
import { ShatterGlobe } from './ShatterGlobe';

export interface DuelPlayer {
  config: AvatarConfig | null;
  photoUrl?: string | null;
  username: string;
}

interface DuelArenaProps {
  me: DuelPlayer;
  opponent: DuelPlayer;
  outcome: 'win' | 'lose' | 'draw';
  /** Diamètre des globes au départ. */
  size?: number;
  width?: number;
}

/** Instant (ms) de l'impact, exposé pour caler le titre et les vibreurs. */
export const DUEL_IMPACT_AT = 650;

export function DuelArena({ me, opponent, outcome, size = 92, width = 320 }: DuelArenaProps) {
  const rm = useReducedMotion();
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);

  const approach = useState(() => new Animated.Value(rm ? 1 : 0))[0];
  const after = useState(() => new Animated.Value(rm ? 1 : 0))[0];
  const shake = useState(() => new Animated.Value(0))[0];
  const flash = useState(() => new Animated.Value(0))[0];
  const [impacted, setImpacted] = useState(rm);

  const meRing = RARITY_META[equippedGlobePart(me.config)?.rarity ?? 'common'].color;
  const opRing = RARITY_META[equippedGlobePart(opponent.config)?.rarity ?? 'common'].color;
  const winRing = outcome === 'lose' ? opRing : meRing;
  const loseRing = outcome === 'lose' ? meRing : opRing;

  useEffect(() => {
    if (rm) return;
    Animated.timing(approach, {
      toValue: 1,
      duration: DUEL_IMPACT_AT,
      easing: Easing.in(Easing.quad),
      useNativeDriver: NATIVE_ANIM,
    }).start(() => {
      setImpacted(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 60, useNativeDriver: NATIVE_ANIM }),
        Animated.timing(flash, { toValue: 0, duration: 260, useNativeDriver: NATIVE_ANIM }),
      ]).start();
      Animated.sequence([
        Animated.timing(shake, { toValue: 1, duration: 50, useNativeDriver: NATIVE_ANIM }),
        Animated.timing(shake, { toValue: -1, duration: 70, useNativeDriver: NATIVE_ANIM }),
        Animated.timing(shake, { toValue: 0.6, duration: 70, useNativeDriver: NATIVE_ANIM }),
        Animated.timing(shake, { toValue: -0.3, duration: 70, useNativeDriver: NATIVE_ANIM }),
        Animated.timing(shake, { toValue: 0, duration: 80, useNativeDriver: NATIVE_ANIM }),
      ]).start();
      Animated.timing(after, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: NATIVE_ANIM,
      }).start();
    });
  }, [after, approach, flash, rm, shake]);

  const half = width / 2;
  const gapStart = half - size / 2 - 12; // position de départ, près des bords
  const gapImpact = size / 2 + 2; // au contact
  const meStartX = -gapStart;
  const opStartX = gapStart;

  // Avant l'impact : approche. Après : le gagnant recule d'abord, puis vient au centre.
  const meX = Animated.add(
    approach.interpolate({ inputRange: [0, 1], outputRange: [meStartX, -gapImpact] }),
    after.interpolate({
      inputRange: [0, 0.25, 1],
      outputRange: outcome === 'win' ? [0, -36, gapImpact] : outcome === 'lose' ? [0, 0, 0] : [0, -30, -gapImpact * 0.4],
    }),
  );
  const opX = Animated.add(
    approach.interpolate({ inputRange: [0, 1], outputRange: [opStartX, gapImpact] }),
    after.interpolate({
      inputRange: [0, 0.25, 1],
      outputRange: outcome === 'lose' ? [0, 36, -gapImpact] : outcome === 'win' ? [0, 0, 0] : [0, 30, gapImpact * 0.4],
    }),
  );
  const winScale = after.interpolate({ inputRange: [0, 0.3, 1], outputRange: [1, 1, 1.35] });
  const shakeX = shake.interpolate({ inputRange: [-1, 1], outputRange: [-7, 7] });
  const dim = after.interpolate({ inputRange: [0, 1], outputRange: [0, outcome === 'lose' ? 0.35 : 0] });

  const globeName = (cfg: AvatarConfig | null) => {
    const part = equippedGlobePart(cfg);
    return part ? tr(language, part.nameFr, part.nameEn) : '';
  };

  const renderSide = (side: 'me' | 'op') => {
    const p = side === 'me' ? me : opponent;
    const ring = side === 'me' ? meRing : opRing;
    const isWinner = outcome === 'draw' ? false : (outcome === 'win') === (side === 'me');
    const isLoser = outcome === 'draw' ? false : !isWinner;
    const x = side === 'me' ? meX : opX;
    return (
      <Animated.View
        key={side}
        style={{
          position: 'absolute',
          left: half - size / 2,
          top: 8,
          alignItems: 'center',
          transform: [{ translateX: x }, { scale: isWinner ? winScale : 1 }],
        }}
      >
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          {isWinner && impacted ? <WaveRings at={450} radius={size / 2} color={winRing} /> : null}
          {isLoser && impacted ? (
            <Burst at={0} count={30} color={loseRing} radius={size * 1.1} size={6} duration={800} seed={side === 'me' ? 5 : 9} />
          ) : null}
          {isLoser ? (
            <ShatterGlobe
              config={p.config}
              photoUrl={p.photoUrl}
              username={p.username}
              size={size}
              ringColor={ring}
              at={rm ? 0 : DUEL_IMPACT_AT}
              push={side === 'me' ? -1 : 1}
              seed={side === 'me' ? 21 : 33}
            />
          ) : (
            <View
              style={{
                width: size + 12,
                height: size + 12,
                borderRadius: (size + 12) / 2,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: ring + '1f',
                borderWidth: 1,
                borderColor: ring + '55',
              }}
            >
              <Avatar
                config={p.config}
                photoUrl={p.photoUrl}
                username={p.username}
                size={size}
                ringColor={isWinner ? '#f5b301' : ring}
                ringWidth={3}
                animate={impacted}
              />
            </View>
          )}
        </View>
      </Animated.View>
    );
  };

  const nameOf = (p: DuelPlayer, isLoser: boolean) => (
    <Animated.View
      style={{
        width: 140,
        alignItems: 'center',
        opacity: isLoser ? after.interpolate({ inputRange: [0, 0.3], outputRange: [1, 0], extrapolate: 'clamp' }) : 1,
      }}
    >
      <Text numberOfLines={1} style={{ color: c.text, fontFamily: FONTS.heading, fontSize: 14 }}>
        {p.username}
      </Text>
      <Text numberOfLines={1} style={{ color: c.textMuted, fontFamily: FONTS.mono, fontSize: 10 }}>
        {globeName(p.config)}
      </Text>
    </Animated.View>
  );

  const height = size * 1.55 + 20;

  return (
    <View style={{ width, alignItems: 'center' }}>
      <Animated.View
        style={{ width, height, transform: [{ translateX: shakeX }] }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          outcome === 'draw'
            ? tr(language, 'Les deux globes se cognent : égalité', 'The two globes collide: draw')
            : outcome === 'win'
              ? tr(language, 'Le globe de {0} vole en éclats', "{0}'s globe shatters", [opponent.username])
              : tr(language, 'Ton globe vole en éclats', 'Your globe shatters')
        }
      >
        <Animated.View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#140a0a', opacity: dim, borderRadius: 24 }}
        />
        {outcome === 'win' && impacted ? (
          <Confetti at={700} width={width + 40} height={height + 200} top={-40} count={56} />
        ) : null}
        {renderSide('op')}
        {renderSide('me')}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: half - 90,
            top: size / 2 - 82,
            width: 180,
            height: 180,
            borderRadius: 90,
            backgroundColor: '#ffffff',
            opacity: flash,
          }}
        />
      </Animated.View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', width, paddingHorizontal: 8 }} {...a11yHidden}>
        {nameOf(me, outcome === 'lose')}
        <Text style={{ color: c.textFaint, fontFamily: FONTS.mono, fontSize: 12, marginTop: 2 }}>
          {tr(language, 'contre', 'vs')}
        </Text>
        {nameOf(opponent, outcome === 'win')}
      </View>
    </View>
  );
}
