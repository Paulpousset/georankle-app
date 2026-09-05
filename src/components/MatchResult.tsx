import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { Home, RotateCcw, Trophy } from 'lucide-react-native';
import { AtlasPromote, AtlasDemote } from './AtlasIcons';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import type { RoundSummaryData } from './RoundSummary';
import { getRankFromElo } from '../lib/ranked';
import { computeMatchOutcome, formatMatchScore } from '../lib/match';
import { RankGlobe } from './RankGlobe';
import { a11yButton, a11yHidden, announce } from '../lib/a11y';
import { ScoreText } from './ScoreText';
import { PlayerGlobe } from './PlayerGlobe';
import { RematchPanel } from './RematchPanel';
import { SoloCoinReward } from './SoloCoinReward';
import { supabase } from '../lib/supabase';
import { tr } from '../i18n';
import type { AvatarConfig, Match } from '../types';

interface RankResult {
  eloChange: number;
  newElo: number;
  oldElo: number;
}

interface OpponentProfile {
  username: string | null;
  avatar_url: string | null;
  avatar_config: AvatarConfig | null;
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
  /**
   * Le match joué et l'identité du joueur : sans eux, l'écran se contente du
   * score (c'est le cas d'un match local/bot qui n'a pas de ligne à recréer).
   */
  match?: Match | null;
  currentUserId?: string | null;
  /** Revanche acceptée : la nouvelle partie démarre. */
  onStartMatch?: (match: Match) => void;
  /** Rejouer les mêmes questions seul, à l'entraînement. */
  onSoloReplay?: () => void;
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
  match = null,
  currentUserId = null,
  onStartMatch,
  onSoloReplay,
  onExit,
}: MatchResultProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);

  // Les deux globes de la table. Chargés ici plutôt que passés en prop : le
  // lobby fait la même requête, mais un match repris ou gagné par forfait n'y
  // passe pas.
  const [me, setMe] = useState<OpponentProfile | null>(null);
  const [opponent, setOpponent] = useState<OpponentProfile | null>(null);
  const opponentId =
    match && currentUserId
      ? match.player1_id === currentUserId
        ? match.player2_id
        : match.player1_id
      : null;

  useEffect(() => {
    const ids = [currentUserId, opponentId].filter(Boolean) as string[];
    if (ids.length === 0) return;
    let alive = true;
    void supabase
      .from('profiles')
      .select('id, username, avatar_url, avatar_config')
      .in('id', ids)
      .then(({ data }) => {
        if (!alive || !data) return;
        const rows = data as ({ id: string } & OpponentProfile)[];
        setMe(rows.find((r) => r.id === currentUserId) ?? null);
        setOpponent(rows.find((r) => r.id === opponentId) ?? null);
      });
    return () => {
      alive = false;
    };
  }, [currentUserId, opponentId]);

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
    ? tr(language, 'ÉGALITÉ', 'DRAW')
    : iWon
      ? tr(language, 'VICTOIRE !', 'VICTORY!')
      : tr(language, 'DÉFAITE', 'DEFEAT');

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
      ? tr(language, 'Égalité', 'Draw')
      : iWon
        ? tr(language, 'Victoire', 'Victory')
        : tr(language, 'Défaite', 'Defeat');
    const score = tr(language, '{0} à {1}', '{0} to {1}', [myRoundsWon, opponentRoundsWon]);
    announce(`${outcome}, ${score}`);
  }, [isDraw, iWon, language, myRoundsWon, opponentRoundsWon]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      <ScrollView contentContainerStyle={{ alignItems: 'center', padding: 24, gap: 24 }}>
        <View style={{ alignItems: 'center', gap: 12, marginTop: 16 }}>
          {/* Les deux globes face à face : on voit enfin contre quel monde on
              vient de jouer, et le sien porte la couleur du résultat. */}
          {opponentId && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 4 }}>
              <PlayerGlobe
                config={me?.avatar_config ?? null}
                photoUrl={me?.avatar_url ?? null}
                username={me?.username ?? (tr(language, 'Vous', 'You'))}
                size={92}
                label={tr(language, 'VOUS', 'YOU')}
                accent={resultColor}
                animate
              />
              <Text style={{ color: c.textFaint, fontFamily: FONTS.mono, fontSize: 13 }}>
                {tr(language, 'contre', 'vs')}
              </Text>
              <PlayerGlobe
                config={opponent?.avatar_config ?? null}
                photoUrl={opponent?.avatar_url ?? null}
                username={opponent?.username ?? (tr(language, 'Adversaire', 'Opponent'))}
                size={92}
                label={tr(language, 'ADVERSAIRE', 'OPPONENT')}
                animate
              />
            </View>
          )}
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
            {`BO${bestOf} · ${tr(language, 'Série terminée', 'Series over')}`}
          </Text>
          {myTotalScore !== undefined && opponentTotalScore !== undefined && (
            <Text style={{ color: c.textFaint, fontSize: 13, fontFamily: FONTS.mono }}>
              {`${tr(language, 'Points', 'Points')} ${myTotalScore} – ${opponentTotalScore}`}
            </Text>
          )}
          {decidedOnPoints && (
            <Text style={{ color: resultColor, fontSize: 12, fontFamily: FONTS.monoBold, letterSpacing: 0.5 }}>
              {tr(language, 'Départagé aux points', 'Decided on points')}
            </Text>
          )}
        </View>

        {/* Pièces animées + doubleur pub — la même carte qu'en solo. En ligne,
            l'écran se contentait d'une ligne « +6 pièces », sans aucun moyen de
            les doubler, alors que la RPC de multiplication ignore le mode. */}
        {coinsAwarded != null && (
          <SoloCoinReward
            coinsEarned={coinsAwarded}
            containerStyle={{ width: '100%', maxWidth: 400 }}
          />
        )}

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
                    {tr(language, 'AVANT', 'BEFORE')}
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
                    {tr(language, 'APRÈS', 'AFTER')}
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
                      ? (tr(language, 'Promotion en {0} !', 'Promoted to {1}!', [newRank.nameFr, newRank.name]))
                      : (tr(language, 'Rétrogradé en {0}', 'Demoted to {1}', [newRank.nameFr, newRank.name]))}
                  </Text>
                </View>
              )}
            </View>
          );
        })()}

        <View style={{ width: '100%', maxWidth: 400, gap: 10 }}>
          <Text style={{ color: c.textFaint, fontSize: 12, fontFamily: FONTS.monoBold, letterSpacing: 1, marginBottom: 4 }}>
            {tr(language, 'DÉTAIL DES ROUNDS', 'ROUND BREAKDOWN')}
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

        <View style={{ width: '100%', maxWidth: 400, gap: 10, marginTop: 8, marginBottom: 16 }}>
          {/* Revanche : même adversaire, mêmes réglages, tirage neuf. Jamais en
              classé — un match classé se relance par la file, seule à apparier
              sur l'ELO. */}
          {match && currentUserId && opponentId && onStartMatch && !isRanked && (
            <RematchPanel
              match={match}
              currentUserId={currentUserId}
              opponentName={opponent?.username ?? null}
              onStartMatch={onStartMatch}
            />
          )}

          {/* Rejouer les mêmes questions seul : la seule façon de retravailler
              ce qu'on vient de rater sans attendre personne. */}
          {onSoloReplay && (
            <TouchableOpacity
              onPress={onSoloReplay}
              {...a11yButton(
                tr(language, 'Rejouer les mêmes questions en solo', 'Replay the same questions solo'),
              )}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                backgroundColor: c.card,
                paddingVertical: 16, paddingHorizontal: 24, borderRadius: 14,
                width: '100%', justifyContent: 'center',
                borderWidth: 1, borderColor: c.border,
              }}
            >
              <RotateCcw size={20} color={c.text} {...a11yHidden} />
              <Text numberOfLines={1} style={{ color: c.text, fontFamily: FONTS.monoBold, fontSize: 15 }}>
                {tr(language, 'Rejouer en solo', 'Replay solo')}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={onExit}
            {...a11yButton(tr(language, 'Retour au menu', 'Back to menu'))}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: c.card,
              paddingVertical: 16, paddingHorizontal: 32, borderRadius: 14,
              width: '100%', justifyContent: 'center',
              borderWidth: 1, borderColor: c.border,
            }}
          >
            <Home size={20} color={c.text} {...a11yHidden} />
            <Text style={{ color: c.text, fontFamily: FONTS.monoBold, fontSize: 16 }}>
              {tr(language, 'Retour au menu', 'Back to menu')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
