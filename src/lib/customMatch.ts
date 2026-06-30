/**
 * Custom online matches — the online sibling of the local "Partie personnalisée"
 * parcours ([src/screens/LocalParcours.tsx]).
 *
 * A custom match is a user-built *sequence* of online rounds (manches), each with
 * its own mode + length, played against one online opponent as a best-of series.
 * It reuses the exact same multi-mode-per-round engine that ranked matches use
 * (`game_data.modes` → `rankedModesRef` in useMatchEngine): each round draws the
 * next mode from the sequence, with per-round config read from `game_data.rounds`.
 *
 * The `versus` modes (capitals/flags) are distinguished by `questionType`. A
 * `regions` round (the "Défis Pays" map game) also carries its own country +
 * division level, picked in the builder and stored on the round.
 */

import { createSeededRng, seededShuffle } from './rng';
import { gameData as gd } from '../data/gameData';
import { pickRoundCountries } from './matchCountries';
import type { Language, MatchMode } from '../types';

const SESSION_SIZE = 8;

/** A country + division level for a `regions` round (mirrors RegionPick). */
export interface CustomRegionPick {
  cca3: string;
  name: string;
  name_en: string;
  unit?: string | null;
  level: 'regions' | 'departments';
}

/** Builder identity for one custom round. `capital`/`flag` are both `versus`. */
export type OnlineModeKey = 'capital' | 'flag' | 'classic' | 'streak' | 'globe' | 'guess' | 'regions';

export const ONLINE_MODE_ORDER: OnlineModeKey[] = [
  'capital',
  'flag',
  'guess',
  'classic',
  'streak',
  'globe',
  'regions',
];

interface OnlineModeMeta {
  key: OnlineModeKey;
  mode: MatchMode;
  questionType?: 'CAPITAL' | 'FLAG';
  /** Whether the round length (question count) is user-configurable. */
  configurable: boolean;
  defaultCount: number;
  /** `regions` rounds require a country/level pick before they can be added. */
  needsRegion?: boolean;
  fr: string;
  en: string;
  unitFr: string;
  unitEn: string;
}

export const ONLINE_MODES: Record<OnlineModeKey, OnlineModeMeta> = {
  capital: { key: 'capital', mode: 'versus', questionType: 'CAPITAL', configurable: true, defaultCount: 5, fr: 'Capitales', en: 'Capitals', unitFr: 'questions', unitEn: 'questions' },
  flag: { key: 'flag', mode: 'versus', questionType: 'FLAG', configurable: true, defaultCount: 5, fr: 'Drapeaux', en: 'Flags', unitFr: 'questions', unitEn: 'questions' },
  guess: { key: 'guess', mode: 'guess', configurable: false, defaultCount: 1, fr: 'Devine le Pays', en: 'Guess Country', unitFr: 'pays mystère', unitEn: 'mystery country' },
  classic: { key: 'classic', mode: 'classic', configurable: false, defaultCount: 1, fr: 'Rankle', en: 'Rankle', unitFr: '8 thèmes', unitEn: '8 themes' },
  streak: { key: 'streak', mode: 'streak', configurable: false, defaultCount: 1, fr: 'Streak', en: 'Streak', unitFr: "jusqu'à l'erreur", unitEn: 'until a miss' },
  globe: { key: 'globe', mode: 'globe', configurable: true, defaultCount: 5, fr: 'Globe Géo', en: 'Geo Globe', unitFr: 'rounds', unitEn: 'rounds' },
  regions: { key: 'regions', mode: 'regions', configurable: true, defaultCount: 5, needsRegion: true, fr: 'Défis Pays', en: 'Country Challenges', unitFr: 'régions', unitEn: 'regions' },
};

/** One manche as configured in the builder. */
export interface CustomRound {
  id: string;
  key: OnlineModeKey;
  /** Question count (only meaningful when the mode is `configurable`). */
  count: number;
  /** The chosen country + level — required for `regions` rounds. */
  region?: CustomRegionPick;
}

/** Per-round config persisted in `game_data.rounds` (read by the game screens). */
export interface CustomRoundCfg {
  mode: MatchMode;
  questionType?: 'CAPITAL' | 'FLAG';
  /** Question count — read as `roundsPerSet` by versus/globe/regions. */
  count?: number;
  /** `regions` rounds: the country + level both players play this round. */
  region?: CustomRegionPick;
}

/** Shape of the `game_data` JSONB a custom match stores. */
export interface CustomGameData {
  seed: number;
  is_custom: true;
  /** modes[i] is the MatchMode for round (i + 1); length === best_of. */
  modes: MatchMode[];
  /** rounds[i] is the per-round config for round (i + 1). */
  rounds: CustomRoundCfg[];
  /** Pre-computed Rankle sessions, keyed by round number (classic rounds only). */
  sessions: Record<number, { themeIds: string[]; countryCca3s: string[] }>;
  /** Deduplicated answer countries per round (guess/globe/versus); no repeats across modes. */
  roundCountries: Record<number, string[]>;
  /** Global fallbacks for any screen that still reads the flat config. */
  questionType: 'CAPITAL' | 'FLAG';
  roundsPerSet: number;
}

export const modeKeyLabel = (key: OnlineModeKey, lang: Language): string =>
  lang === 'fr' ? ONLINE_MODES[key].fr : ONLINE_MODES[key].en;

let roundCounter = 0;
export const newCustomRound = (key: OnlineModeKey, region?: CustomRegionPick): CustomRound => ({
  id: `cr${roundCounter++}`,
  key,
  count: ONLINE_MODES[key].defaultCount,
  ...(region ? { region } : {}),
});

/** Builds a single Rankle session (themes + countries) for one round. */
function buildClassicSession(seed: number, roundNumber: number) {
  const rand = createSeededRng(seed + (roundNumber - 1) * 997);
  const allThemeIds = Object.keys(gd.themes).filter(
    (id) => gd.countries.filter((co) => co.ranks?.[id] !== undefined).length > 10,
  );
  const themeIds = seededShuffle(allThemeIds, rand).slice(0, SESSION_SIZE);
  let countries = gd.countries.filter((co) =>
    themeIds.every((id) => co.ranks?.[id] !== undefined && co.data?.[id] !== undefined),
  );
  if (countries.length < SESSION_SIZE) {
    countries = [...gd.countries].sort(
      (a, b) => Object.keys(b.ranks).length - Object.keys(a.ranks).length,
    );
  }
  const countryCca3s = seededShuffle(countries, rand).slice(0, SESSION_SIZE).map((co) => co.cca3);
  return { themeIds, countryCca3s };
}

/**
 * Builds the `game_data` payload for a custom match from the configured rounds.
 * `best_of` for the match is `rounds.length`; the match's `game_mode` column
 * should be set to the first round's mode (`modes[0]`).
 */
export function buildCustomGameData(rounds: CustomRound[], seed: number): CustomGameData {
  const modes: MatchMode[] = [];
  const cfgs: CustomRoundCfg[] = [];
  const sessions: Record<number, { themeIds: string[]; countryCca3s: string[] }> = {};

  const perRoundCounts: Record<number, number> = {};
  const questionTypes: Record<number, 'CAPITAL' | 'FLAG'> = {};

  rounds.forEach((r, i) => {
    const meta = ONLINE_MODES[r.key];
    modes.push(meta.mode);
    cfgs.push({
      mode: meta.mode,
      ...(meta.questionType ? { questionType: meta.questionType } : {}),
      ...(meta.configurable ? { count: r.count } : {}),
      ...(r.region ? { region: r.region } : {}),
    });
    perRoundCounts[i + 1] = meta.configurable ? r.count : meta.defaultCount;
    if (meta.questionType) questionTypes[i + 1] = meta.questionType;
    if (meta.mode === 'classic') sessions[i + 1] = buildClassicSession(seed, i + 1);
  });

  // No answer country repeats across modes: precompute per-round countries with
  // every classic session's countries already reserved.
  const preUsed = Object.values(sessions).flatMap((s) => s.countryCca3s);
  const roundCountries = pickRoundCountries(seed, modes, { perRoundCounts, questionTypes, preUsed });

  return {
    seed,
    is_custom: true,
    modes,
    rounds: cfgs,
    sessions,
    roundCountries,
    questionType: cfgs.find((c) => c.questionType)?.questionType ?? 'CAPITAL',
    roundsPerSet: cfgs.find((c) => c.count != null)?.count ?? 5,
  };
}

/** Rounds needed to win a best-of-`bestOf` series. */
export const winTarget = (bestOf: number): number => Math.ceil(bestOf / 2);

/** Short summary of a custom match's modes, e.g. "Capitales · Rankle · Streak". */
export function summariseCustomModes(gameData: unknown, lang: Language): string {
  const gdAny = gameData as { rounds?: CustomRoundCfg[]; modes?: MatchMode[] } | null;
  const rounds = gdAny?.rounds;
  if (!rounds?.length) return '';
  const labels = rounds.map((r) => {
    if (r.mode === 'versus') return lang === 'fr'
      ? (r.questionType === 'FLAG' ? 'Drapeaux' : 'Capitales')
      : (r.questionType === 'FLAG' ? 'Flags' : 'Capitals');
    const key = (Object.keys(ONLINE_MODES) as OnlineModeKey[]).find((k) => ONLINE_MODES[k].mode === r.mode);
    return key ? modeKeyLabel(key, lang) : r.mode;
  });
  return labels.join(' · ');
}
