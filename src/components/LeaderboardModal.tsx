import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Home, Moon, Sun } from 'lucide-react-native';

import Leaderboard from '../screens/Leaderboard';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import type { Language } from '../types';
import { tr } from '../i18n';

interface LeaderboardModalProps {
  visible: boolean;
  isDarkMode: boolean;
  language: Language;
  onClose: () => void;
  onToggleTheme: () => void;
}

export function LeaderboardModal({
  visible,
  isDarkMode,
  language,
  onClose,
  onToggleTheme,
}: LeaderboardModalProps) {
  const c = getColors(isDarkMode);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <SafeAreaView style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 20, paddingVertical: 15,
              borderBottomWidth: 1, borderBottomColor: c.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                onPress={onClose}
                style={{ padding: 8, marginRight: 10, backgroundColor: c.surface, borderRadius: 10 }}
              >
                <Home color={c.accent} size={20} />
              </TouchableOpacity>
              <Text style={{ fontSize: 24, fontFamily: FONTS.headingBlack, color: c.text }}>
                {tr(language, 'Classement', 'Leaderboard')}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onToggleTheme}
              style={{ padding: 8, backgroundColor: c.surface, borderRadius: 10 }}
            >
              {isDarkMode ? <Sun color="#c4872a" size={20} /> : <Moon color="#4a6a88" size={20} />}
            </TouchableOpacity>
          </View>
          <Leaderboard language={language} isDarkMode={isDarkMode} />
        </SafeAreaView>
      </View>
      </SafeAreaProvider>
    </Modal>
  );
}
