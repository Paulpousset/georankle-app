import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Home } from 'lucide-react-native';

import { DailyLeaderboard } from '../screens/DailyLeaderboard';
import { dailyModeLabel, getPuzzleNumber } from '../lib/daily';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import type { GameMode, Language } from '../types';

interface Props {
  /** The daily mode to rank, or null to hide the modal. */
  mode: GameMode | null;
  accent: string;
  isDarkMode: boolean;
  language: Language;
  currentUserId?: string | null;
  onClose: () => void;
  onOpenPlayer?: (userId: string, username?: string | null) => void;
}

/** Modal showing today's per-mode daily leaderboard. */
export function DailyLeaderboardModal({
  mode,
  accent,
  isDarkMode,
  language,
  currentUserId,
  onClose,
  onOpenPlayer,
}: Props) {
  const c = getColors(isDarkMode);

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
                  accessibilityLabel={tr(language, 'Fermer', 'Close')}
                >
                  <Home color={accent} size={20} />
                </TouchableOpacity>
                <View>
                  <Text style={{ fontSize: 20, fontFamily: FONTS.headingBlack, color: c.text }}>
                    {mode ? dailyModeLabel(mode, language) : ''}
                  </Text>
                  <Text style={{ fontSize: 10, fontFamily: FONTS.mono, color: c.textFaint }}>
                    {tr(language, 'Classement du défi du jour', "Today's daily ranking")} · #{getPuzzleNumber()}
                  </Text>
                </View>
              </View>
            </View>

            {mode && (
              <DailyLeaderboard
                mode={mode}
                language={language}
                isDarkMode={isDarkMode}
                accent={accent}
                currentUserId={currentUserId}
                onOpenPlayer={onOpenPlayer}
              />
            )}
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}
