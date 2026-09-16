/**
 * Confettis et éclats — les particules des fins de partie.
 *
 * Pas de bibliothèque : un seul `Animated.Value` (0 → 1) pilote toutes les
 * pièces par interpolation, chacune avec son décalage, sa dérive et sa
 * rotation tirés d'un générateur déterministe. Pilote natif partout où il
 * existe ; sur le web le JS suffit pour 40 vues. Absolument positionnés et
 * transparents au toucher : ils passent PAR-DESSUS l'écran sans le gêner.
 *
 * « Réduire les animations » → rien n'est rendu.
 */
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { NATIVE_ANIM, makeRng, useReducedMotion } from '../../lib/motion';

export const CELEBRATION_COLORS = ['#f5b301', '#c04a1a', '#2a6e3f', '#4a9eff', '#ffffff'];

interface ConfettiProps {
  /** Délai (ms) avant le lâcher. */
  at?: number;
  count?: number;
  colors?: string[];
  /** Largeur de la pluie, centrée sur le parent. */
  width?: number;
  /** Hauteur de chute. */
  height?: number;
  duration?: number;
  seed?: number;
  /** Décalage vertical du point de départ (négatif = au-dessus du parent). */
  top?: number;
}

/** Pluie de confettis qui tombe sur le parent (à placer dans un conteneur relatif). */
export function Confetti({
  at = 0,
  count = 44,
  colors = CELEBRATION_COLORS,
  width = 340,
  height = 420,
  duration = 2600,
  seed = 7,
  top = -60,
}: ConfettiProps) {
  const rm = useReducedMotion();
  const [live, setLive] = useState(false);
  const progress = useState(() => new Animated.Value(0))[0];

  const pieces = useMemo(() => {
    const rng = makeRng(seed);
    return Array.from({ length: count }, (_, i) => ({
      key: i,
      x: rng() * width,
      delay: rng() * 0.35,
      sway: (rng() - 0.5) * 60,
      spin: (rng() - 0.5) * 900,
      w: 6 + rng() * 5,
      h: 3 + rng() * 3,
      color: colors[Math.floor(rng() * colors.length)],
      speed: 0.75 + rng() * 0.5,
    }));
  }, [count, colors, width, seed]);

  useEffect(() => {
    if (rm) return;
    const timer = setTimeout(() => {
      setLive(true);
      Animated.timing(progress, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: NATIVE_ANIM,
      }).start(() => setLive(false));
    }, at);
    return () => clearTimeout(timer);
  }, [at, duration, progress, rm]);

  if (rm || !live) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top,
        left: '50%',
        marginLeft: -width / 2,
        width,
        height,
        overflow: 'visible',
      }}
    >
      {pieces.map((p) => {
        const start = p.delay;
        const end = Math.min(1, start + p.speed);
        const translateY = progress.interpolate({
          inputRange: [0, start, end, 1],
          outputRange: [-20, -20, height, height],
        });
        const translateX = progress.interpolate({
          inputRange: [0, start, (start + end) / 2, end, 1],
          outputRange: [0, 0, p.sway, -p.sway * 0.5, -p.sway * 0.5],
        });
        const rotate = progress.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', `${p.spin}deg`],
        });
        const opacity = progress.interpolate({
          inputRange: [0, start, Math.max(start + 0.01, end - 0.2), end, 1],
          outputRange: [0, 1, 1, 0, 0],
        });
        return (
          <Animated.View
            key={p.key}
            style={{
              position: 'absolute',
              left: p.x,
              top: 0,
              width: p.w,
              height: p.h,
              borderRadius: 1.5,
              backgroundColor: p.color,
              opacity,
              transform: [{ translateX }, { translateY }, { rotate }],
            }}
          />
        );
      })}
    </View>
  );
}

interface BurstProps {
  at?: number;
  count?: number;
  color?: string;
  colors?: string[];
  /** Distance maximale parcourue par un éclat. */
  radius?: number;
  size?: number;
  duration?: number;
  seed?: number;
  /** Position du centre dans le parent (par défaut : son centre). */
  cx?: number;
  cy?: number;
}

/** Éclats radiaux (étoile qui s'allume, impact, arrivée sur un rang). */
export function Burst({
  at = 0,
  count = 18,
  color = '#f5b301',
  colors,
  radius = 70,
  size = 5,
  duration = 700,
  seed = 3,
  cx,
  cy,
}: BurstProps) {
  const rm = useReducedMotion();
  const [live, setLive] = useState(false);
  const progress = useState(() => new Animated.Value(0))[0];

  const sparks = useMemo(() => {
    const rng = makeRng(seed);
    return Array.from({ length: count }, (_, i) => {
      const a = rng() * Math.PI * 2;
      const d = radius * (0.45 + rng() * 0.55);
      return {
        key: i,
        dx: Math.cos(a) * d,
        dy: Math.sin(a) * d,
        s: size * (0.5 + rng()),
        color: colors ? colors[Math.floor(rng() * colors.length)] : color,
      };
    });
  }, [count, radius, size, seed, color, colors]);

  useEffect(() => {
    if (rm) return;
    const timer = setTimeout(() => {
      setLive(true);
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: NATIVE_ANIM,
      }).start(() => setLive(false));
    }, at);
    return () => clearTimeout(timer);
  }, [at, duration, progress, rm]);

  if (rm || !live) return null;

  const opacity = progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0.9, 0] });
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: cx ?? '50%',
        top: cy ?? '50%',
        width: 0,
        height: 0,
        overflow: 'visible',
      }}
    >
      {sparks.map((s) => (
        <Animated.View
          key={s.key}
          style={{
            position: 'absolute',
            left: -s.s / 2,
            top: -s.s / 2,
            width: s.s,
            height: s.s,
            borderRadius: s.s / 2,
            backgroundColor: s.color,
            opacity,
            transform: [
              { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, s.dx] }) },
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, s.dy + 18] }) },
              { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

interface WaveRingProps {
  at?: number;
  /** Rayon initial (celui du globe). */
  radius: number;
  color: string;
  duration?: number;
  /** Nombre d'anneaux, espacés de `gap` ms. */
  rings?: number;
  gap?: number;
}

/** Ondes concentriques qui s'élargissent depuis le centre du parent. */
export function WaveRings({ at = 0, radius, color, duration = 900, rings = 3, gap = 300 }: WaveRingProps) {
  const rm = useReducedMotion();
  const [live, setLive] = useState(false);
  const values = useState(() => Array.from({ length: rings }, () => new Animated.Value(0)))[0];

  useEffect(() => {
    if (rm) return;
    const timer = setTimeout(() => {
      setLive(true);
      Animated.stagger(
        gap,
        values.map((v) =>
          Animated.timing(v, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_ANIM }),
        ),
      ).start(() => setLive(false));
    }, at);
    return () => clearTimeout(timer);
  }, [at, duration, gap, rm, values]);

  if (rm || !live) return null;

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 }}>
      {values.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: -radius,
            top: -radius,
            width: radius * 2,
            height: radius * 2,
            borderRadius: radius,
            borderWidth: 3,
            borderColor: color,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
            transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
          }}
        />
      ))}
    </View>
  );
}
