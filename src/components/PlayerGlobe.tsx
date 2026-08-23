/**
 * <PlayerGlobe> — le globe d'un joueur, en grand, mis en scène.
 *
 * Les 20 globes de la boutique ne se voyaient jusqu'ici qu'en vignette de 40 px
 * dans un coin d'écran : on achetait un monde qu'on ne regardait jamais. Ce
 * composant en fait la vedette des débuts et fins de partie — le globe équipé,
 * son nom, sa rareté, et (pour le joueur local) un raccourci pour en changer.
 *
 * Purement présentationnel : il ne va JAMAIS chercher de données. L'appelant
 * fournit l'`AvatarConfig` (le sien via useAuth/profile, celui de l'adversaire
 * via la ligne `profiles` déjà chargée par le lobby), ce qui le rend utilisable
 * en solo, en local et en ligne sans surcoût réseau.
 *
 * Le rendu réutilise <Avatar> pour ne pas dupliquer la cascade 3D → SVG →
 * photo → initiales : le globe montré est exactement celui de la boutique.
 */
import React, { useMemo } from 'react';
import { Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';

import { DEFAULT_AVATAR_CONFIG, RARITY_META, getPart } from '../data/cosmetics';
import type { AvatarConfig } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { a11yButton, a11yHidden } from '../lib/a11y';
import { tr } from '../i18n';
import { Avatar } from './Avatar';

export interface PlayerGlobeProps {
  config: AvatarConfig | null | undefined;
  /** Photo de profil — seulement utilisée si le joueur n'a pas de monde. */
  photoUrl?: string | null;
  username?: string | null;
  /** Diamètre du globe. 96 = lobby serré, 132 = vedette, 168 = héros solo. */
  size: number;
  /** Étiquette au-dessus : « VOUS », « ADVERSAIRE », « JOUEUR 2 »… */
  label?: string;
  /** Anneau coloré (vert = c'est vous / le gagnant). */
  accent?: string;
  /** Affiche le nom du globe équipé sous le pseudo. */
  showGlobeName?: boolean;
  /** Rend le globe tapable (→ boutique / « Globes en jeu »). */
  onPress?: () => void;
  /** Texte du raccourci sous le globe (n'apparaît qu'avec `onPress`). */
  actionLabel?: string;
  /** Anime le satellite en orbite (à réserver aux écrans calmes). */
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Le cosmétique globe porté par une config (jamais null : la Terre est gratuite). */
export function equippedGlobePart(config: AvatarConfig | null | undefined) {
  const id = config?.layers?.globe?.id ?? DEFAULT_AVATAR_CONFIG.layers.globe.id;
  return getPart('globe', id) ?? getPart('globe', DEFAULT_AVATAR_CONFIG.layers.globe.id);
}

export function PlayerGlobe({
  config,
  photoUrl = null,
  username,
  size,
  label,
  accent,
  showGlobeName = true,
  onPress,
  actionLabel,
  animate = false,
  style,
}: PlayerGlobeProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);

  // Sans config connue (cache froid, joueur déconnecté), on montre la Terre
  // gratuite : c'est ce que tout le monde porte par défaut. Laisser `null`
  // passer à <Avatar> retombait sur le rond d'initiales « ? » — une vitrine de
  // globe sans globe.
  const shown = config ?? (photoUrl ? null : DEFAULT_AVATAR_CONFIG);

  const part = useMemo(() => equippedGlobePart(config), [config]);
  const rarity = part ? RARITY_META[part.rarity] : null;
  const globeName = part ? (language === 'fr' ? part.nameFr : part.nameEn) : null;
  const ring = accent ?? (rarity?.color ?? c.border);

  // `username` absent = vitrine sans pseudo (écran solo) ; `null` = joueur
  // dont le profil n'est pas encore chargé, on garde la place de la ligne.
  const showName = username !== undefined;
  const name = username || tr(language, 'Joueur', 'Player');

  const globe = (
    <View
      style={{
        width: size + 12,
        height: size + 12,
        borderRadius: (size + 12) / 2,
        alignItems: 'center',
        justifyContent: 'center',
        // Halo à la rareté : un globe légendaire se remarque de loin.
        backgroundColor: ring + '1f',
        borderWidth: 1,
        borderColor: ring + '55',
      }}
      {...a11yHidden}
    >
      <Avatar
        config={shown}
        photoUrl={photoUrl}
        username={username}
        size={size}
        ringColor={ring}
        ringWidth={accent ? 3 : 2}
        animate={animate}
      />
    </View>
  );

  return (
    <View style={[{ alignItems: 'center', gap: 6 }, style]}>
      {label ? (
        <Text
          style={{
            color: accent ?? c.textFaint,
            fontFamily: FONTS.monoBold,
            fontSize: 10,
            letterSpacing: 1.4,
          }}
        >
          {label}
        </Text>
      ) : null}

      {onPress ? (
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.85}
          {...a11yButton(
            tr(
              language,
              `Globe de ${name}${globeName ? ` : ${globeName}` : ''}`,
              `${name}'s globe${globeName ? `: ${globeName}` : ''}`,
            ),
            { hint: actionLabel },
          )}
        >
          {globe}
        </TouchableOpacity>
      ) : (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={tr(
            language,
            `Globe de ${name}${globeName ? ` : ${globeName}` : ''}`,
            `${name}'s globe${globeName ? `: ${globeName}` : ''}`,
          )}
        >
          {globe}
        </View>
      )}

      {showName ? (
        <Text
          numberOfLines={1}
          style={{ color: c.text, fontFamily: FONTS.heading, fontSize: size >= 130 ? 17 : 14, maxWidth: size + 40 }}
        >
          {name}
        </Text>
      ) : null}

      {showGlobeName && globeName ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            borderWidth: 1,
            borderColor: (rarity?.color ?? c.border) + '77',
            backgroundColor: (rarity?.color ?? c.border) + '18',
            borderRadius: 9,
            paddingHorizontal: 8,
            paddingVertical: 2,
            maxWidth: size + 56,
          }}
          {...a11yHidden}
        >
          <View
            style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: rarity?.color ?? c.textFaint }}
          />
          <Text
            numberOfLines={1}
            style={{ color: rarity?.color ?? c.textMuted, fontFamily: FONTS.monoBold, fontSize: 10 }}
          >
            {globeName}
          </Text>
        </View>
      ) : null}

      {onPress && actionLabel ? (
        <TouchableOpacity onPress={onPress} {...a11yButton(actionLabel)} activeOpacity={0.7}>
          <Text
            style={{
              color: c.accent,
              fontFamily: FONTS.monoBold,
              fontSize: 11,
              textDecorationLine: 'underline',
            }}
          >
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
