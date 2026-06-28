import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Home, Moon, Sun } from 'lucide-react-native';

import { OnlineModeLeaderboard } from '../screens/OnlineModeLeaderboard';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton, ICON_HIT_SLOP } from '../lib/a11y';
import type { MatchMode } from '../types';

const MODE_LABELS: Record<MatchMode, [string, string]> = {
  classic: ['Rankle', 'Rankle'],
  streak: ['Mode Streak', 'Streak Mode'],
  versus: ['Mode Versus', 'Versus Mode'],
  globe: ['Globe Géo', 'Geo Globe'],
  guess: ['Devine le Pays', 'Guess Country'],
};

interface Props {
  mode: MatchMode | null;
  accent: string;
  onClose: () => void;
  onOpenPlayer?: (userId: string, username?: string | null) => void;
}

export function OnlineModeLeaderboardModal({ mode, accent, onClose, onOpenPlayer }: Props) {
  const { isDarkMode, toggleTheme } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const labels = mode ? MODE_LABELS[mode] : ['', ''];

  return (
    <Modal visible={!!mode} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: c.background }}>
          <SafeAreaView style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 20,
                paddingVertical: 15,
                borderBottomWidth: 1,
                borderBottomColor: c.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={onClose}
                  style={{ padding: 8, marginRight: 10, backgroundColor: c.surface, borderRadius: 10 }}
                  hitSlop={ICON_HIT_SLOP}
                  {...a11yButton(tr(language, 'Fermer', 'Close'))}
                >
                  <Home color={accent} size={20} />
                </TouchableOpacity>
                <View>
                  <Text style={{ fontSize: 20, fontFamily: FONTS.headingBlack, color: c.text }}>
                    {tr(language, labels[0], labels[1])}
                  </Text>
                  <Text style={{ fontSize: 10, fontFamily: FONTS.mono, color: c.textFaint }}>
                    {tr(language, '% de victoires en ligne', 'online win rate')}
                  </Text>
                </View>
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

            {mode && (
              <OnlineModeLeaderboard
                mode={mode}
                accent={accent}
                onOpenPlayer={onOpenPlayer}
              />
            )}
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}
