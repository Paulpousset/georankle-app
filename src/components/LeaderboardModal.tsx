import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Home, Moon, Sun } from 'lucide-react-native';

import Leaderboard from '../screens/Leaderboard';
import type { Language } from '../types';
import { commonStyles as styles } from '../theme/commonStyles';
import { tr } from '../i18n';

interface LeaderboardModalProps {
  visible: boolean;
  isDarkMode: boolean;
  language: Language;
  onClose: () => void;
  onToggleTheme: () => void;
}

/** Full-screen leaderboard with a header bar. */
export function LeaderboardModal({
  visible,
  isDarkMode,
  language,
  onClose,
  onToggleTheme,
}: LeaderboardModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc' }}>
        <SafeAreaView style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 15,
              borderBottomWidth: 1,
              borderBottomColor: isDarkMode ? '#1e293b' : '#e2e8f0',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                onPress={onClose}
                style={[
                  styles.refreshBtn,
                  !isDarkMode && styles.refreshBtnLight,
                  {
                    padding: 6,
                    marginRight: 10,
                    backgroundColor: isDarkMode
                      ? 'rgba(16, 185, 129, 0.1)'
                      : 'rgba(16, 185, 129, 0.05)',
                  },
                ]}
              >
                <Home color="#10b981" size={20} />
              </TouchableOpacity>
              <Text style={[styles.title, !isDarkMode && styles.titleLight, { fontSize: 24 }]}>
                {tr(language, 'Classement', 'Leaderboard')}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onToggleTheme}
              style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 8 }]}
            >
              {isDarkMode ? <Sun color="#fbbf24" size={20} /> : <Moon color="#64748b" size={20} />}
            </TouchableOpacity>
          </View>
          <Leaderboard language={language} isDarkMode={isDarkMode} />
        </SafeAreaView>
      </View>
    </Modal>
  );
}
