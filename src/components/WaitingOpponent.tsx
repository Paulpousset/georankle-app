import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import type { Language } from '../types';

interface WaitingOpponentProps {
  myScore: number;
  gameMode: string;
  isDarkMode: boolean;
  language: Language;
}

export function WaitingOpponent({ myScore, gameMode, isDarkMode, language }: WaitingOpponentProps) {
  const c = getColors(isDarkMode);

  const scoreLabel =
    gameMode === 'streak'
      ? language === 'fr' ? 'Streak' : 'Streak'
      : language === 'fr' ? 'Efficacité' : 'Efficiency';

  const scoreDisplay = gameMode === 'streak' ? `${myScore}` : `${myScore}%`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', gap: 32 }}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      <View style={{ alignItems: 'center', gap: 12 }}>
        <Text style={{ fontSize: 48, fontFamily: FONTS.headingBlack, color: '#2a6e3f' }}>{scoreDisplay}</Text>
        <Text style={{ color: c.textMuted, fontSize: 14, fontFamily: FONTS.mono }}>{scoreLabel}</Text>
      </View>

      <View style={{ alignItems: 'center', gap: 16 }}>
        <ActivityIndicator size="large" color={c.accent} />
        <Text style={{ color: c.text, fontSize: 16, fontFamily: FONTS.mono }}>
          {language === 'fr' ? "En attente de l'adversaire…" : 'Waiting for opponent…'}
        </Text>
      </View>
    </SafeAreaView>
  );
}
