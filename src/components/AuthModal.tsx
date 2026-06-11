import { Modal, Text, TouchableOpacity, View } from 'react-native';

import Auth from '../screens/Auth';
import type { Language } from '../types';

interface AuthModalProps {
  visible: boolean;
  isDarkMode: boolean;
  language: Language;
  onClose: () => void;
}

/** Full-screen overlay hosting the sign-in / sign-up form. */
export function AuthModal({ visible, isDarkMode, language, onClose }: AuthModalProps) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.7)',
        }}
      >
        <View
          style={{
            width: '90%',
            maxWidth: 400,
            backgroundColor: isDarkMode ? '#1e293b' : '#fff',
            borderRadius: 24,
            padding: 10,
          }}
        >
          <TouchableOpacity style={{ alignSelf: 'flex-end', padding: 10 }} onPress={onClose}>
            <Text
              style={{ color: isDarkMode ? '#fff' : '#1e293b', fontWeight: 'bold', fontSize: 18 }}
            >
              X
            </Text>
          </TouchableOpacity>
          <Auth language={language} onAuthSuccess={onClose} />
        </View>
      </View>
    </Modal>
  );
}
