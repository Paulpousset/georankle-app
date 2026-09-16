/**
 * <CountUp> — un nombre qui se compte jusqu'à sa valeur (score, ELO, série).
 *
 * Même courbe que le compteur de pièces (cubic-out, 750 ms) pour que tout
 * l'écran respire au même rythme. Le texte passe par `ScoreText` : sur le web
 * `adjustsFontSizeToFit` n'existe pas, ScoreText le remplace.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, type StyleProp, type TextStyle } from 'react-native';

import { useReducedMotion } from '../../lib/motion';
import { ScoreText } from '../ScoreText';

interface CountUpProps {
  to: number;
  from?: number;
  /** Délai (ms) avant de commencer à compter. */
  at?: number;
  duration?: number;
  format?: (n: number) => string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
}

export function CountUp({
  to,
  from = 0,
  at = 0,
  duration = 750,
  format,
  style,
  numberOfLines,
  adjustsFontSizeToFit,
}: CountUpProps) {
  const rm = useReducedMotion();
  const anim = useState(() => new Animated.Value(from))[0];
  const [value, setValue] = useState(rm ? to : from);

  useEffect(() => {
    if (rm) {
      setValue(to);
      return;
    }
    const id = anim.addListener(({ value: v }) => setValue(Math.round(v)));
    const timer = setTimeout(() => {
      Animated.timing(anim, {
        toValue: to,
        duration,
        easing: Easing.out(Easing.cubic),
        // Un listener JS lit la valeur : pas de pilote natif possible.
        useNativeDriver: false,
      }).start(() => setValue(to));
    }, at);
    return () => {
      clearTimeout(timer);
      anim.removeListener(id);
    };
  }, [anim, at, duration, rm, to]);

  return (
    <ScoreText numberOfLines={numberOfLines} adjustsFontSizeToFit={adjustsFontSizeToFit} style={style}>
      {format ? format(value) : String(value)}
    </ScoreText>
  );
}
