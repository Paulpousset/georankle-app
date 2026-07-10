import { KeyboardAvoidingView, Modal, Platform, ScrollView, TouchableOpacity, View } from 'react-native';
import { X } from 'lucide-react-native';

import Auth from '../screens/Auth';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AuthModal({ visible, onClose }: AuthModalProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16,
            backgroundColor: 'rgba(0,0,0,0.7)',
          }}
          keyboardShouldPersistTaps="handled"
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
              <X color={c.textMuted} size={20} />
            </TouchableOpacity>
            <Auth language={language} onAuthSuccess={onClose} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
