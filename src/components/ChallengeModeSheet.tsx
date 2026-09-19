/**
 * <ChallengeModeSheet> — "Défier" from another player's profile: pick the
 * online mode, then the Matchmaking screen opens straight on a private match
 * against that player (see Matchmaking's `inviteFriendId`). Same mode list and
 * order as the Online tab of the main menu; Languages follows its flag.
 */
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight, Swords } from 'lucide-react-native';

import type { MatchMode } from '../types';
import { modeLabel } from '../lib/ranked';
import { useFeatureFlag } from '../lib/featureFlags';
import { tr } from '../i18n';
import { a11yButton } from '../lib/a11y';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';

/** Online duel modes, in main-menu order. */
const CHALLENGE_MODES: MatchMode[] = [
  'globe', 'regions', 'guess', 'borders', 'silhouette', 'pinpoint', 'languages',
  'higherlower', 'versus', 'classic', 'streak',
];

interface ChallengeModeSheetProps {
  visible: boolean;
  username: string;
  onClose: () => void;
  onPick: (mode: MatchMode) => void;
}

export function ChallengeModeSheet({ visible, username, onClose, onPick }: ChallengeModeSheetProps) {
  const { language } = useLanguage();
  const { isDarkMode } = useTheme();
  const c = getColors(isDarkMode);
  const languagesOn = useFeatureFlag('languages_mode');
  const modes = CHALLENGE_MODES.filter((m) => m !== 'languages' || languagesOn);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={tr(language, 'Fermer', 'Close')}>
        <Pressable
          style={[styles.sheet, { backgroundColor: c.background, borderColor: c.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: c.border }]} />
          <View style={styles.titleRow}>
            <Swords color={c.accent} size={20} />
            <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
              {tr(language, 'Défier {0}', 'Challenge {0}', [username])}
            </Text>
          </View>
          <Text style={[styles.sub, { color: c.textMuted }]}>
            {tr(language, 'Choisis le mode du duel. {0} recevra l\'invitation.', 'Pick the duel mode. {0} will get the invite.', [username])}
          </Text>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={styles.list}>
            {modes.map((mode) => (
              <TouchableOpacity
                key={mode}
                onPress={() => onPick(mode)}
                style={[styles.row, { backgroundColor: c.card, borderColor: c.border }]}
                {...a11yButton(tr(language, 'Défier en {0}', 'Challenge in {0}', [modeLabel(mode, language)]))}
              >
                <Text style={[styles.rowText, { color: c.text }]}>{modeLabel(mode, language)}</Text>
                <ChevronRight color={c.textFaint} size={18} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '78%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 560,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  title: { fontSize: 20, fontFamily: FONTS.headingBlack, flexShrink: 1 },
  sub: { fontSize: 12, fontFamily: FONTS.mono, marginBottom: 14 },
  list: { gap: 8, paddingBottom: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13,
  },
  rowText: { fontSize: 14, fontFamily: FONTS.monoBold },
});
