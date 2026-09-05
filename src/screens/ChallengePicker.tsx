/**
 * Quiz chooser for the "Quiz Pays" (challenge) mode — the country quizzes of
 * src/data/challenges.ts, grouped by country.
 *
 * The solo hub reaches these quizzes through RegionCountryPicker (each country
 * lists its own). The builders can't: a custom online round or a local parcours
 * round has to name ONE quiz up front, without the map-country selection that
 * picker is built around. Hence this small standalone list, shared by both.
 */
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ChevronRight } from 'lucide-react-native';

import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton, ICON_HIT_SLOP } from '../lib/a11y';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { challengesByCountry, countryLabel, type Challenge } from '../data/challenges';

interface ChallengePickerProps {
  onPick: (challenge: Challenge) => void;
  onBack: () => void;
  title?: string;
}

export default function ChallengePicker({ onPick, onBack, title }: ChallengePickerProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const groups = challengesByCountry();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={onBack} hitSlop={ICON_HIT_SLOP} {...a11yButton(tr(language, 'Retour', 'Back'))}>
          <ArrowLeft color={c.text} size={22} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]} numberOfLines={1}>
          {title ?? tr(language, 'Quiz de la manche', 'Round quiz')}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 18 }}>
        {groups.map((g) => (
          <View key={g.country} style={{ gap: 8 }}>
            <Text style={[styles.groupTitle, { color: c.textMuted }]}>
              {g.emoji} {countryLabel(g.country, language).toUpperCase()}
            </Text>
            {g.items.map((ch) => (
              <TouchableOpacity
                key={ch.id}
                onPress={() => onPick(ch)}
                style={[styles.row, { backgroundColor: c.card, borderColor: c.border }]}
                {...a11yButton(tr(language, ch.titleFr, ch.titleEn), {
                  hint: tr(language, ch.subtitleFr, ch.subtitleEn),
                })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: c.text }]} numberOfLines={1}>
                    {tr(language, ch.titleFr, ch.titleEn)}
                  </Text>
                  <Text style={[styles.rowSub, { color: c.textFaint }]} numberOfLines={1}>
                    {tr(language, ch.subtitleFr, ch.subtitleEn)}
                  </Text>
                </View>
                <ChevronRight color={c.textFaint} size={18} />
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontFamily: FONTS.headingBlack, marginHorizontal: 12 },
  groupTitle: { fontFamily: FONTS.monoBold, fontSize: 12, letterSpacing: 0.5 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
  },
  rowTitle: { fontFamily: FONTS.monoBold, fontSize: 14 },
  rowSub: { fontFamily: FONTS.mono, fontSize: 11, marginTop: 2 },
});
