/**
 * <Reveal> — un bloc de l'écran de fin qui entre en scène à son heure.
 *
 * Les cartes de fin montaient tout d'un coup : globe, score, pièces, récap et
 * boutons dans la même frame. Ici chaque bloc attend son temps de la partition
 * (`END_CHOREO`) puis apparaît — en montant (`rise`), en éclatant (`pop`) ou en
 * claquant comme un tampon (`stamp`). Les enfants ne sont montés qu'à ce
 * moment-là : un compteur de pièces placé dedans démarre donc quand on le voit.
 *
 * « Réduire les animations » → tout est monté et visible immédiatement.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

import { NATIVE_ANIM, useReducedMotion } from '../../lib/motion';
import { useEventCallback } from '../../lib/useEventCallback';

export type RevealKind = 'rise' | 'pop' | 'stamp' | 'fade';

interface RevealProps {
  /** Délai (ms) depuis le montage avant d'apparaître. */
  at?: number;
  kind?: RevealKind;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  /** Appelé quand le bloc devient visible (pour un vibreur, une annonce…). */
  onShown?: () => void;
}

export function Reveal({ at = 0, kind = 'rise', duration, style, children, onShown }: RevealProps) {
  const rm = useReducedMotion();
  const [shown, setShown] = useState(rm || at === 0);
  const progress = useState(() => new Animated.Value(rm ? 1 : 0))[0];
  const onShownStable = useEventCallback(onShown);

  useEffect(() => {
    if (rm) {
      progress.setValue(1);
      setShown(true);
      onShownStable();
      return;
    }
    const timer = setTimeout(() => {
      setShown(true);
      onShownStable();
      Animated.timing(progress, {
        toValue: 1,
        duration: duration ?? (kind === 'stamp' ? 380 : kind === 'pop' ? 520 : 480),
        easing: kind === 'stamp' ? Easing.out(Easing.cubic) : Easing.out(Easing.back(kind === 'pop' ? 1.6 : 0.8)),
        useNativeDriver: NATIVE_ANIM,
      }).start();
    }, at);
    return () => clearTimeout(timer);
  }, [at, duration, kind, progress, rm]);

  if (!shown) return null;

  const opacity = progress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] });
  const transform =
    kind === 'rise'
      ? [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }]
      : kind === 'pop'
        ? [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }]
        : kind === 'stamp'
          ? [
              { scale: progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [2.4, 0.95, 1] }) },
              { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '0deg'] }) },
            ]
          : [];

  return (
    <Animated.View style={[{ alignSelf: 'stretch', alignItems: 'center' }, style, { opacity, transform }]}>
      {children}
    </Animated.View>
  );
}
