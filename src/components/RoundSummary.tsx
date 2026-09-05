import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ChevronRight, Trophy } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { isSmallScreen } from '../theme/spacing';
import { formatMatchScore } from '../lib/match';
import { a11yButton, announce } from '../lib/a11y';
import { ScoreText } from './ScoreText';
import { useStageWidth } from '../lib/stage';
import { useEventCallback } from '../lib/useEventCallback';
import { tr } from '../i18n';

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
   * Cumulative normalized points across all rounds so far (0–1000 per round).
   * Used as the match tiebreaker when rounds won are equal.
   */
  myTotalScore?: number;
  opponentTotalScore?: number;
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
  const width = useStageWidth();
  const [countdown, setCountdown] = useState(5);
  const c = getColors(isDarkMode);

  // On tight screens shrink the outer padding and card padding so the score
  // panel never overflows; cap the card width to the available space.
  const small = isSmallScreen(width);
  const screenPad = small ? 16 : 24;
  const cardPad = small ? 16 : 24;
  const cardMaxW = Math.min(360, width - screenPad * 2);

  const roundWinner =
    data.myScore > data.opponentScore ? 'me' : data.myScore < data.opponentScore ? 'opponent' : 'draw';

  // Prefer the mode carried by the round itself; fall back to the prop for
  // safety. This keeps the unit correct even in ranked, where the round's mode
  // differs from the match's base mode.
  const scoreLabel = (s: number) => formatMatchScore(data.gameMode ?? gameMode, s);

  // `onContinue` vient de useMatchEngine via Router : nouvelle identité à chaque
  // rendu. Le laisser en dépendance réarmait la seconde en cours, donc le
  // décompte pouvait ne jamais atteindre zéro et la manche suivante ne jamais
  // démarrer. On stabilise l'identité sans figer la closure.
  const continueStable = useEventCallback(onContinue);
  useEffect(() => {
    if (countdown <= 0) { continueStable(); return; }
    const t = setTimeout(() => setCountdown(cv => cv - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, continueStable]);

  const neededToWin = Math.ceil(data.bestOf / 2);

  const winnerLabel = () => {
    if (roundWinner === 'draw') return tr(language, 'Égalité', 'Draw');
    if (roundWinner === 'me') return tr(language, 'Vous gagnez ce round !', 'You win this round!');
    return tr(language, 'L\'adversaire gagne ce round', 'Opponent wins this round');
  };

  // Announce the round outcome and score for screen-reader users when the
  // summary data is set.
  useEffect(() => {
    const score = tr(language, '{0} contre {1}', '{0} to {1}', [scoreLabel(data.myScore), scoreLabel(data.opponentScore)]);
    announce(`${winnerLabel()}, ${score}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, language]);

  const winnerColor = roundWinner === 'me' ? '#2a6e3f' : roundWinner === 'opponent' ? '#8b1a1a' : '#c4872a';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', padding: screenPad }}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      <Text style={{ color: c.textFaint, fontSize: 13, fontFamily: FONTS.monoBold, letterSpacing: 2, marginBottom: 8 }}>
        {`ROUND ${data.roundNumber} / ${data.bestOf}`}
      </Text>
      <Text style={{ color: winnerColor, fontSize: 22, fontFamily: FONTS.headingBlack, marginBottom: 32, textAlign: 'center' }}>
        {winnerLabel()}
      </Text>

      <View style={{ backgroundColor: c.card, borderRadius: 20, padding: cardPad, width: '100%', maxWidth: cardMaxW, borderWidth: 1, borderColor: c.border, marginBottom: 28 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }}>
          <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <Text style={{ color: c.textFaint, fontSize: 11, fontFamily: FONTS.monoBold }} numberOfLines={1}>
              {tr(language, 'VOUS', 'YOU')}
            </Text>
            <ScoreText
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ color: roundWinner === 'me' ? '#2a6e3f' : c.text, fontSize: 40, fontFamily: FONTS.headingBlack }}
            >
              {scoreLabel(data.myScore)}
            </ScoreText>
            {roundWinner === 'me' && <Trophy size={16} color="#c4872a" />}
          </View>

          <Text style={{ color: c.textFaint, fontSize: 15, fontFamily: FONTS.mono, marginHorizontal: 8 }}>vs</Text>

          <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <Text style={{ color: c.textFaint, fontSize: 11, fontFamily: FONTS.monoBold }} numberOfLines={1}>
              {tr(language, 'ADVERSAIRE', 'OPPONENT')}
            </Text>
            <ScoreText
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ color: roundWinner === 'opponent' ? '#8b1a1a' : c.text, fontSize: 40, fontFamily: FONTS.headingBlack }}
            >
              {scoreLabel(data.opponentScore)}
            </ScoreText>
            {roundWinner === 'opponent' && <Trophy size={16} color="#c4872a" />}
          </View>
        </View>
      </View>

      <View style={{ alignItems: 'center', marginBottom: 36 }}>
        <Text style={{ color: c.textFaint, fontSize: 12, fontFamily: FONTS.monoBold, letterSpacing: 1, marginBottom: 8 }}>
          {tr(language, 'SÉRIE', 'SERIES')}
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
        {...a11yButton(tr(language, 'Round suivant', 'Next round'))}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: c.accentStrong,
          paddingVertical: 16, paddingHorizontal: 32, borderRadius: 14,
          width: '100%', maxWidth: cardMaxW, justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontFamily: FONTS.monoBold, fontSize: 16 }}>
          {tr(language, 'Round suivant ({0}s)', 'Next round ({0}s)', [countdown])}
        </Text>
        <ChevronRight color="#fff" size={20} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
