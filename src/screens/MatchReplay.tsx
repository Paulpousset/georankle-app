/**
 * « Rejouer en solo » — refaire, seul, la partie en ligne qu'on vient de perdre.
 *
 * L'écran de fin d'un duel ne laissait rien faire de son contenu : les questions
 * ratées repartaient avec le match. Cet hôte remonte les mêmes écrans de jeu
 * avec le `game_data` EXACT du match — même seed, mêmes pays dédupliqués, mêmes
 * sessions de Rankle — donc exactement les mêmes questions, manche après manche,
 * mais sans adversaire ni chrono partagé.
 *
 * C'est un entraînement : rien n'est enregistré (ni classement, ni pièces —
 * elles ont déjà été créditées par le match). Les écrans de jeu s'en chargent
 * d'eux-mêmes : recevoir `onRoundComplete` leur dit qu'ils jouent une manche
 * pilotée de l'extérieur, et `user={null}` coupe toute écriture serveur.
 *
 * Le dispatch mode → écran reprend celui de LocalParcours, qui fait déjà tourner
 * n'importe quel mode sur un match synthétique.
 */
import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Home, Trophy } from 'lucide-react-native';

import type { GameMode, Match, MatchGameData, MatchMode } from '../types';
import { getChallenge, challengeForSeed } from '../data/challenges';
import { rankedChallengeSeed } from '../lib/ranked';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { a11yButton, a11yHidden } from '../lib/a11y';
import { tr } from '../i18n';
import { ScoreText } from '../components/ScoreText';
import { EndGlobe } from '../components/end/EndGlobe';
import { Reveal } from '../components/end/Reveal';
import { END_CHOREO } from '../lib/motion';
import { useMyGameGlobe } from '../lib/myGlobe';

import { ClassicGame } from './ClassicGame';
import StreakGame from './StreakGame';
import HigherLowerGame from './HigherLowerGame';
import SilhouetteGame from './SilhouetteGame';
import PinpointGame from './PinpointGame';
import LanguagesGame from './LanguagesGame';
import BordersGame from './BordersGame';
import GuessCountryGame from './GuessCountryGame';
import FindCountryGame from './FindCountryGame';
import FindRegionGame, { type RegionLevelKey } from './FindRegionGame';
import ChallengeQuiz from './ChallengeQuiz';
import VersusCapitals from './VersusCapitals';

interface MatchReplayProps {
  match: Match;
  onExit: () => void;
}

/** Le mode joué à la manche `round` (1-based) : perso/classé changent de mode à chaque manche. */
export function replayModeForRound(match: Match, round: number): MatchMode {
  const gd = match.game_data as MatchGameData | null;
  const sequence = gd?.ranked_modes ?? gd?.modes;
  if (sequence?.length) return sequence[round - 1] ?? sequence[0];
  return gd?.rounds?.[round - 1]?.mode ?? match.game_mode;
}

/** Les pays/niveaux de Régions Géo, tels que le match les a figés. */
function regionPicks(match: Match, round: number) {
  const gd = (match.game_data ?? {}) as Record<string, any>;
  const perRound = gd.rounds?.[round - 1]?.region ?? gd.regionRounds?.[round];
  const normalize = (p: any) => ({
    cca3: p.cca3,
    name: p.name,
    name_en: p.name_en ?? p.name,
    unit: p.unit ?? null,
    level: (p.level ?? 'regions') as RegionLevelKey,
  });
  if (perRound) return [normalize(perRound)];
  if (gd.countries?.length) return gd.countries.map(normalize);
  if (gd.country) return [normalize({ ...gd.country, level: gd.level })];
  return [];
}

export default function MatchReplay({ match, onExit }: MatchReplayProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const { config: myGlobe } = useMyGameGlobe();

  const bestOf = match.best_of || 1;
  const [round, setRound] = useState(1);
  const [scores, setScores] = useState<number[]>([]);

  const done = round > bestOf;

  const handleRoundComplete = (score: number) => {
    setScores((prev) => [...prev, score]);
    setRound((r) => r + 1);
  };

  if (done) {
    const total = scores.reduce((s, v) => s + v, 0);
    const average = scores.length ? Math.round(total / scores.length) : 0;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
          <EndGlobe config={myGlobe} size={116} accent={c.accent} animate />
          <Reveal at={END_CHOREO.verdict} kind="pop">
          <Trophy color={c.accent} size={40} {...a11yHidden} />
          </Reveal>
          <ScoreText style={{ color: c.text, fontFamily: FONTS.headingBlack, fontSize: 26, textAlign: 'center' }}>
            {tr(language, 'ENTRAÎNEMENT TERMINÉ', 'TRAINING DONE')}
          </ScoreText>
          <ScoreText style={{ color: c.accent, fontFamily: FONTS.headingBlack, fontSize: 48 }}>
            {average}
          </ScoreText>
          <Text style={{ color: c.textMuted, fontFamily: FONTS.mono, fontSize: 13, textAlign: 'center' }}>
            {tr(
              language, 'Moyenne sur {0} manche{1} · sur 1000', 'Average over {0} round{1} · out of 1000', [scores.length, scores.length > 1 ? 's' : ''],
            )}
          </Text>
          <Text style={{ color: c.textFaint, fontFamily: FONTS.mono, fontSize: 11, textAlign: 'center', maxWidth: 300 }}>
            {tr(
              language,
              'Entraînement — ni classement ni pièces, les pièces du match ont déjà été créditées.',
              'Training — no leaderboard, no coins; the match already credited yours.',
            )}
          </Text>
          <TouchableOpacity
            onPress={onExit}
            {...a11yButton(tr(language, 'Retour', 'Back'))}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 14,
              paddingVertical: 16,
              paddingHorizontal: 32,
              marginTop: 10,
            }}
          >
            <Home color={c.text} size={20} {...a11yHidden} />
            <Text style={{ color: c.text, fontFamily: FONTS.monoBold, fontSize: 16 }}>
              {tr(language, 'Retour', 'Back')}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Le match rejoué : même `game_data`, mais seul en piste. `player2_id: null`
  // et un id local coupent tout ce qui parlerait au serveur.
  const solo: Match = {
    ...match,
    id: `replay-${match.id}`,
    player2_id: null,
    is_ranked: false,
    status: 'in_progress',
    current_round: round,
  };
  const mode = replayModeForRound(match, round);
  const key = `${mode}-${round}`;
  const quit = onExit as (m: GameMode) => void;

  switch (mode) {
    case 'versus':
      return (
        <VersusCapitals key={key} setGameMode={quit} matchData={solo} onRoundComplete={handleRoundComplete} onExit={onExit} />
      );
    case 'streak':
      return (
        <StreakGame key={key} setGameMode={quit} user={null} matchData={solo} onRoundComplete={handleRoundComplete} />
      );
    case 'higherlower':
      return (
        <HigherLowerGame key={key} setGameMode={quit} user={null} matchData={solo} onRoundComplete={handleRoundComplete} />
      );
    case 'silhouette':
      return (
        <SilhouetteGame key={key} setGameMode={quit} user={null} matchData={solo} onRoundComplete={handleRoundComplete} />
      );
    case 'pinpoint':
      return (
        <PinpointGame key={key} setGameMode={quit} user={null} matchData={solo} onRoundComplete={handleRoundComplete} />
      );
    case 'languages':
      return (
        <LanguagesGame key={key} setGameMode={quit} user={null} matchData={solo} onRoundComplete={handleRoundComplete} />
      );
    case 'borders':
      return (
        <BordersGame key={key} setGameMode={quit} user={null} matchData={solo} onRoundComplete={handleRoundComplete} />
      );
    case 'guess':
      return (
        <GuessCountryGame key={key} onBackToMenu={onExit} user={null} matchData={solo} onRoundComplete={handleRoundComplete} />
      );
    case 'globe':
      return (
        <FindCountryGame key={key} setGameMode={quit} user={null} matchData={solo} onRoundComplete={handleRoundComplete} />
      );
    case 'regions': {
      const picks = regionPicks(match, round);
      if (picks.length === 0) {
        // Un match Régions sans pays enregistré (ancien format) : rien à rejouer.
        handleRoundComplete(0);
        return null;
      }
      return (
        <FindRegionGame key={key} setGameMode={quit} picks={picks} user={null} matchData={solo} onRoundComplete={handleRoundComplete} />
      );
    }
    case 'challenge': {
      const gd = (match.game_data ?? {}) as Record<string, any>;
      const challenge =
        getChallenge(gd.rounds?.[round - 1]?.challengeId ?? gd.challengeId ?? '') ??
        challengeForSeed(rankedChallengeSeed(gd.seed ?? 0, round));
      return (
        <ChallengeQuiz key={key} challenge={challenge} matchData={solo} onRoundComplete={handleRoundComplete} onExit={onExit} />
      );
    }
    case 'classic':
    default:
      return (
        <ClassicGame key={key} user={null} matchData={solo} onRoundComplete={handleRoundComplete} onExit={onExit} />
      );
  }
}
