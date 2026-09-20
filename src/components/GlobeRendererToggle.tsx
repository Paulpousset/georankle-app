/**
 * <GlobeRendererToggle> — the in-game « 3D / Basique » switch of the globe
 * games (Paul, 20/09/2026: « permet de choisir entre style 3D ou style basique,
 * un switch visible pendant le jeu »).
 *
 * 3D = the worn shop globe in WebGL (texture, relief, Cartoon HD shading);
 * Basique = the flat Canvas-2D globe in the skin's colours — lighter, and the
 * proven renderer on weak devices. Switching rebuilds the globe page, so the
 * caller disables it outside the playing phase (a reload would wipe a reveal).
 */
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { tr } from '../i18n';
import { a11yButton } from '../lib/a11y';
import type { GlobeRenderer } from '../lib/globeSkin';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';

interface GlobeRendererToggleProps {
  value: GlobeRenderer;
  onChange: (r: GlobeRenderer) => void;
  disabled?: boolean;
}

export function GlobeRendererToggle({ value, onChange, disabled = false }: GlobeRendererToggleProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const options: { key: GlobeRenderer; label: string }[] = [
    { key: '3d', label: tr(language, '3D', '3D') },
    { key: 'basic', label: tr(language, 'Basique', 'Basic') },
  ];
  return (
    <View
      style={[styles.pill, { borderColor: c.border, backgroundColor: c.background, opacity: disabled ? 0.35 : 1 }]}
      accessibilityRole="radiogroup"
      accessibilityLabel={tr(language, 'Style du globe', 'Globe style')}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <TouchableOpacity
            key={o.key}
            onPress={() => {
              if (!on) onChange(o.key);
            }}
            disabled={disabled}
            style={[styles.seg, on && { backgroundColor: c.accent }]}
            {...a11yButton(
              o.key === '3d'
                ? tr(language, 'Globe 3D', '3D globe')
                : tr(language, 'Globe basique', 'Basic globe'),
              { selected: on },
            )}
          >
            <Text style={[styles.segText, { color: on ? '#fff' : c.textMuted }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, padding: 2 },
  seg: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  segText: { fontSize: 11, fontFamily: FONTS.monoBold },
});
