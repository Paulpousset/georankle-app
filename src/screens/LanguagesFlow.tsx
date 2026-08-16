/**
 * « Langues » entry point: pick the Text or Audio variant, then play.
 *
 * Only the solo path gets a choice. Every deterministic surface (daily, online,
 * story) is handed its variant by the caller, because the variant changes the
 * language pool and therefore the questions — letting each client decide would
 * desync a match. For the same reason the audio variant is gated on a feature
 * flag HERE and never inside the seeded generation: a flag fails closed when the
 * device is offline, which would silently change what a player sees.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Type, Volume2, Lock } from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';

import type { GameMode, Match } from '../types';
import type { LanguageTier, LanguageVariant } from '../data/languages';
import { useFeatureFlag } from '../lib/featureFlags';
import { getColors } from '../theme/colors';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton, ICON_HIT_SLOP } from '../lib/a11y';
import LanguagesGame from './LanguagesGame';

interface LanguagesFlowProps {
  setGameMode: (mode: GameMode) => void;
  user: User | null;
  /** Set by daily / online / story — skips the picker entirely. */
  variant?: LanguageVariant;
  matchData?: Match | null;
  onRoundComplete?: (score: number) => void;
  maxTier?: LanguageTier;
  dailySeed?: number;
  onDailyComplete?: (score: number, grid?: string) => void;
  isDaily?: boolean;
  onShare?: () => void;
  onDailyScoreChange?: (score: number) => void;
}

export default function LanguagesFlow({
  setGameMode,
  user,
  variant,
  matchData,
  onRoundComplete,
  maxTier,
  dailySeed,
  onDailyComplete,
  isDaily,
  onShare,
  onDailyScoreChange,
}: LanguagesFlowProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const audioEnabled = useFeatureFlag('languages_audio');

  // A caller-supplied variant (daily, match, story level) wins over the picker.
  const imposed = variant ?? (isDaily || matchData ? 'text' : undefined);
  const [picked, setPicked] = useState<LanguageVariant | null>(null);
  const active = imposed ?? picked;

  if (active) {
    return (
      <LanguagesGame
        setGameMode={setGameMode}
        user={user}
        variant={active}
        matchData={matchData}
        onRoundComplete={onRoundComplete}
        maxTier={maxTier}
        dailySeed={dailySeed}
        onDailyComplete={onDailyComplete}
        isDaily={isDaily}
        onShare={onShare}
        onDailyScoreChange={onDailyScoreChange}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={() => setGameMode('menu')}
          hitSlop={ICON_HIT_SLOP}
          {...a11yButton(tr(language, 'Retour', 'Back'))}
        >
          <ArrowLeft color={c.text} size={22} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]}>
          {tr(language, 'Langues', 'Languages')}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.lead, { color: c.textMuted }]}>
          {tr(
            language,
            'Devine la langue. Comment veux-tu jouer ?',
            'Name the language. How do you want to play?',
          )}
        </Text>

        <TouchableOpacity
          style={[styles.variantCard, { backgroundColor: c.card, borderColor: c.accent }]}
          onPress={() => setPicked('text')}
          {...a11yButton(tr(language, 'Variante écrite', 'Written variant'), {
            hint: tr(language, 'Une phrase à lire', 'A phrase to read'),
          })}
        >
          <Type color={c.accent} size={30} />
          <View style={styles.variantText}>
            <Text style={[styles.variantTitle, { color: c.text }]}>
              {tr(language, 'À l’écrit', 'Written')}
            </Text>
            <Text style={[styles.variantSub, { color: c.textMuted }]}>
              {tr(language, 'Lis la phrase et reconnais la langue.', 'Read the phrase and name the language.')}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.variantCard,
            { backgroundColor: c.card, borderColor: audioEnabled ? c.accent : c.border },
            !audioEnabled && styles.disabled,
          ]}
          onPress={() => audioEnabled && setPicked('audio')}
          disabled={!audioEnabled}
          {...a11yButton(tr(language, 'Variante audio', 'Audio variant'), {
            hint: audioEnabled
              ? tr(language, 'Un extrait à écouter', 'A clip to listen to')
              : tr(language, 'Bientôt disponible', 'Coming soon'),
          })}
        >
          {audioEnabled ? <Volume2 color={c.accent} size={30} /> : <Lock color={c.textMuted} size={30} />}
          <View style={styles.variantText}>
            <Text style={[styles.variantTitle, { color: audioEnabled ? c.text : c.textMuted }]}>
              {tr(language, 'À l’oreille', 'By ear')}
            </Text>
            <Text style={[styles.variantSub, { color: c.textMuted }]}>
              {audioEnabled
                ? tr(language, 'Écoute l’extrait et reconnais la langue.', 'Listen to the clip and name the language.')
                : tr(language, 'Bientôt disponible.', 'Coming soon.')}
            </Text>
          </View>
        </TouchableOpacity>
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
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontFamily: FONTS.headingBlack, marginHorizontal: 12 },
  body: { padding: 20, gap: 14, maxWidth: 520, width: '100%', alignSelf: 'center' },
  lead: { fontFamily: FONTS.mono, fontSize: 14, textAlign: 'center', marginBottom: 8 },
  variantCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    padding: 20, borderRadius: 20, borderWidth: 2,
  },
  disabled: { opacity: 0.55 },
  variantText: { flex: 1 },
  variantTitle: { fontSize: 18, fontFamily: FONTS.headingBlack },
  variantSub: { fontSize: 13, fontFamily: FONTS.mono, marginTop: 4 },
});
