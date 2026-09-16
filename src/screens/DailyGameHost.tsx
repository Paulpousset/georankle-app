import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { showAlert } from '../lib/alert';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { User } from '@supabase/supabase-js';

import type { GameMode } from '../types';
import { completeDaily, getLocalState, seedFor, type DailyResult } from '../lib/daily';
import { variantForSeed } from '../lib/languages';
import { challengeForSeed } from '../data/challenges';
import { prefetchReferralCode, shareDailyResult } from '../lib/shareDaily';
import { track } from '../lib/analytics';
import { maybeAskForReview } from '../lib/reviewPrompt';
import { tr } from '../i18n';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../components/ToastProvider';

import { ClassicGame } from './ClassicGame';
import StreakGame from './StreakGame';
import HigherLowerGame from './HigherLowerGame';
import SilhouetteGame from './SilhouetteGame';
import LanguagesFlow from './LanguagesFlow';
import BordersGame from './BordersGame';
import GuessCountryGame from './GuessCountryGame';
import FindCountryGame from './FindCountryGame';
import RegionGameFlow from './RegionGameFlow';
import ChallengeQuiz from './ChallengeQuiz';
import VersusCapitals from './VersusCapitals';
import DailyEnd from './DailyEnd';

interface DailyGameHostProps {
  mode: GameMode;
  date: string;
  user: User | null;
  onExit: () => void;
  /** « Défi suivant » : enchaîner sur un autre défi du jour sans repasser par le hub. */
  onPlayDaily?: (mode: GameMode) => void;
}

/**
 * Renders the right solo-mode screen in "daily" configuration: a deterministic
 * seed for today's puzzle, a completion handler that records the result + streak
 * (server-authoritative when signed in), and a Share action. Centralising the
 * mode→screen mapping here keeps App.tsx to a single extra branch.
 */
export default function DailyGameHost({
  mode,
  date,
  user,
  onExit,
  onPlayDaily,
}: DailyGameHostProps) {
  const { language } = useLanguage();
  const toast = useToast();
  const seed = seedFor(date, mode);
  const resultRef = useRef<DailyResult | null>(null);
  const [streak, setStreak] = useState(0);
  // La fin de défi (l'orbite) se pose PAR-DESSUS l'écran de fin du mode, qui
  // garde le récap et les pièces ; « Récap & pièces » la retire.
  const [ending, setEnding] = useState<{ result: DailyResult; streakIncreased: boolean } | null>(null);
  const [showEnd, setShowEnd] = useState(false);

  // Latest in-progress score, reported live by the active game (continuous-score
  // modes only). Used to lock in the score if the player quits before the puzzle
  // finishes naturally.
  const liveScoreRef = useRef(0);
  // True once today's puzzle has been recorded (natural finish OR quit). Guards
  // against double-recording and tells `requestExit` to skip the confirm popup.
  const completedRef = useRef(false);

  const handleComplete = async (score: number, grid?: string) => {
    if (completedRef.current) return;
    completedRef.current = true;
    const result: DailyResult = { mode, date, score, grid };
    resultRef.current = result;
    track('daily_completed', { mode, score });
    const before = await getLocalState().catch(() => null);
    const state = await completeDaily(user, result);
    setStreak(state.streak);
    setEnding({ result, streakIncreased: before != null && state.streak > before.streak });
    setShowEnd(true);
    // Streak milestone (7/30-day multiples) — the server just credited coins.
    if (state.streakBonus > 0) {
      toast.success(
        tr(
          language, 'Palier de série {0} jours : +{1} pièces !', '{0}-day streak milestone: +{1} coins!', [state.streak, state.streakBonus],
        ),
      );
      track('streak_bonus_awarded', { streak: state.streak, coins: state.streakBonus });
    }
    // Signed in but the server didn't confirm → tell the player it's saved
    // locally and will sync, rather than letting them assume it's on the server.
    if (user && !state.synced) {
      toast.info(
        tr(
          language,
          'Résultat enregistré hors-ligne — synchronisation à la reconnexion.',
          'Saved offline — will sync when you reconnect.',
        ),
      );
    }
    // Store rating ask, only on a streak and only once the result is on screen
    // (the OS sheet would otherwise land on top of the score reveal).
    setTimeout(() => {
      maybeAskForReview(state.streak).catch(() => {});
    }, 2500);
  };

  // Continuous-score modes call this on every score change so a mid-game quit
  // can lock in the right value.
  const reportScore = (score: number) => {
    liveScoreRef.current = score;
  };

  // Daily puzzles are one-shot: quitting mid-game locks in the current score and
  // marks the mode done (no replay). Confirm first; once recorded, exit silently.
  const requestExit = () => {
    if (completedRef.current) {
      onExit();
      return;
    }
    showAlert(
      tr(language, 'Quitter le défi ?', 'Quit the challenge?'),
      tr(
        language,
        'Ta partie sera enregistrée avec ton score actuel et tu ne pourras pas rejouer ce mode aujourd’hui.',
        'Your run will be saved with your current score and you won’t be able to replay this mode today.',
      ),
      [
        { text: tr(language, 'Annuler', 'Cancel'), style: 'cancel' },
        {
          text: tr(language, 'Quitter', 'Quit'),
          style: 'destructive',
          onPress: async () => {
            await handleComplete(liveScoreRef.current);
            onExit();
          },
        },
      ],
    );
  };

  // The referral code is fetched up front: the share sheet must open in the
  // same tick as the tap (web user-activation rule), so no await at tap time.
  useEffect(() => {
    if (user) prefetchReferralCode().catch(() => {});
  }, [user]);

  const onShare = () => {
    const r = resultRef.current;
    if (!r) return;
    shareDailyResult(r, streak, language, mode, () =>
      toast.success(tr(language, 'Résultat copié !', 'Result copied!')),
    ).catch(() => {});
  };

  // Exit helper for screens that navigate via setGameMode('menu').
  const exitOnMenu = (m: GameMode) => {
    if (m === 'menu') requestExit();
  };

  const common = {
    dailySeed: seed,
    onDailyComplete: handleComplete,
    isDaily: true,
    onShare,
  };

  let screen: React.ReactNode;
  if (mode === 'classic') {
    screen = (
      <ClassicGame
        user={user}
        onExit={requestExit}
        poolDate={date}
        {...common}
      />
    );
  } else if (mode === 'streak') {
    screen = (
      <StreakGame
        setGameMode={exitOnMenu}
        poolDate={date}
        user={user}
        onDailyScoreChange={reportScore}
        {...common}
      />
    );
  } else if (mode === 'higherlower') {
    screen = (
      <HigherLowerGame
        setGameMode={exitOnMenu}
        user={user}
        onDailyScoreChange={reportScore}
        poolDate={date}
        {...common}
      />
    );
  } else if (mode === 'silhouette') {
    screen = (
      <SilhouetteGame
        setGameMode={exitOnMenu}
        user={user}
        onDailyScoreChange={reportScore}
        {...common}
      />
    );
  } else if (mode === 'languages') {
    screen = (
      <LanguagesFlow
        setGameMode={exitOnMenu}
        user={user}
        // The variant is derived from the day's seed, NOT chosen by the player:
        // everyone must face the same puzzle for the shared grid to mean anything.
        variant={variantForSeed(seed)}
        onDailyScoreChange={reportScore}
        {...common}
      />
    );
  } else if (mode === 'borders') {
    screen = (
      <BordersGame
        setGameMode={exitOnMenu}
        user={user}
        onDailyScoreChange={reportScore}
        {...common}
      />
    );
  } else if (mode === 'guess') {
    screen = (
      <GuessCountryGame
        onBackToMenu={requestExit}
        user={user}
        {...common}
      />
    );
  } else if (mode === 'globe') {
    screen = (
      <FindCountryGame
        setGameMode={exitOnMenu}
        user={user}
        onDailyScoreChange={reportScore}
        {...common}
      />
    );
  } else if (mode === 'regions') {
    screen = (
      <RegionGameFlow
        setGameMode={exitOnMenu}
        user={user}
        onDailyScoreChange={reportScore}
        {...common}
      />
    );
  } else if (mode === 'challenge') {
    screen = (
      <ChallengeQuiz
        // Which of the country quizzes is played is derived from the day's seed,
        // NOT chosen by the player — same puzzle for everyone, like the variant
        // in Langues. The quiz's own questions are then seeded from that seed.
        challenge={challengeForSeed(seed)}
        onExit={requestExit}
        onDailyScoreChange={reportScore}
        dailySeed={seed}
        onDailyComplete={handleComplete}
        isDaily
        onShare={onShare}
      />
    );
  } else if (mode === 'quiz-capital' || mode === 'quiz-flag') {
    const initialGameType = mode === 'quiz-capital' ? 'CAPITAL' : 'FLAG';
    screen = (
      <VersusCapitals
        setGameMode={exitOnMenu}
        soloMode
        initialGameType={initialGameType}
        onDailyScoreChange={reportScore}
        {...common}
      />
    );
  } else {
    screen = <View />;
  }

  return (
    <SafeAreaProvider>
      {screen}
      {ending && showEnd ? (
        <View style={StyleSheet.absoluteFill}>
          <DailyEnd
            result={ending.result}
            streak={streak}
            streakIncreased={ending.streakIncreased}
            onNext={(next) => (onPlayDaily ? onPlayDaily(next) : onExit())}
            onShare={onShare}
            onDetail={() => setShowEnd(false)}
            onHub={onExit}
          />
        </View>
      ) : null}
    </SafeAreaProvider>
  );
}
