import type { MatchMode } from '../types';
import { createSeededRng, seededShuffle } from './rng';
import { REGION_MANIFEST } from '../../assets/regions';

export type RankTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master';

export interface RankInfo {
  tier: RankTier;
  name: string;
  nameFr: string;
  color: string;
  darkColor: string;
  highlightColor: string;
  minElo: number;
  maxElo: number | null;
}

export const RANKS: RankInfo[] = [
  {
    tier: 'bronze',
    name: 'Bronze',
    nameFr: 'Bronze',
    color: '#cd7f32',
    darkColor: '#7a3e10',
    highlightColor: '#e8a060',
    minElo: 0,
    maxElo: 1199,
  },
  {
    tier: 'silver',
    name: 'Silver',
    nameFr: 'Argent',
    color: '#a0a8b0',
    darkColor: '#505860',
    highlightColor: '#d0d8e0',
    minElo: 1200,
    maxElo: 1499,
  },
  {
    tier: 'gold',
    name: 'Gold',
    nameFr: 'Or',
    color: '#ffd700',
    darkColor: '#9a6e00',
    highlightColor: '#fff0a0',
    minElo: 1500,
    maxElo: 1799,
  },
  {
    tier: 'platinum',
    name: 'Platinum',
    nameFr: 'Platine',
    color: '#4db8ff',
    darkColor: '#1a4a7a',
    highlightColor: '#a0d8ff',
    minElo: 1800,
    maxElo: 2099,
  },
  {
    tier: 'diamond',
    name: 'Diamond',
    nameFr: 'Diamant',
    color: '#80f0ff',
    darkColor: '#208090',
    highlightColor: '#c0faff',
    minElo: 2100,
    maxElo: 2399,
  },
  {
    tier: 'master',
    name: 'Master',
    nameFr: 'Maître',
    color: '#c084fc',
    darkColor: '#6020b0',
    highlightColor: '#e8c0ff',
    minElo: 2400,
    maxElo: null,
  },
];

export function getRankFromElo(elo: number): RankInfo {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (elo >= RANKS[i].minElo) return RANKS[i];
  }
  return RANKS[0];
}

export function getRankProgress(elo: number): number {
  const rank = getRankFromElo(elo);
  if (rank.maxElo === null) return 1;
  const range = rank.maxElo - rank.minElo + 1;
  return Math.min((elo - rank.minElo) / range, 1);
}

// Longer series the higher you climb: BO5 up to Silver, BO7 up to Diamond, BO9 above.
export function getBestOfForRank(rank: RankInfo): number {
  if (rank.tier === 'bronze' || rank.tier === 'silver') return 5;
  if (rank.tier === 'gold' || rank.tier === 'platinum' || rank.tier === 'diamond') return 7;
  return 9; // master
}

const RANKED_MODES: MatchMode[] = ['classic', 'streak', 'versus', 'globe', 'guess', 'regions'];

/** A seeded country + division level for a ranked `regions` round. */
export interface RankedRegionPick {
  cca3: string;
  name: string;
  name_en: string;
  unit?: string | null;
  level: 'regions' | 'departments';
}

/**
 * Deterministically pick the country + level for a ranked `regions` round from
 * the bundled region manifest. Both players read the stored result from
 * `game_data.regionRounds`, so they always play the same map. `roundNumber` is
 * 1-based so different regions rounds in the same series pick different countries.
 */
export function pickRankedRegion(seed: number, roundNumber: number): RankedRegionPick {
  const rng = createSeededRng((seed + roundNumber * 6151 + 0x5eed) | 0);
  const country = REGION_MANIFEST[Math.floor(rng() * REGION_MANIFEST.length)] ?? REGION_MANIFEST[0];
  const level = (country.levels[Math.floor(rng() * country.levels.length)]?.key ?? 'regions') as
    | 'regions'
    | 'departments';
  return { cca3: country.cca3, name: country.name, name_en: country.name_en, unit: country.unit, level };
}

export function generateRankedModes(bestOf: number, seed: number): MatchMode[] {
  const rng = createSeededRng(seed + 0xdeadbeef);
  const out: MatchMode[] = [];
  // BO7/BO9 exceed the pool size → cycle through reshuffled blocks, avoiding an
  // immediate repeat at the block boundary.
  while (out.length < bestOf) {
    const block = seededShuffle([...RANKED_MODES], rng);
    if (out.length && block[0] === out[out.length - 1] && block.length > 1) {
      [block[0], block[1]] = [block[1], block[0]];
    }
    out.push(...block);
  }
  return out.slice(0, bestOf);
}

/**
 * Asymmetric K-factor per tier: low ranks gain a lot / lose little (easy climb),
 * high ranks gain little / lose a lot (sticky ceiling). Each player uses the K of
 * their OWN current tier. Mirrored server-side in ranked_points_v2.sql.
 */
export const ELO_K: Record<RankTier, { gain: number; loss: number }> = {
  bronze: { gain: 40, loss: 16 },
  silver: { gain: 36, loss: 22 },
  gold: { gain: 32, loss: 28 },
  platinum: { gain: 28, loss: 32 },
  diamond: { gain: 24, loss: 36 },
  master: { gain: 20, loss: 40 },
};

export function calculateEloChange(
  myElo: number,
  opponentElo: number,
  won: boolean,
): number {
  const tier = getRankFromElo(myElo).tier;
  const k = won ? ELO_K[tier].gain : ELO_K[tier].loss;
  const expected = 1 / (1 + Math.pow(10, (opponentElo - myElo) / 400));
  const score = won ? 1 : 0;
  return Math.round(k * (score - expected));
}

export function modeLabel(mode: MatchMode, lang: 'fr' | 'en'): string {
  const labels: Record<MatchMode, [string, string]> = {
    classic: ['Rankle', 'Rankle'],
    streak: ['Streak', 'Streak'],
    versus: ['Versus', 'Versus'],
    globe: ['Globe Géo', 'Geo Globe'],
    guess: ['Devine le Pays', 'Guess Country'],
    regions: ['Défis Pays', 'Country Challenges'],
    challenge: ['Quiz Pays', 'Country Quiz'],
  };
  return lang === 'fr' ? labels[mode][0] : labels[mode][1];
}
