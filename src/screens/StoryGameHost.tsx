import { useRef } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { GameMode, Match } from '../types';
import type { StoryLevel } from '../data/story';
import { starsForScore } from '../data/story';
import { pickBandCountries } from '../lib/matchCountries';
import { track } from '../lib/analytics';

import { ClassicGame } from './ClassicGame';
import StreakGame from './StreakGame';
import HigherLowerGame from './HigherLowerGame';
import SilhouetteGame from './SilhouetteGame';
import BordersGame from './BordersGame';
import GuessCountryGame from './GuessCountryGame';
import FindCountryGame from './FindCountryGame';
import VersusCapitals from './VersusCapitals';

interface StoryGameHostProps {
  level: StoryLevel;
  onExit: () => void;
  onLevelComplete: (result: { score: number; stars: number }) => void;
}

/**
 * Runs a single Story level: builds a synthetic solo `matchData` (the
 * LocalParcours pattern — user=null, best_of 1) whose `roundCountries` is
 * pre-filtered to the level's notoriety band for the country-answer modes, then
 * renders the mode's own screen. The screen reports one normalized 0..1000 score
 * via `onRoundComplete`, which we turn into stars.
 *
 * Quitting mid-level = a fail for that attempt (the life was already spent when
 * the level was launched from the map).
 */
export default function StoryGameHost({ level, onExit, onLevelComplete }: StoryGameHostProps) {
  const done = useRef(false);

  const handleComplete = (score: number) => {
    if (done.current) return;
    done.current = true;
    const stars = starsForScore(score);
    track('story_level_completed', { level: level.level, mode: level.mode, score, stars });
    onLevelComplete({ score, stars });
  };

  const match = makeStoryMatch(level);
  const quit = () => onExit();

  let screen: React.ReactNode;
  switch (level.mode) {
    case 'quiz-capital':
    case 'quiz-flag':
      // NOT soloMode so the online completion path fires onRoundComplete once.
      screen = (
        <VersusCapitals
          setGameMode={quit as (m: GameMode) => void}
          matchData={match}
          onRoundComplete={handleComplete}
          onExit={quit}
        />
      );
      break;
    case 'guess':
      screen = (
        <GuessCountryGame
          onBackToMenu={quit}
          user={null}
          matchData={match}
          onRoundComplete={handleComplete}
        />
      );
      break;
    case 'globe':
      screen = (
        <FindCountryGame
          setGameMode={quit as (m: GameMode) => void}
          user={null}
          matchData={match}
          onRoundComplete={handleComplete}
        />
      );
      break;
    case 'silhouette':
      screen = (
        <SilhouetteGame
          setGameMode={quit as (m: GameMode) => void}
          user={null}
          matchData={match}
          onRoundComplete={handleComplete}
        />
      );
      break;
    case 'borders':
      screen = (
        <BordersGame
          setGameMode={quit as (m: GameMode) => void}
          user={null}
          matchData={match}
          onRoundComplete={handleComplete}
        />
      );
      break;
    case 'higherlower':
      screen = (
        <HigherLowerGame
          setGameMode={quit as (m: GameMode) => void}
          user={null}
          matchData={match}
          onRoundComplete={handleComplete}
        />
      );
      break;
    case 'streak':
      screen = (
        <StreakGame
          setGameMode={quit as (m: GameMode) => void}
          user={null}
          matchData={match}
          onRoundComplete={handleComplete}
        />
      );
      break;
    case 'classic':
      screen = (
        <ClassicGame
          user={null}
          matchData={match}
          onRoundComplete={handleComplete}
          onExit={quit}
        />
      );
      break;
    default:
      screen = <View />;
  }

  return <SafeAreaProvider>{screen}</SafeAreaProvider>;
}

/** Builds the notoriety-band-filtered answer countries for a level's mode. */
function buildRoundCountries(level: StoryLevel): Record<number, string[]> | undefined {
  switch (level.matchMode) {
    case 'guess':
      return { 1: pickBandCountries(level.seed, 'guess', undefined, 1, level.band) };
    case 'globe':
      return { 1: pickBandCountries(level.seed, 'globe', undefined, level.questionCount, level.band) };
    case 'versus':
      return {
        1: pickBandCountries(level.seed, 'versus', level.questionType, level.questionCount, level.band),
      };
    default:
      return undefined; // self-seeding modes (silhouette/borders/streak/…)
  }
}

/** In-memory Match so a level runs as a local solo round (no persistence). */
function makeStoryMatch(level: StoryLevel): Match {
  return {
    id: `story-${level.level}`,
    player1_id: 'story-p1',
    player2_id: null,
    game_mode: level.matchMode,
    status: 'in_progress',
    is_public: false,
    is_ranked: false,
    best_of: 1,
    p1_rounds_won: 0,
    p2_rounds_won: 0,
    p1_current_score: 0,
    p2_current_score: 0,
    current_round: 1,
    p1_finished_round: false,
    p2_finished_round: false,
    game_data: {
      seed: level.seed,
      questionType: level.questionType,
      roundsPerSet: level.questionCount,
      roundCountries: buildRoundCountries(level),
    },
  };
}
