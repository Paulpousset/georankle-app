import { useEffect } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { Coins, Home, Trophy } from 'lucide-react-native';
import { AtlasPromote, AtlasDemote } from './AtlasIcons';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import type { RoundSummaryData } from './RoundSummary';
import { getRankFromElo } from '../lib/ranked';
import { computeMatchOutcome, formatMatchScore } from '../lib/match';
import { RankGlobe } from './RankGlobe';
import { a11yButton, announce } from '../lib/a11y';
import { ScoreText } from './ScoreText';

interface RankResult {
  eloChange: number;
  newElo: number;
  oldElo: number;
}

interface MatchResultProps {
  rounds: RoundSummaryData[];
  myRoundsWon: number;
  opponentRoundsWon: number;
  bestOf: number;
  gameMode: string;
  myTotalScore?: number;
  opponentTotalScore?: number;
  isRanked?: boolean;
  rankResult?: RankResult | null;
  coinsAwarded?: number | null;
  onExit: () => void;
}

export function MatchResult({
  rounds,
  myRoundsWon,
  opponentRoundsWon,
  bestOf,
  gameMode,
  myTotalScore,
  opponentTotalScore,
  isRanked = false,
  rankResult = null,
  coinsAwarded = null,
  onExit,
}: MatchResultProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);

  const { iWon, isDraw } = computeMatchOutcome(
    bestOf,
    myRoundsWon,
    opponentRoundsWon,
    myTotalScore,
    opponentTotalScore,
  );
  // Whether the series was decided on cumulative points (rounds were level).
  const decidedOnPoints =
    myRoundsWon === opponentRoundsWon &&
    myTotalScore !== undefined &&
    opponentTotalScore !== undefined &&
    myTotalScore !== opponentTotalScore;

  const resultColor = isDraw ? '#c4872a' : iWon ? '#2a6e3f' : '#8b1a1a';
  const resultText = isDraw
    ? language === 'fr' ? 'ÉGALITÉ' : 'DRAW'
    : iWon
      ? language === 'fr' ? 'VICTOIRE !' : 'VICTORY!'
      : language === 'fr' ? 'DÉFAITE' : 'DEFEAT';

  // Each round formats with the mode it was actually played in (ranked mixes
  // modes across rounds); the `gameMode` prop is only a fallback.
  const scoreLabel = (mode: string, s: number) => formatMatchScore(mode, s);

  // Tactile feedback matching the outcome when the result screen appears.
  useEffect(() => {
    Haptics.notificationAsync(
      isDraw
        ? Haptics.NotificationFeedbackType.Warning
        : iWon
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error,
    ).catch(() => {});
    // Announce the match outcome and final score for screen-reader users.
    const outcome = isDraw
      ? language === 'fr' ? 'Égalité' : 'Draw'
      : iWon
        ? language === 'fr' ? 'Victoire' : 'Victory'
        : language === 'fr' ? 'Défaite' : 'Defeat';
    const score = language === 'fr'
      ? `${myRoundsWon} à ${opponentRoundsWon}`
      : `${myRoundsWon} to ${opponentRoundsWon}`;
    announce(`${outcome}, ${score}`);
  }, [isDraw, iWon, language, myRoundsWon, opponentRoundsWon]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      <ScrollView contentContainerStyle={{ alignItems: 'center', padding: 24, gap: 24 }}>
        <View style={{ alignItems: 'center', gap: 12, marginTop: 16 }}>
          <Trophy size={56} color={resultColor} />
          <ScoreText
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ color: resultColor, fontSize: 36, fontFamily: FONTS.headingBlack, letterSpacing: 1, textAlign: 'center' }}
          >
            {resultText}
          </ScoreText>
          <ScoreText
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ color: c.text, fontSize: 48, fontFamily: FONTS.headingBlack }}
          >
            {myRoundsWon} – {opponentRoundsWon}
          </ScoreText>
          <Text style={{ color: c.textMuted, fontSize: 14, fontFamily: FONTS.mono }}>
            {`BO${bestOf} · ${language === 'fr' ? 'Série terminée' : 'Series over'}`}
          </Text>
          {myTotalScore !== undefined && opponentTotalScore !== undefined && (
            <Text style={{ color: c.textFaint, fontSize: 13, fontFamily: FONTS.mono }}>
              {`${language === 'fr' ? 'Points' : 'Points'} ${myTotalScore} – ${opponentTotalScore}`}
            </Text>
          )}
          {decidedOnPoints && (
            <Text style={{ color: resultColor, fontSize: 12, fontFamily: FONTS.monoBold, letterSpacing: 0.5 }}>
              {language === 'fr' ? 'Départagé aux points' : 'Decided on points'}
            </Text>
          )}
          {coinsAwarded != null && coinsAwarded > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Coins size={18} color="#ffd700" />
              <Text style={{ color: '#ffd700', fontSize: 18, fontFamily: FONTS.headingBlack }}>
                {`+${coinsAwarded}`}
              </Text>
              <Text style={{ color: c.textMuted, fontSize: 13, fontFamily: FONTS.mono }}>
                {language === 'fr' ? 'pièces' : 'coins'}
              </Text>
            </View>
          )}
        </View>

        {/* Ranked ELO block */}
        {isRanked && rankResult && (() => {
          const newRank = getRankFromElo(rankResult.newElo);
          const oldRank = getRankFromElo(rankResult.oldElo);
          const promoted = newRank.tier !== oldRank.tier && rankResult.eloChange > 0;
          const demoted = newRank.tier !== oldRank.tier && rankResult.eloChange < 0;
          const deltaColor = rankResult.eloChange >= 0 ? '#2a6e3f' : '#8b1a1a';
          const deltaSign = rankResult.eloChange >= 0 ? '+' : '';
          return (
            <View style={{
              width: '100%', maxWidth: 400,
              backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: newRank.color,
              padding: 20, alignItems: 'center', gap: 14,
            }}>
              <RankGlobe rank={newRank} size={72} showName language={language} spin />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ alignItems: 'center', gap: 2 }}>
                  <Text style={{ color: c.textFaint, fontFamily: FONTS.mono, fontSize: 11 }}>
                    {language === 'fr' ? 'AVANT' : 'BEFORE'}
                  </Text>
                  <Text style={{ color: c.textMuted, fontFamily: FONTS.headingBlack, fontSize: 20 }}>
                    {rankResult.oldElo}
                  </Text>
                </View>
                <ScoreText style={{ color: deltaColor, fontFamily: FONTS.headingBlack, fontSize: 28 }}>
                  {`${deltaSign}${rankResult.eloChange}`}
                </ScoreText>
                <View style={{ alignItems: 'center', gap: 2 }}>
                  <Text style={{ color: c.textFaint, fontFamily: FONTS.mono, fontSize: 11 }}>
                    {language === 'fr' ? 'APRÈS' : 'AFTER'}
                  </Text>
                  <Text style={{ color: newRank.color, fontFamily: FONTS.headingBlack, fontSize: 20 }}>
                    {rankResult.newElo}
                  </Text>
                </View>
              </View>
              {(promoted || demoted) && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  {promoted ? (
                    <AtlasPromote color="#2a6e3f" size={16} />
                  ) : (
                    <AtlasDemote color="#8b1a1a" size={16} />
                  )}
                  <Text style={{
                    fontFamily: FONTS.monoBold,
                    fontSize: 13,
                    color: promoted ? '#2a6e3f' : '#8b1a1a',
                    letterSpacing: 0.5,
                  }}>
                    {promoted
                      ? (language === 'fr' ? `Promotion en ${newRank.nameFr} !` : `Promoted to ${newRank.name}!`)
                      : (language === 'fr' ? `Rétrogradé en ${newRank.nameFr}` : `Demoted to ${newRank.name}`)}
                  </Text>
                </View>
              )}
            </View>
          );
        })()}

        <View style={{ width: '100%', maxWidth: 400, gap: 10 }}>
          <Text style={{ color: c.textFaint, fontSize: 12, fontFamily: FONTS.monoBold, letterSpacing: 1, marginBottom: 4 }}>
            {language === 'fr' ? 'DÉTAIL DES ROUNDS' : 'ROUND BREAKDOWN'}
          </Text>
          {rounds.map((round, i) => {
            const roundWinner =
              round.myScore > round.opponentScore
                ? 'me'
                : round.myScore < round.opponentScore
                  ? 'opponent'
                  : 'draw';
            const rowColor =
              roundWinner === 'me' ? '#2a6e3f' : roundWinner === 'opponent' ? '#8b1a1a' : '#c4872a';

            return (
              <View
                key={i}
                style={{
                  backgroundColor: c.card,
                  borderRadius: 14, padding: 16,
                  borderWidth: 1, borderColor: c.border,
                  borderLeftWidth: 4, borderLeftColor: rowColor,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <Text style={{ color: c.textFaint, fontSize: 12, fontFamily: FONTS.monoBold }}>
                  {`ROUND ${round.roundNumber}`}
                </Text>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', flexShrink: 1, marginHorizontal: 8 }}>
                  <Text numberOfLines={1} style={{ color: roundWinner === 'me' ? '#2a6e3f' : c.text, fontFamily: FONTS.headingBlack, fontSize: 18 }}>
                    {scoreLabel(round.gameMode ?? gameMode, round.myScore)}
                  </Text>
                  <Text style={{ color: c.textFaint, fontFamily: FONTS.mono }}>vs</Text>
                  <Text numberOfLines={1} style={{ color: roundWinner === 'opponent' ? '#8b1a1a' : c.text, fontFamily: FONTS.headingBlack, fontSize: 18 }}>
                    {scoreLabel(round.gameMode ?? gameMode, round.opponentScore)}
                  </Text>
                </View>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: rowColor }} />
              </View>
            );
          })}
        </View>

        <TouchableOpacity
          onPress={onExit}
          {...a11yButton(language === 'fr' ? 'Retour au menu' : 'Back to menu')}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: c.card,
            paddingVertical: 16, paddingHorizontal: 32, borderRadius: 14,
            width: '100%', maxWidth: 400, justifyContent: 'center',
            borderWidth: 1, borderColor: c.border,
            marginTop: 8, marginBottom: 16,
          }}
        >
          <Home size={20} color={c.text} />
          <Text style={{ color: c.text, fontFamily: FONTS.monoBold, fontSize: 16 }}>
            {language === 'fr' ? 'Retour au menu' : 'Back to menu'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
