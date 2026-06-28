import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Home, Moon, Sun } from 'lucide-react-native';

import Leaderboard from '../screens/Leaderboard';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton, ICON_HIT_SLOP } from '../lib/a11y';

interface LeaderboardModalProps {
  visible: boolean;
  onClose: () => void;
  onOpenPlayer?: (userId: string, username?: string | null) => void;
}

export function LeaderboardModal({
  visible,
  onClose,
  onOpenPlayer,
}: LeaderboardModalProps) {
  const { isDarkMode, toggleTheme } = useTheme();
  const { language } = useLanguage();
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
                hitSlop={ICON_HIT_SLOP}
                {...a11yButton(tr(language, 'Fermer', 'Close'))}
              >
                <Home color={c.accent} size={20} />
              </TouchableOpacity>
              <Text style={{ fontSize: 24, fontFamily: FONTS.headingBlack, color: c.text }}>
                {tr(language, 'Classement', 'Leaderboard')}
              </Text>
            </View>

            <TouchableOpacity
              onPress={toggleTheme}
              style={{ padding: 8, backgroundColor: c.surface, borderRadius: 10 }}
              hitSlop={ICON_HIT_SLOP}
              {...a11yButton(
                isDarkMode
                  ? tr(language, 'Mode clair', 'Light mode')
                  : tr(language, 'Mode sombre', 'Dark mode'),
              )}
            >
              {isDarkMode ? <Sun color="#c4872a" size={20} /> : <Moon color="#4a6a88" size={20} />}
            </TouchableOpacity>
          </View>
          <Leaderboard onOpenPlayer={onOpenPlayer} />
        </SafeAreaView>
      </View>
      </SafeAreaProvider>
    </Modal>
  );
}
