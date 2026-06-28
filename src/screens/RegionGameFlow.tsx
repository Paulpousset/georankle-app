import { useState } from 'react';
import type { User } from '@supabase/supabase-js';

import type { GameMode } from '../types';
import { createSeededRng } from '../lib/rng';
import { REGION_MANIFEST } from '../../assets/regions';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import FindRegionGame, { type RegionLevelKey } from './FindRegionGame';
import RegionCountryPicker, { type RegionPick } from './RegionCountryPicker';

interface RegionGameFlowProps {
  setGameMode: (mode: GameMode) => void;
  user?: User | null;
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
  dailySeed,
  onDailyComplete,
  isDaily,
  onShare,
  onDailyScoreChange,
}: RegionGameFlowProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  // Daily run: a fixed country for the day, played straight away (no picker).
  const [pick, setPick] = useState<RegionPick | null>(() =>
    isDaily && dailySeed != null ? pickDailyCountry(dailySeed) : null,
  );

  if (!pick) {
    return (
      <RegionCountryPicker
        onPick={setPick}
        onBack={() => setGameMode('menu')}
      />
    );
  }

  return (
    <FindRegionGame
      setGameMode={setGameMode}
      country={{ cca3: pick.cca3, name: pick.name, name_en: pick.name_en, unit: pick.unit }}
      level={pick.level}
      user={user}
      onBack={isDaily ? () => setGameMode('menu') : () => setPick(null)}
      dailySeed={dailySeed}
      onDailyComplete={onDailyComplete}
      isDaily={isDaily}
      onShare={onShare}
      onDailyScoreChange={onDailyScoreChange}
    />
  );
}
