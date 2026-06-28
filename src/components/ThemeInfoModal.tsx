import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeftRight, X } from 'lucide-react-native';

import type { Theme } from '../types';
import { ThemeIcon } from './themeIcons';
import { pickLabel, tr } from '../i18n';
import { getThemeDescription } from '../i18n/themeDescriptions';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { a11yButton, a11yImage } from '../lib/a11y';

interface ThemeInfoModalProps {
  theme: Theme | null;
  onClose: () => void;
}

export function ThemeInfoModal({ theme, onClose }: ThemeInfoModalProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  return (
    <Modal visible={!!theme} animationType="fade" transparent onRequestClose={onClose}>
      <View
        style={{
          flex: 1, justifyContent: 'center', alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.8)', padding: 20,
        }}
      >
        <View
          style={{
            width: '100%', maxWidth: 350,
            backgroundColor: c.card,
            borderRadius: 24, padding: 25,
            borderWidth: 1, borderColor: c.border,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.3, shadowRadius: 20, elevation: 10,
          }}
        >
          <View
            style={{
              flexDirection: 'row', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 20,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View {...a11yImage(theme ? pickLabel(theme.label, language) : '')}>
                {theme && <ThemeIcon id={theme.id} color={c.accent} size={30} />}
              </View>
              <Text
                style={{
                  fontSize: 18, fontFamily: FONTS.headingBlack,
                  color: c.text, flexShrink: 1,
                }}
              >
                {theme && pickLabel(theme.label, language)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={{ padding: 10 }}
              accessibilityRole="button"
              accessibilityLabel={language === 'fr' ? 'Fermer' : 'Close'}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X color={c.textMuted} size={24} />
            </TouchableOpacity>
          </View>

          <Text
            style={{
              fontSize: 15, lineHeight: 22,
              fontFamily: FONTS.mono,
              color: c.textMuted, marginBottom: 20,
            }}
          >
            {theme && getThemeDescription(theme.id, language)}
          </Text>

          <View
            style={{
              backgroundColor: c.surface,
              padding: 15, borderRadius: 15,
              borderWidth: 1, borderColor: c.border,
              flexDirection: 'row', alignItems: 'center', gap: 10,
            }}
          >
            <ArrowLeftRight size={18} color={c.accent} />
            <Text
              style={{
                fontSize: 12, fontFamily: FONTS.mono,
                color: c.textMuted, flex: 1,
              }}
            >
              {tr(
                language,
                'Le rang #1 représente la valeur la plus élevée pour ce thème.',
                'Rank #1 represents the highest value for this theme.',
              )}
            </Text>
          </View>

          <TouchableOpacity
            onPress={onClose}
            style={{
              backgroundColor: c.accent,
              paddingVertical: 14, borderRadius: 14,
              alignItems: 'center', marginTop: 20,
            }}
            {...a11yButton('OK')}
          >
            <Text style={{ color: '#fff', fontFamily: FONTS.monoBold }}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
