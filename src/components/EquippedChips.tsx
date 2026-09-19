/**
 * <EquippedChips> — the cosmetics a player wears, one chip per equipped part
 * with its rarity colour, shown under the profile globe. It answers the
 * "what is that globe?" question a visitor asks on someone else's profile,
 * and each chip is a door: `onPressPart` opens the item in the shop (other
 * player) or the avatar editor (own profile).
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { AvatarConfig, CosmeticPart } from '../types';
import { getEquippedParts, RARITY_META } from '../data/cosmetics';
import { tr } from '../i18n';
import { a11yButton } from '../lib/a11y';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';

interface EquippedChipsProps {
  config: AvatarConfig | null;
  onPressPart?: (part: CosmeticPart) => void;
  /** Which chips are tappable (default: all when `onPressPart` is set). */
  canPress?: (part: CosmeticPart) => boolean;
  /** Accessibility verb for a chip tap ("Voir … dans la boutique" vs "Modifier …"). */
  action?: 'shop' | 'edit';
}

export function EquippedChips({ config, onPressPart, canPress, action = 'shop' }: EquippedChipsProps) {
  const { language } = useLanguage();
  const { isDarkMode } = useTheme();
  const c = getColors(isDarkMode);
  const parts = getEquippedParts(config);
  if (parts.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroll}
    >
      {parts.map((part) => {
        const name = tr(language, part.nameFr, part.nameEn);
        const rarity = RARITY_META[part.rarity];
        const label =
          action === 'shop'
            ? tr(language, 'Voir {0} dans la boutique', 'See {0} in the shop', [name])
            : tr(language, 'Modifier {0}', 'Change {0}', [name]);
        const pressable = !!onPressPart && (canPress ? canPress(part) : true);
        const Chip = pressable ? TouchableOpacity : View;
        return (
          <Chip
            key={part.id}
            onPress={pressable ? () => onPressPart!(part) : undefined}
            style={[styles.chip, { backgroundColor: c.card, borderColor: c.border }]}
            {...(pressable ? a11yButton(label) : {})}
          >
            <View style={[styles.dot, { backgroundColor: rarity.color }]} />
            <Text style={[styles.text, { color: c.textMuted }]} numberOfLines={1}>{name}</Text>
          </Chip>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { flexDirection: 'row', gap: 6, paddingHorizontal: 16 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 11, fontFamily: FONTS.mono },
});
