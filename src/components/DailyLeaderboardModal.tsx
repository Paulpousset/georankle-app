import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Home } from 'lucide-react-native';

import { DailyLeaderboard } from '../screens/DailyLeaderboard';
import { DailyOverallLeaderboard } from '../screens/DailyOverallLeaderboard';
import { dailyModeLabel, getPuzzleNumber } from '../lib/daily';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton, ICON_HIT_SLOP } from '../lib/a11y';
import { DesktopStage } from './DesktopStage';
import type { GameMode } from '../types';

interface Props {
  /** The daily mode to rank, 'overall' for every daily combined, or null to hide the modal. */
  mode: GameMode | 'overall' | null;
  accent: string;
  currentUserId?: string | null;
  onClose: () => void;
  onOpenPlayer?: (userId: string, username?: string | null) => void;
}

/** Modal showing today's per-mode daily leaderboard, or the combined one. */
export function DailyLeaderboardModal({
  mode,
  accent,
  currentUserId,
  onClose,
  onOpenPlayer,
}: Props) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);

  return (
    <Modal visible={!!mode} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: c.background }}>
          {/* Colonne centrée sur grand écran : la modale, sortie par un portail,
              n'hérite pas du DesktopStage de App. */}
          <DesktopStage>
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
                    {mode === 'overall'
                      ? tr(language, 'Classement général', 'Overall ranking')
                      : mode
                        ? dailyModeLabel(mode, language)
                        : ''}
                  </Text>
                  <Text style={{ fontSize: 10, fontFamily: FONTS.mono, color: c.textFaint }}>
                    {mode === 'overall'
                      ? tr(language, 'Tous les défis du jour combinés', 'Every daily challenge combined')
                      : tr(language, 'Classement du défi du jour', "Today's daily ranking")}{' '}
                    · #{getPuzzleNumber()}
                  </Text>
                </View>
              </View>
            </View>

            {mode === 'overall' && (
              <DailyOverallLeaderboard
                accent={accent}
                currentUserId={currentUserId}
                onOpenPlayer={onOpenPlayer}
              />
            )}
            {mode && mode !== 'overall' && (
              <DailyLeaderboard
                mode={mode}
                accent={accent}
                currentUserId={currentUserId}
                onOpenPlayer={onOpenPlayer}
              />
            )}
          </SafeAreaView>
          </DesktopStage>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}
