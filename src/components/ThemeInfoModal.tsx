import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeftRight, X } from 'lucide-react-native';

import type { Language, Theme } from '../types';
import { pickLabel, tr } from '../i18n';
import { getThemeDescription } from '../i18n/themeDescriptions';

interface ThemeInfoModalProps {
  theme: Theme | null;
  isDarkMode: boolean;
  language: Language;
  onClose: () => void;
}

/** Explains what a ranking theme measures and how its ranks are ordered. */
export function ThemeInfoModal({ theme, isDarkMode, language, onClose }: ThemeInfoModalProps) {
  return (
    <Modal visible={!!theme} animationType="fade" transparent onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: 20,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 350,
            backgroundColor: isDarkMode ? '#1e293b' : '#fff',
            borderRadius: 24,
            padding: 25,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.3,
            shadowRadius: 20,
            elevation: 10,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 32 }}>{theme?.emoji}</Text>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: '900',
                  color: isDarkMode ? '#fff' : '#1e293b',
                  flexShrink: 1,
                }}
              >
                {theme && pickLabel(theme.label, language)}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 5 }}>
              <X color={isDarkMode ? '#94a3b8' : '#64748b'} size={24} />
            </TouchableOpacity>
          </View>

          <Text
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: isDarkMode ? '#cbd5e1' : '#475569',
              marginBottom: 20,
            }}
          >
            {theme && getThemeDescription(theme.id, language)}
          </Text>

          <View
            style={{
              backgroundColor: isDarkMode ? '#0f172a' : '#f1f5f9',
              padding: 15,
              borderRadius: 15,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <ArrowLeftRight size={18} color="#3b82f6" />
            <Text
              style={{
                fontSize: 12,
                fontWeight: 'bold',
                color: isDarkMode ? '#94a3b8' : '#64748b',
                flex: 1,
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
              backgroundColor: '#3b82f6',
              paddingVertical: 14,
              borderRadius: 14,
              alignItems: 'center',
              marginTop: 20,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
