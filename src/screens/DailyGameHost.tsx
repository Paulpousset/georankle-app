import { useRef, useState } from 'react';
import { Alert, Share, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Dispatch, SetStateAction } from 'react';
import type { User } from '@supabase/supabase-js';

import type { GameMode, Language } from '../types';
import { completeDaily, seedFor, type DailyResult } from '../lib/daily';
import { buildShareMessage } from '../lib/share';
import { track } from '../lib/analytics';
import { tr } from '../i18n';

import { ClassicGame } from './ClassicGame';
import StreakGame from './StreakGame';
import GuessCountryGame from './GuessCountryGame';
import FindCountryGame from './FindCountryGame';
import RegionGameFlow from './RegionGameFlow';
import VersusCapitals from './VersusCapitals';

interface DailyGameHostProps {
  mode: GameMode;
  date: string;
  user: User | null;
  isDarkMode: boolean;
  setIsDarkMode: Dispatch<SetStateAction<boolean>>;
  language: Language;
  setLanguage: Dispatch<SetStateAction<Language>>;
  onToggleTheme: () => void;
  onToggleLanguage: () => void;
  onExit: () => void;
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
  isDarkMode,
  setIsDarkMode,
  language,
  setLanguage,
  onToggleTheme,
  onToggleLanguage,
  onExit,
}: DailyGameHostProps) {
  const seed = seedFor(date, mode);
  const resultRef = useRef<DailyResult | null>(null);
  const [streak, setStreak] = useState(0);

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
    const state = await completeDaily(user, result);
    setStreak(state.streak);
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
    Alert.alert(
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

  const onShare = () => {
    const r = resultRef.current;
    if (!r) return;
    track('daily_shared', { mode });
    Share.share({ message: buildShareMessage(r, streak, language) }).catch(() => {});
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
        isDarkMode={isDarkMode}
        language={language}
        user={user}
        onExit={requestExit}
        onToggleTheme={onToggleTheme}
        onToggleLanguage={onToggleLanguage}
        {...common}
      />
    );
  } else if (mode === 'streak') {
    screen = (
      <StreakGame
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        setGameMode={exitOnMenu}
        language={language}
        setLanguage={setLanguage}
        user={user}
        onDailyScoreChange={reportScore}
        {...common}
      />
    );
  } else if (mode === 'guess') {
    screen = (
      <GuessCountryGame
        isDarkMode={isDarkMode}
        language={language}
        onBackToMenu={requestExit}
        user={user}
        {...common}
      />
    );
  } else if (mode === 'globe') {
    screen = (
      <FindCountryGame
        isDarkMode={isDarkMode}
        language={language}
        setGameMode={exitOnMenu}
        user={user}
        onDailyScoreChange={reportScore}
        {...common}
      />
    );
  } else if (mode === 'regions') {
    screen = (
      <RegionGameFlow
        isDarkMode={isDarkMode}
        language={language}
        setGameMode={exitOnMenu}
        user={user}
        onDailyScoreChange={reportScore}
        {...common}
      />
    );
  } else if (mode === 'quiz-capital' || mode === 'quiz-flag' || mode === 'quiz-mix') {
    const initialGameType = mode === 'quiz-capital' ? 'CAPITAL' : mode === 'quiz-flag' ? 'FLAG' : 'MIX';
    screen = (
      <VersusCapitals
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        setGameMode={exitOnMenu}
        language={language}
        soloMode
        initialGameType={initialGameType}
        onDailyScoreChange={reportScore}
        {...common}
      />
    );
  } else {
    screen = <View />;
  }

  return <SafeAreaProvider>{screen}</SafeAreaProvider>;
}
