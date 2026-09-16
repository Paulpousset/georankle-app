/**
 * <ShatterGlobe> — un globe qui vole en éclats.
 *
 * Sans moteur de rendu vectoriel dans l'app (pas de Skia), on découpe le globe
 * en une grille de tuiles : chaque tuile est une View `overflow: hidden` qui
 * montre SA portion de l'avatar complet (l'avatar est rendu une fois par tuile,
 * décalé). À l'impact, les tuiles partent en rayon depuis le centre, tombent
 * (gravité approchée par une seconde clé), tournent et s'effacent — pilote
 * natif, une seule valeur de progression pour toutes.
 *
 * Les tuiles de coin, entièrement hors du disque, ne sont pas rendues : pour
 * une grille 4×4 ça fait 12 avatars, pas 16.
 *
 * Avant `at`, le globe est intact (l'avatar entier, avec son anneau).
 */
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import type { AvatarConfig } from '../../types';
import { NATIVE_ANIM, makeRng, useReducedMotion } from '../../lib/motion';
import { useEventCallback } from '../../lib/useEventCallback';
import { Avatar } from '../Avatar';

interface ShatterGlobeProps {
  config: AvatarConfig | null | undefined;
  photoUrl?: string | null;
  username?: string | null;
  size: number;
  ringColor?: string;
  /** Délai (ms) avant l'explosion. */
  at: number;
  duration?: number;
  grid?: number;
  /** Poussée horizontale (−1 vers la gauche, +1 vers la droite). */
  push?: number;
  seed?: number;
  /** Appelé à l'instant de l'explosion. */
  onShatter?: () => void;
}

export function ShatterGlobe({
  config,
  photoUrl = null,
  username,
  size,
  ringColor,
  at,
  duration = 1500,
  grid = 4,
  push = 0,
  seed = 11,
  onShatter,
}: ShatterGlobeProps) {
  const rm = useReducedMotion();
  const [phase, setPhase] = useState<'intact' | 'shards' | 'gone'>('intact');
  const progress = useState(() => new Animated.Value(0))[0];
  const onShatterStable = useEventCallback(onShatter);

  const tile = size / grid;
  const tiles = useMemo(() => {
    const rng = makeRng(seed);
    const out: {
      key: string; x: number; y: number; dx: number; dy: number; spin: number; delay: number;
    }[] = [];
    const r = size / 2;
    for (let j = 0; j < grid; j++) {
      for (let i = 0; i < grid; i++) {
        const cx = (i + 0.5) * tile - r;
        const cy = (j + 0.5) * tile - r;
        // Tuile entièrement hors du disque : rien à montrer.
        const nearest = Math.hypot(
          Math.max(0, Math.abs(cx) - tile / 2),
          Math.max(0, Math.abs(cy) - tile / 2),
        );
        if (nearest > r) continue;
        const len = Math.hypot(cx, cy) || 1;
        const speed = size * (0.9 + rng() * 1.2);
        out.push({
          key: `${i}-${j}`,
          x: i * tile,
          y: j * tile,
          dx: (cx / len) * speed + push * size * 0.8,
          dy: (cy / len) * speed - size * 0.3,
          spin: (rng() - 0.5) * 540,
          delay: rng() * 0.06,
        });
      }
    }
    return out;
  }, [grid, push, seed, size, tile]);

  useEffect(() => {
    if (rm) {
      const t = setTimeout(() => {
        onShatterStable();
        setPhase('gone');
      }, at);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      onShatterStable();
      setPhase('shards');
      Animated.timing(progress, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: NATIVE_ANIM,
      }).start(() => setPhase('gone'));
    }, at);
    return () => clearTimeout(t);
  }, [at, duration, progress, rm]);

  if (phase === 'gone') return <View style={{ width: size, height: size }} />;

  if (phase === 'intact') {
    return (
      <Avatar config={config} photoUrl={photoUrl} username={username} size={size} ringColor={ringColor} ringWidth={3} />
    );
  }

  return (
    <View style={{ width: size, height: size, overflow: 'visible' }} pointerEvents="none">
      {tiles.map((t) => {
        const start = t.delay;
        const translateX = progress.interpolate({ inputRange: [0, start, 1], outputRange: [0, 0, t.dx] });
        // Monte un peu puis retombe : la gravité en deux clés.
        const translateY = progress.interpolate({
          inputRange: [0, start, 0.35, 1],
          outputRange: [0, 0, t.dy * 0.6, t.dy + size * 1.4],
        });
        const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${t.spin}deg`] });
        const opacity = progress.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 1, 0] });
        return (
          <Animated.View
            key={t.key}
            style={{
              position: 'absolute',
              left: t.x,
              top: t.y,
              width: tile,
              height: tile,
              overflow: 'hidden',
              opacity,
              transform: [{ translateX }, { translateY }, { rotate }],
            }}
          >
            <View style={{ position: 'absolute', left: -t.x, top: -t.y }}>
              <Avatar config={config} photoUrl={photoUrl} username={username} size={size} />
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}
