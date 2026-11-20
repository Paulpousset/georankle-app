import { KeyboardAvoidingView, Modal, ScrollView, TouchableOpacity, View } from 'react-native';
import { X } from 'lucide-react-native';

import Auth from '../screens/Auth';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { tr } from '../i18n';

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
  /** Which auth screen to open on: 'login' (default) or 'signup' (banner CTA). */
  initialMode?: 'login' | 'signup';
}

export function AuthModal({ visible, onClose, initialMode = 'login' }: AuthModalProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      {/* Android en edge-to-edge : adjustResize ne redimensionne plus rien, le
          clavier recouvrait le formulaire. `padding` sur les deux plateformes, et
          le voile sombre porté par le conteneur pour couvrir aussi cette marge. */}
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' }}
        behavior="padding"
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16,
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
              accessibilityLabel={tr(language, 'Fermer', 'Close')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X color={c.textMuted} size={20} />
            </TouchableOpacity>
            {/* Key on open+mode so re-opening resets Auth to the requested screen
                (its internal `mode` state otherwise persists across opens). */}
            <Auth
              key={`${visible ? 'open' : 'closed'}-${initialMode}`}
              language={language}
              onAuthSuccess={onClose}
              initialMode={initialMode}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
