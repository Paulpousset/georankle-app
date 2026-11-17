/**
 * The seeded, one-shot configuration of every daily-capable mode: which
 * screen to mount for a mode, given a seed. Shared by the daily challenge
 * (DailyGameHost) and friend challenges (ChallengeGameHost): the same
 * (mode, seed, pool date) always produces the same game, which is what lets two
 * players compare scores on « the same grid ».
 */
import type React from 'react';
import { View } from 'react-native';
import type { User } from '@supabase/supabase-js';

import type { GameMode } from '../types';
import { variantForSeed } from '../lib/languages';
import { challengeForSeed } from '../data/challenges';
import { ghostCapitalsChallenge } from '../lib/ghostCountries';

import { ClassicGame } from './ClassicGame';
import StreakGame from './StreakGame';
import HigherLowerGame from './HigherLowerGame';
import SilhouetteGame from './SilhouetteGame';
import PinpointGame from './PinpointGame';
import ScaleGame from './ScaleGame';
import SplitGame from './SplitGame';
import LanguagesFlow from './LanguagesFlow';
import BordersGame from './BordersGame';
import GuessCountryGame from './GuessCountryGame';
import FindCountryGame from './FindCountryGame';
import RegionGameFlow from './RegionGameFlow';
import ChallengeQuiz from './ChallengeQuiz';
import VersusCapitals from './VersusCapitals';

export interface SeededGameOptions {
  mode: GameMode;
  seed: number;
  /** Date (YYYY-MM-DD) whose country pool the pool-based modes draw from. */
  date: string;
  user: User | null;
  /** Halloween « pays fantômes » variant (daily only). */
  ghost: boolean;
  handleComplete: (score: number, grid?: string) => void;
  reportScore: (score: number) => void;
  requestExit: () => void;
  onShare: () => void;
}

export function SeededGame({
  mode,
  seed,
  date,
  user,
  ghost,
  handleComplete,
  reportScore,
  requestExit,
  onShare,
}: SeededGameOptions): React.ReactElement {
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

  if (mode === 'classic') {
    return <ClassicGame user={user} onExit={requestExit} poolDate={date} {...common} />;
  } else if (mode === 'streak') {
    return (
      <StreakGame
        setGameMode={exitOnMenu}
        poolDate={date}
        user={user}
        onDailyScoreChange={reportScore}
        {...common}
      />
    );
  } else if (mode === 'higherlower') {
    return (
      <HigherLowerGame
        setGameMode={exitOnMenu}
        user={user}
        onDailyScoreChange={reportScore}
        poolDate={date}
        {...common}
      />
    );
  } else if (mode === 'silhouette') {
    return (
      <SilhouetteGame
        setGameMode={exitOnMenu}
        user={user}
        onDailyScoreChange={reportScore}
        // Halloween: on its haunted days the slot plays « Pays fantômes » —
        // same seed, same leaderboard, no server change. Same for the 3 below.
        ghost={ghost}
        {...common}
      />
    );
  } else if (mode === 'pinpoint') {
    return (
      <PinpointGame
        setGameMode={exitOnMenu}
        user={user}
        onDailyScoreChange={reportScore}
        ghost={ghost}
        {...common}
      />
    );
  } else if (mode === 'scale') {
    return (
      <ScaleGame
        setGameMode={exitOnMenu}
        user={user}
        onDailyScoreChange={reportScore}
        ghost={ghost}
        {...common}
      />
    );
  } else if (mode === 'split') {
    return (
      <SplitGame
        setGameMode={exitOnMenu}
        user={user}
        onDailyScoreChange={reportScore}
        {...common}
      />
    );
  } else if (mode === 'languages') {
    return (
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
    return (
      <BordersGame
        setGameMode={exitOnMenu}
        user={user}
        onDailyScoreChange={reportScore}
        {...common}
      />
    );
  } else if (mode === 'guess') {
    return <GuessCountryGame onBackToMenu={requestExit} user={user} {...common} />;
  } else if (mode === 'globe') {
    return (
      <FindCountryGame
        setGameMode={exitOnMenu}
        user={user}
        onDailyScoreChange={reportScore}
        {...common}
      />
    );
  } else if (mode === 'regions') {
    return (
      <RegionGameFlow
        setGameMode={exitOnMenu}
        user={user}
        onDailyScoreChange={reportScore}
        {...common}
      />
    );
  } else if (mode === 'challenge') {
    return (
      <ChallengeQuiz
        // Which of the country quizzes is played is derived from the day's seed,
        // NOT chosen by the player — same puzzle for everyone, like the variant
        // in Langues. The quiz's own questions are then seeded from that seed.
        challenge={ghost ? ghostCapitalsChallenge() : challengeForSeed(seed)}
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
    return (
      <VersusCapitals
        setGameMode={exitOnMenu}
        soloMode
        initialGameType={initialGameType}
        onDailyScoreChange={reportScore}
        {...common}
      />
    );
  } else {
    return <View />;
  }
}
