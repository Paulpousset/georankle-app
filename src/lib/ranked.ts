import type { MatchMode } from '../types';
import { createSeededRng, seededShuffle } from './rng';

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

export function getBestOfForRank(rank: RankInfo): number {
  if (rank.tier === 'bronze' || rank.tier === 'silver') return 3;
  return 5;
}

const RANKED_MODES: MatchMode[] = ['classic', 'streak', 'versus', 'globe', 'guess'];

export function generateRankedModes(bestOf: number, seed: number): MatchMode[] {
  const rng = createSeededRng(seed + 0xdeadbeef);
  const shuffled = seededShuffle([...RANKED_MODES], rng);
  return shuffled.slice(0, bestOf);
}

export function calculateEloChange(
  myElo: number,
  opponentElo: number,
  won: boolean,
): number {
  const K = 32;
  const expected = 1 / (1 + Math.pow(10, (opponentElo - myElo) / 400));
  const score = won ? 1 : 0;
  return Math.round(K * (score - expected));
}

export function modeLabel(mode: MatchMode, lang: 'fr' | 'en'): string {
  const labels: Record<MatchMode, [string, string]> = {
    classic: ['Classique', 'Classic'],
    streak: ['Streak', 'Streak'],
    versus: ['Versus', 'Versus'],
    globe: ['Globe Géo', 'Geo Globe'],
    guess: ['Devine le Pays', 'Guess Country'],
  };
  return lang === 'fr' ? labels[mode][0] : labels[mode][1];
}
