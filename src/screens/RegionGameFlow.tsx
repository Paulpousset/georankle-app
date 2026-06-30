import { useState } from 'react';
import type { User } from '@supabase/supabase-js';

import type { GameMode } from '../types';
import { createSeededRng } from '../lib/rng';
import { REGION_MANIFEST } from '../../assets/regions';
import type { Challenge } from '../data/challenges';
import FindRegionGame, { type RegionLevelKey } from './FindRegionGame';
import RegionCountryPicker, { type RegionPick } from './RegionCountryPicker';
import ChallengeQuiz from './ChallengeQuiz';

interface RegionGameFlowProps {
  setGameMode: (mode: GameMode) => void;
  user?: User | null;
  /** Launch a quiz online (1v1) instead of solo — opens challenge matchmaking. */
  onPlayChallengeOnline?: (challengeId: string) => void;
  /** Daily challenge: deterministic seed → auto-picks the country, skips the picker. */
  dailySeed?: number;
  onDailyComplete?: (score: number, grid?: string) => void;
  isDaily?: boolean;
  onShare?: () => void;
  /** Daily challenge: reports the live score so a mid-game quit can lock it in. */
  onDailyScoreChange?: (score: number) => void;
}

/** Deterministically pick a country + level from the manifest for the daily. */
function pickDailyCountry(seed: number): RegionPick {
  const rng = createSeededRng(seed);
  const country = REGION_MANIFEST[Math.floor(rng() * REGION_MANIFEST.length)];
  const level = (country.levels[0]?.key as RegionLevelKey) ?? 'regions';
  return { cca3: country.cca3, name: country.name, name_en: country.name_en, unit: country.unit, level };
}

/** Solo "Régions Géo": pick a country/level, then play; back returns to the picker. */
export default function RegionGameFlow({
  setGameMode,
  user,
  onPlayChallengeOnline,
  dailySeed,
  onDailyComplete,
  isDaily,
  onShare,
  onDailyScoreChange,
}: RegionGameFlowProps) {
  // Daily run: a fixed single country for the day, played straight away (no picker).
  const [picks, setPicks] = useState<RegionPick[] | null>(() =>
    isDaily && dailySeed != null ? [pickDailyCountry(dailySeed)] : null,
  );
  // A country-specific quiz chosen from the picker (solo only).
  const [quiz, setQuiz] = useState<Challenge | null>(null);

  if (quiz) {
    return <ChallengeQuiz challenge={quiz} onExit={() => setQuiz(null)} />;
  }

  if (!picks || picks.length === 0) {
    return (
      <RegionCountryPicker
        onPick={setPicks}
        onBack={() => setGameMode('menu')}
        onPickChallenge={isDaily ? undefined : setQuiz}
        onPickChallengeOnline={isDaily ? undefined : onPlayChallengeOnline ? (ch) => onPlayChallengeOnline(ch.id) : undefined}
      />
    );
  }

  return (
    <FindRegionGame
      setGameMode={setGameMode}
      picks={picks}
      user={user}
      onBack={isDaily ? () => setGameMode('menu') : () => setPicks(null)}
      dailySeed={dailySeed}
      onDailyComplete={onDailyComplete}
      isDaily={isDaily}
      onShare={onShare}
      onDailyScoreChange={onDailyScoreChange}
    />
  );
}
