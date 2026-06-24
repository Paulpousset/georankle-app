import { Modal, Text, TouchableOpacity, View } from 'react-native';

import Auth from '../screens/Auth';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import type { Language } from '../types';

interface AuthModalProps {
  visible: boolean;
  isDarkMode: boolean;
  language: Language;
  onClose: () => void;
}

export function AuthModal({ visible, isDarkMode, language, onClose }: AuthModalProps) {
  const c = getColors(isDarkMode);
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View
        style={{
          flex: 1, justifyContent: 'center', alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.7)',
        }}
      >
        <View
          style={{
            width: '90%', maxWidth: 400,
            backgroundColor: c.card,
            borderRadius: 24, padding: 10,
            borderWidth: 1, borderColor: c.border,
          }}
        >
          <TouchableOpacity
            style={{ alignSelf: 'flex-end', padding: 12 }}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={language === 'fr' ? 'Fermer' : 'Close'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ color: c.textMuted, fontFamily: FONTS.monoBold, fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
          <Auth language={language} onAuthSuccess={onClose} />
        </View>
      </View>
    </Modal>
  );
}
