/**
 * <EndGlobe> — le globe du joueur qui ouvre l'écran de fin.
 *
 * Même vitrine que <PlayerGlobe> (le globe équipé, sa rareté, son nom), mais
 * il ENTRE en scène : il tombe du haut et rebondit (0 → 0,7 s), son ombre se
 * resserre à l'atterrissage, un vibreur léger marque le contact. Quand la
 * partie mérite une fête (`celebrate` : nouveau record, victoire), des
 * confettis tombent autour à 1 s.
 *
 * Le globe est mis en scène, pas la carte : on garde le calme de la vitrine.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { END_CHOREO, NATIVE_ANIM, useReducedMotion } from '../../lib/motion';
import { usePersonalBest } from '../../lib/personalBest';
import type { SoloRunContext } from '../../lib/soloResult';
import { PlayerGlobe, type PlayerGlobeProps } from '../PlayerGlobe';
import { Confetti } from './Confetti';
import { RecordRibbon } from './RecordRibbon';

/** La partie à comparer au record personnel du mode (solo libre seulement). */
export interface EndGlobeRecord {
  mode: string;
  score: number;
  ctx?: SoloRunContext;
  formatScore?: (n: number) => string;
}

interface EndGlobeProps extends PlayerGlobeProps {
  /** Confettis + vibreur de succès (record, victoire). */
  celebrate?: boolean;
  /**
   * Compare la partie au record local du mode : un nouveau record claque un
   * ruban et déclenche la fête. Le globe n'est monté qu'à la fin de partie,
   * donc la comparaison se fait exactement une fois, au bon moment.
   */
  record?: EndGlobeRecord;
  /** Délai des confettis (ms). */
  celebrateAt?: number;
  /** Sans chute : le globe est déjà là (écrans de reprise). */
  entrance?: boolean;
  /** Vibreur à l'atterrissage (désactivé sur les écrans qui vibrent déjà). */
  haptics?: boolean;
}

export function EndGlobe({
  celebrate = false,
  celebrateAt = 1000,
  record,
  entrance = true,
  haptics = true,
  style,
  ...globe
}: EndGlobeProps) {
  const rm = useReducedMotion();
  const drop = useState(() => new Animated.Value(rm || !entrance ? 1 : 0))[0];
  const best = usePersonalBest(record?.mode ?? '', record?.score ?? null, record?.ctx, !!record);
  const party = celebrate || best.isRecord;

  useEffect(() => {
    if (rm || !entrance) {
      drop.setValue(1);
      return;
    }
    const anim = Animated.timing(drop, {
      toValue: 1,
      duration: END_CHOREO.verdict,
      easing: Easing.bounce,
      useNativeDriver: NATIVE_ANIM,
    });
    anim.start();
    const land = haptics
      ? setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }, 420)
      : null;
    return () => {
      anim.stop();
      if (land) clearTimeout(land);
    };
  }, [drop, entrance, haptics, rm]);

  useEffect(() => {
    if (!party || rm) return;
    const t = setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }, celebrateAt);
    return () => clearTimeout(t);
  }, [party, celebrateAt, rm]);

  const translateY = drop.interpolate({ inputRange: [0, 1], outputRange: [-140, 0] });
  const opacity = drop.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] });
  const shadowScale = drop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const shadowOpacity = drop.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.22] });
  const shadowW = Math.round(globe.size * 0.7);

  return (
    <View style={[{ alignItems: 'center', overflow: 'visible' }, style]}>
      {party ? <Confetti at={celebrateAt} width={Math.max(300, globe.size * 3)} /> : null}
      <Animated.View style={{ alignItems: 'center', opacity, transform: [{ translateY }] }}>
        <PlayerGlobe {...globe} />
        {best.isRecord ? <RecordRibbon at={celebrateAt} previous={best.previous} formatScore={record?.formatScore} /> : null}
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={{
          marginTop: -6,
          width: shadowW,
          height: 8,
          borderRadius: 4,
          backgroundColor: '#000',
          opacity: shadowOpacity,
          transform: [{ scaleX: shadowScale }],
        }}
      />
    </View>
  );
}
