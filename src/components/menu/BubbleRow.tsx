/**
 * Rangée de bulles de l'Accueil : quatre raccourcis ronds alignés sous le
 * titre, qui donnent une raison de revenir (« L'Impossible du jour »…).
 *
 * La rangée fait partie de la page (elle n'est plus posée par-dessus) : le
 * contenu se place toujours en dessous, quelle que soit la hauteur de l'écran.
 * Les anciennes bulles flottantes, posées à 4 % de la hauteur visible,
 * recouvraient le titre ou la carte d'inscription sur certains Android.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Text, TouchableOpacity, View } from 'react-native';
import type { ComponentType } from 'react';

import { FONTS } from '../../theme/typography';
import { a11yButton } from '../../lib/a11y';

const NATIVE = Platform.OS !== 'web';
export const BUBBLE_SIZE = 54;

export interface BubbleSpec {
  id: string;
  icon: ComponentType<{ color: string; size: number }>;
  /** Couleur de fond de la bulle. */
  color: string;
  /** Petit libellé sous la bulle. */
  label: string;
  /** Pastille en haut à droite (« 2/6 », « NEW »…), absente si vide. */
  badge?: string | null;
  /** Halo pulsé tant que la bulle attend le joueur. */
  pulse?: boolean;
  a11yLabel: string;
  onPress: () => void;
}

function Bubble({ spec, labelColor }: { spec: BubbleSpec; labelColor: string }) {
  const halo = useState(() => new Animated.Value(0))[0];

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

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={spec.onPress}
      style={{ flex: 1, alignItems: 'center', paddingTop: 6 }}
      {...a11yButton(spec.a11yLabel)}
    >
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
              opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
              transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
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
            shadowOpacity: 0.25,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 3 },
            elevation: 5,
          }}
        >
          <Icon color="#fff" size={24} />
        </View>
        {!!spec.badge && (
          <View
            style={{
              position: 'absolute',
              top: -6,
              right: -12,
              minWidth: 26,
              paddingHorizontal: 5,
              height: 20,
              borderRadius: 10,
              backgroundColor: '#fff',
              borderWidth: 2,
              borderColor: spec.color,
              alignItems: 'center',
              justifyContent: 'center',
              // Android dessine les vues « elevation » par-dessus leurs sœurs :
              // sans ça, la pastille passerait SOUS la bulle (elevation 5).
              elevation: 6,
              shadowColor: 'transparent',
            }}
          >
            <Text
              maxFontSizeMultiplier={1.2}
              style={{ fontFamily: FONTS.monoBold, fontSize: 10, color: spec.color, includeFontPadding: false }}
            >
              {spec.badge}
            </Text>
          </View>
        )}
      </View>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
        style={{
          marginTop: 6,
          fontFamily: FONTS.monoBold,
          fontSize: 10,
          color: labelColor,
          letterSpacing: 0.2,
        }}
      >
        {spec.label}
      </Text>
    </TouchableOpacity>
  );
}

/** Aligne les bulles sur une ligne, à pleine largeur, dans le flux de la page. */
export function BubbleRow({ bubbles, labelColor }: { bubbles: BubbleSpec[]; labelColor: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignSelf: 'center',
        width: '100%',
        maxWidth: 440,
        marginTop: 12,
        marginBottom: 4,
      }}
    >
      {bubbles.map((b) => (
        <Bubble key={b.id} spec={b} labelColor={labelColor} />
      ))}
    </View>
  );
}
