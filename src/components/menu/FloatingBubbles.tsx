/**
 * Bulles flottantes de l'Accueil : de petits raccourcis ronds posés sur les
 * bords de l'écran, en haut à gauche et à droite de la planète, qui donnent une
 * raison de revenir chaque jour (« L'Impossible du jour »…).
 *
 * Elles flottent doucement et, dès qu'on fait défiler l'Accueil, se rangent à
 * moitié dans le bord pour ne pas masquer les cartes ; un appui les ouvre
 * toujours.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Text, TouchableOpacity, View } from 'react-native';
import type { ComponentType } from 'react';

import { FONTS } from '../../theme/typography';
import { a11yButton } from '../../lib/a11y';

const NATIVE = Platform.OS !== 'web';
export const BUBBLE_SIZE = 56;

export interface BubbleSpec {
  id: string;
  side: 'left' | 'right';
  icon: ComponentType<{ color: string; size: number }>;
  /** Couleur de fond de la bulle. */
  color: string;
  /** Petit libellé sous la bulle. */
  label: string;
  /** Pastille en haut (« 2/6 », « NOUVEAU »…), absente si vide. */
  badge?: string | null;
  /** Halo pulsé tant que la bulle attend le joueur. */
  pulse?: boolean;
  a11yLabel: string;
  onPress: () => void;
}

function Bubble({
  spec,
  tucked,
  index,
}: {
  spec: BubbleSpec;
  tucked: Animated.Value;
  index: number;
}) {
  const float = useState(() => new Animated.Value(0))[0];
  const halo = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    // Les bulles ne flottent pas en phase : décalage selon leur rang.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1800,
          delay: index * 350,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: NATIVE,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: NATIVE,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float, index]);

  useEffect(() => {
    if (!spec.pulse) return;
    const loop = Animated.loop(
      Animated.timing(halo, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: NATIVE,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [halo, spec.pulse]);

  const Icon = spec.icon;
  const dir = spec.side === 'left' ? -1 : 1;

  return (
    <Animated.View
      style={{
        alignItems: 'center',
        transform: [
          { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
          {
            translateX: tucked.interpolate({
              inputRange: [0, 1],
              outputRange: [0, dir * BUBBLE_SIZE * 0.55],
            }),
          },
        ],
        opacity: tucked.interpolate({ inputRange: [0, 1], outputRange: [1, 0.85] }),
      }}
    >
      <TouchableOpacity activeOpacity={0.8} onPress={spec.onPress} {...a11yButton(spec.a11yLabel)}>
        <View style={{ width: BUBBLE_SIZE, height: BUBBLE_SIZE }}>
          {spec.pulse && (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                width: BUBBLE_SIZE,
                height: BUBBLE_SIZE,
                borderRadius: BUBBLE_SIZE / 2,
                backgroundColor: spec.color,
                opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
                transform: [
                  { scale: halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) },
                ],
              }}
            />
          )}
          <View
            style={{
              width: BUBBLE_SIZE,
              height: BUBBLE_SIZE,
              borderRadius: BUBBLE_SIZE / 2,
              backgroundColor: spec.color,
              borderWidth: 3,
              borderColor: 'rgba(255,255,255,0.9)',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOpacity: 0.3,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            }}
          >
            <Icon color="#fff" size={25} />
          </View>
          {!!spec.badge && (
            <View
              style={{
                position: 'absolute',
                top: -4,
                [spec.side === 'left' ? 'right' : 'left']: -8,
                minWidth: 26,
                paddingHorizontal: 5,
                height: 20,
                borderRadius: 10,
                backgroundColor: '#fff',
                borderWidth: 2,
                borderColor: spec.color,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: FONTS.monoBold, fontSize: 10, color: spec.color }}>
                {spec.badge}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
      <View
        style={{
          marginTop: 5,
          paddingHorizontal: 7,
          paddingVertical: 2,
          borderRadius: 8,
          backgroundColor: spec.color,
          maxWidth: BUBBLE_SIZE + 26,
        }}
      >
        <Text
          numberOfLines={1}
          style={{ fontFamily: FONTS.monoBold, fontSize: 9, color: '#fff', letterSpacing: 0.4 }}
        >
          {spec.label}
        </Text>
      </View>
    </Animated.View>
  );
}

/**
 * Pose les bulles sur les deux bords. À placer dans un conteneur `relative`
 * qui couvre la zone défilable ; `tucked` (0 → 1) range les bulles au défilement.
 */
export function FloatingBubbles({
  bubbles,
  tucked,
}: {
  bubbles: BubbleSpec[];
  tucked: Animated.Value;
}) {
  const column = (side: 'left' | 'right') => {
    const list = bubbles.filter((b) => b.side === side);
    if (list.length === 0) return null;
    return (
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          // Dans le haut de l'écran (de ~95 % à ~75 % de la hauteur en partant
          // du bas) : de part et d'autre de la planète de l'Accueil sur un
          // téléphone, au-dessus des cartes.
          top: '4%',
          [side]: 8,
          gap: 12,
          zIndex: 20,
        }}
      >
        {list.map((b, i) => (
          <Bubble key={b.id} spec={b} tucked={tucked} index={i + (side === 'right' ? 1 : 0)} />
        ))}
      </View>
    );
  };
  return (
    <>
      {column('left')}
      {column('right')}
    </>
  );
}
