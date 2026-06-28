import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ChevronRight, Trophy } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { formatMatchScore } from '../lib/match';
import { a11yButton, announce } from '../lib/a11y';
import { ScoreText } from './ScoreText';

export interface RoundSummaryData {
  roundNumber: number;
  myScore: number;
  opponentScore: number;
  myRoundsWon: number;
  opponentRoundsWon: number;
  bestOf: number;
  isMatchOver: boolean;
  matchWinner: 'me' | 'opponent' | 'draw' | null;
  /**
   * The game mode this round was actually played in. In ranked matches every
   * round uses a different mode, so the score unit must follow the round, not
   * the match's base `game_mode` (which is only the first round's mode).
   */
  gameMode: string;
}

interface RoundSummaryProps {
  data: RoundSummaryData;
  gameMode: string;
  onContinue: () => void;
}

export function RoundSummary({ data, gameMode, onContinue }: RoundSummaryProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const [countdown, setCountdown] = useState(5);
  const c = getColors(isDarkMode);

  const roundWinner =
    data.myScore > data.opponentScore ? 'me' : data.myScore < data.opponentScore ? 'opponent' : 'draw';

  // Prefer the mode carried by the round itself; fall back to the prop for
  // safety. This keeps the unit correct even in ranked, where the round's mode
  // differs from the match's base mode.
  const scoreLabel = (s: number) => formatMatchScore(data.gameMode ?? gameMode, s);

  useEffect(() => {
    if (countdown <= 0) { onContinue(); return; }
    const t = setTimeout(() => setCountdown(cv => cv - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, onContinue]);

  const neededToWin = Math.ceil(data.bestOf / 2);

  const winnerLabel = () => {
    if (roundWinner === 'draw') return language === 'fr' ? 'Égalité' : 'Draw';
    if (roundWinner === 'me') return language === 'fr' ? 'Vous gagnez ce round !' : 'You win this round!';
    return language === 'fr' ? "L'adversaire gagne ce round" : 'Opponent wins this round';
  };

  // Announce the round outcome and score for screen-reader users when the
  // summary data is set.
  useEffect(() => {
    const score = language === 'fr'
      ? `${scoreLabel(data.myScore)} contre ${scoreLabel(data.opponentScore)}`
      : `${scoreLabel(data.myScore)} to ${scoreLabel(data.opponentScore)}`;
    announce(`${winnerLabel()}, ${score}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, language]);

  const winnerColor = roundWinner === 'me' ? '#2a6e3f' : roundWinner === 'opponent' ? '#8b1a1a' : '#c4872a';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      <Text style={{ color: c.textFaint, fontSize: 13, fontFamily: FONTS.monoBold, letterSpacing: 2, marginBottom: 8 }}>
        {`ROUND ${data.roundNumber} / ${data.bestOf}`}
      </Text>
      <Text style={{ color: winnerColor, fontSize: 22, fontFamily: FONTS.headingBlack, marginBottom: 32, textAlign: 'center' }}>
        {winnerLabel()}
      </Text>

      <View style={{ backgroundColor: c.card, borderRadius: 20, padding: 24, width: '100%', maxWidth: 360, borderWidth: 1, borderColor: c.border, marginBottom: 28 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ color: c.textFaint, fontSize: 11, fontFamily: FONTS.monoBold }}>
              {language === 'fr' ? 'VOUS' : 'YOU'}
            </Text>
            <ScoreText style={{ color: roundWinner === 'me' ? '#2a6e3f' : c.text, fontSize: 40, fontFamily: FONTS.headingBlack }}>
              {scoreLabel(data.myScore)}
            </ScoreText>
            {roundWinner === 'me' && <Trophy size={16} color="#c4872a" />}
          </View>

          <Text style={{ color: c.textFaint, fontSize: 15, fontFamily: FONTS.mono }}>vs</Text>

          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ color: c.textFaint, fontSize: 11, fontFamily: FONTS.monoBold }}>
              {language === 'fr' ? 'ADVERSAIRE' : 'OPPONENT'}
            </Text>
            <ScoreText style={{ color: roundWinner === 'opponent' ? '#8b1a1a' : c.text, fontSize: 40, fontFamily: FONTS.headingBlack }}>
              {scoreLabel(data.opponentScore)}
            </ScoreText>
            {roundWinner === 'opponent' && <Trophy size={16} color="#c4872a" />}
          </View>
        </View>
      </View>

      <View style={{ alignItems: 'center', marginBottom: 36 }}>
        <Text style={{ color: c.textFaint, fontSize: 12, fontFamily: FONTS.monoBold, letterSpacing: 1, marginBottom: 8 }}>
          {language === 'fr' ? 'SÉRIE' : 'SERIES'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          {Array.from({ length: neededToWin }).map((_, i) => (
            <View
              key={`me-${i}`}
              style={{
                width: 18, height: 18, borderRadius: 9,
                backgroundColor: i < data.myRoundsWon ? '#2a6e3f' : c.border,
                borderWidth: 2,
                borderColor: i < data.myRoundsWon ? '#2a6e3f' : c.textFaint,
              }}
            />
          ))}
          <Text style={{ color: c.text, fontSize: 20, fontFamily: FONTS.headingBlack }}>
            {data.myRoundsWon} – {data.opponentRoundsWon}
          </Text>
          {Array.from({ length: neededToWin }).map((_, i) => (
            <View
              key={`opp-${i}`}
              style={{
                width: 18, height: 18, borderRadius: 9,
                backgroundColor: i < data.opponentRoundsWon ? '#8b1a1a' : c.border,
                borderWidth: 2,
                borderColor: i < data.opponentRoundsWon ? '#8b1a1a' : c.textFaint,
              }}
            />
          ))}
        </View>
      </View>

      <TouchableOpacity
        onPress={onContinue}
        {...a11yButton(language === 'fr' ? 'Round suivant' : 'Next round')}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: c.accent,
          paddingVertical: 16, paddingHorizontal: 32, borderRadius: 14,
          width: '100%', maxWidth: 360, justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontFamily: FONTS.monoBold, fontSize: 16 }}>
          {language === 'fr' ? `Round suivant (${countdown}s)` : `Next round (${countdown}s)`}
        </Text>
        <ChevronRight color="#fff" size={20} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
