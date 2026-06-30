import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { formatMatchScore } from '../lib/match';
import { a11yButton, announce } from '../lib/a11y';
import { ScoreText } from './ScoreText';

interface WaitingOpponentProps {
  myScore: number;
  gameMode: string;
  /** Called when the player chooses to abandon while waiting. */
  onLeave?: () => void;
}

// After this delay we surface a "leave match" escape hatch so the player is
// never stuck forever if the opponent disconnected.
const LEAVE_BUTTON_DELAY_MS = 30_000;

export function WaitingOpponent({ myScore, gameMode, onLeave }: WaitingOpponentProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const [canLeave, setCanLeave] = useState(false);

  useEffect(() => {
    if (!onLeave) return;
    const t = setTimeout(() => setCanLeave(true), LEAVE_BUTTON_DELAY_MS);
    return () => clearTimeout(t);
  }, [onLeave]);

  // Let screen-reader users know the round is over and we're waiting on the
  // opponent (this screen otherwise has no focusable element to convey it).
  useEffect(() => {
    announce(language === 'fr' ? "En attente de l'adversaire" : 'Waiting for opponent');
  }, [language]);

  // Label and value must both follow the mode actually being played. Only
  // `classic` is scored as efficiency; `streak` is a count; everything else is
  // points. Formatting the value goes through the shared `formatMatchScore` so
  // the unit can never drift from the other match screens.
  const scoreLabel =
    gameMode === 'streak'
      ? language === 'fr' ? 'Série' : 'Streak'
      : gameMode === 'classic'
        ? language === 'fr' ? 'Efficacité' : 'Efficiency'
        : language === 'fr' ? 'Points' : 'Points';

  const scoreDisplay = formatMatchScore(gameMode, myScore);

  const confirmLeave = () => {
    Alert.alert(
      language === 'fr' ? 'Quitter la partie ?' : 'Leave the match?',
      language === 'fr'
        ? "L'adversaire semble absent. Tu peux quitter et revenir au menu."
        : 'The opponent seems away. You can leave and return to the menu.',
      [
        { text: language === 'fr' ? 'Continuer d’attendre' : 'Keep waiting', style: 'cancel' },
        { text: language === 'fr' ? 'Quitter' : 'Leave', style: 'destructive', onPress: onLeave },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', gap: 32 }}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      <View style={{ alignItems: 'center', gap: 12 }}>
        <ScoreText
          numberOfLines={1}
          adjustsFontSizeToFit
          accessibilityLabel={language === 'fr' ? `Ton score : ${scoreDisplay}` : `Your score: ${scoreDisplay}`}
          style={{ fontSize: 48, fontFamily: FONTS.headingBlack, color: '#2a6e3f' }}
        >
          {scoreDisplay}
        </ScoreText>
        <Text style={{ color: c.textMuted, fontSize: 14, fontFamily: FONTS.mono }}>{scoreLabel}</Text>
      </View>

      <View style={{ alignItems: 'center', gap: 16 }}>
        <ActivityIndicator size="large" color={c.accent} />
        <Text style={{ color: c.text, fontSize: 16, fontFamily: FONTS.mono }}>
          {language === 'fr' ? "En attente de l'adversaire…" : 'Waiting for opponent…'}
        </Text>
      </View>

      {onLeave && canLeave && (
        <TouchableOpacity
          onPress={confirmLeave}
          {...a11yButton(language === 'fr' ? 'Quitter la partie' : 'Leave the match')}
          style={{
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
          }}
        >
          <Text style={{ color: c.textMuted, fontFamily: FONTS.monoBold, fontSize: 13 }}>
            {language === 'fr' ? 'Quitter' : 'Leave match'}
          </Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}
