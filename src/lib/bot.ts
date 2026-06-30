/**
 * Client-side matchmaking bot — a heuristic "plays like a human" opponent used
 * when no real player is found quickly (see RankedMatchmaking). It is NOT a real
 * online opponent: the match runs entirely on-device (BotMatch.tsx) and never
 * touches ELO. The point is a believable filler, not a perfect engine.
 *
 * Skill is calibrated to a target rating: stronger bots answer more often and
 * faster, but always with human-like variance (occasional misses even when
 * strong, occasional good rounds when weak). Each ranked mode is simulated on its
 * own *native* scoring scale (globe = correct×1000, versus = 0..25, classic =
 * 0..100, …); BotMatch then runs that raw score through normalizeRoundScore — the
 * same 0–1000 mapping the human's screen applies — before deciding the round, so
 * the comparison is fair across modes.
 */

import type { AvatarConfig, AvatarLayer, CosmeticCategory, MatchMode } from '../types';
import { getCategoryParts, LAYER_ORDER, TINT_PALETTES } from '../data/cosmetics';
import { calcScore } from './gameLogic';

export interface BotRoundConfig {
  /** Questions/rounds in the set, for the modes that have a configurable length. */
  roundsPerSet?: number;
}

export interface BotRoundResult {
  /** Raw score in this mode's native units — caller normalizes before comparing. */
  score: number;
  /** Rough "thinking" time before the bot finishes the round, for pacing. */
  finishMs: number;
}

export interface BotProfile {
  /** Random, human-looking username (never reveals the opponent is a bot). */
  name: string;
  /** Hidden skill rating, near the player's, that drives the simulation. */
  rating: number;
  /** A believable equipped "World" identity (procedural globe + cosmetics). */
  avatarConfig: AvatarConfig;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * Fraction of items a bot answers correctly, from its target rating. ~0.45 in
 * low bronze, ~0.58 gold, ~0.75 diamond, ~0.85 master; clamped to [0.4, 0.95]
 * so it never feels robotic-perfect nor hopeless.
 */
export function botSkill(rating: number): number {
  return clamp(0.4 + ((rating - 800) / 2000) * 0.5, 0.4, 0.95);
}

/** Bernoulli trial. */
const hit = (p: number, rng: () => number) => rng() < p;

/**
 * Simulate one round for the bot in `mode`, returning a score on that mode's real
 * scale plus a plausible finish time. `rng` is injectable for deterministic tests.
 */
export function simulateBotRound(
  mode: MatchMode,
  cfg: BotRoundConfig,
  rating: number,
  rng: () => number = Math.random,
): BotRoundResult {
  const p = botSkill(rating);
  const n = Math.max(1, cfg.roundsPerSet ?? 5);
  let score = 0;
  let ms = 0;

  switch (mode) {
    case 'versus': {
      // Per question: CASH(5) / CARRE(3) when confident, 1 when unsure, 0 when wrong.
      for (let i = 0; i < n; i++) {
        if (hit(p, rng)) {
          score += rng() < 0.6 ? 5 : 3;
          ms += 1500 + rng() * 2500;
        } else if (rng() < 0.5) {
          score += 1;
          ms += 2500 + rng() * 3500;
        } else {
          ms += 2000 + rng() * 3000;
        }
      }
      break;
    }
    case 'globe':
    case 'regions': {
      // 1000 per correctly located country / region (same scale).
      for (let i = 0; i < n; i++) {
        if (hit(p, rng)) score += 1000;
        ms += 1800 + rng() * 3500;
      }
      break;
    }
    case 'guess': {
      // One mystery country; better skill → fewer guesses → higher calcScore.
      let guesses = 1;
      while (guesses < 10 && !hit(p, rng)) guesses++;
      score = calcScore(guesses);
      ms = guesses * (1500 + rng() * 2500);
      break;
    }
    case 'streak': {
      // Consecutive correct answers until the first miss.
      let s = 0;
      while (hit(p, rng) && s < 30) s++;
      score = s;
      ms = (s + 1) * (1200 + rng() * 1800);
      break;
    }
    case 'classic':
    default: {
      // Efficiency percentage (0..100, higher is better).
      const base = 55 + p * 45;
      score = Math.round(clamp(base + (rng() - 0.5) * 16, 30, 100));
      ms = 8 * 1500 + 2000 + rng() * 3000;
      break;
    }
  }

  return { score, finishMs: Math.round(ms) };
}

// ── Believable identity (username + equipped World) ──────────────────────────
// The opponent must read as a real player, so names are assembled from
// international first names and geo/cosmos words in several human styles
// (separators, casing, trailing numbers), and the avatar is a real equipped
// cosmetic config picked from the catalog — never the obvious default look.

const FIRST_NAMES = [
  'Leo', 'Mila', 'Hugo', 'Sara', 'Noah', 'Ines', 'Liam', 'Aya', 'Tom', 'Lena',
  'Yuki', 'Kenji', 'Ravi', 'Nina', 'Max', 'Elsa', 'Omar', 'Lucas', 'Emma', 'Diego',
  'Zoe', 'Theo', 'Maya', 'Finn', 'Lina', 'Anya', 'Kai', 'Nora', 'Sami', 'Iris',
];

const GEO_WORDS = [
  'Atlas', 'Globe', 'Terra', 'Meridian', 'Nomad', 'Compass', 'Borealis', 'Sahara',
  'Andes', 'Polar', 'Delta', 'Fjord', 'Savane', 'Tundra', 'Mistral', 'Carto',
  'Orbit', 'Zenith', 'Horizon', 'Tropic', 'Pangea', 'Equateur', 'Boreal',
];

/** Assemble one random, human-looking username. */
function makeBotName(rng: () => number): string {
  const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)] ?? 'Leo';
  const word = GEO_WORDS[Math.floor(rng() * GEO_WORDS.length)] ?? 'Atlas';
  const num = Math.floor(rng() * 90) + 10; // 10..99
  switch (Math.floor(rng() * 6)) {
    case 0: return `${first}_${word}`;
    case 1: return `${word.toLowerCase()}${first.toLowerCase()}`;
    case 2: return `${word}${num}`;
    case 3: return `${first.toLowerCase()}.${word.toLowerCase()}`;
    case 4: return `${word}${first}`;
    default: return `${first}_${num}`;
  }
}

// Rarer cosmetics are less likely, so the generated look feels like a real
// collection (mostly common/uncommon with the occasional flashy piece).
const RARITY_WEIGHT: Record<string, number> = {
  common: 1, uncommon: 0.6, rare: 0.32, epic: 0.16, legendary: 0.07,
};

/** Weighted-random part for a slot, favouring lower rarities. */
function pickPart(category: CosmeticCategory, rng: () => number) {
  const parts = getCategoryParts(category);
  const weights = parts.map((p) => RARITY_WEIGHT[p.rarity] ?? 0.2);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < parts.length; i++) {
    r -= weights[i];
    if (r <= 0) return parts[i];
  }
  return parts[0];
}

/** A random, valid equipped "World" config (one weighted pick per slot). */
export function makeBotAvatarConfig(rng: () => number = Math.random): AvatarConfig {
  const layers = {} as Record<CosmeticCategory, AvatarLayer>;
  for (const cat of LAYER_ORDER) {
    const part = pickPart(cat, rng);
    let tint: string | null = part.defaultTint ?? null;
    if (cat === 'cosmos' && part.tintable) {
      const palette = TINT_PALETTES.cosmos ?? [];
      if (palette.length) tint = palette[Math.floor(rng() * palette.length)] ?? tint;
    }
    layers[cat] = { id: part.id, tint };
  }
  return { v: 4, useCustom: true, layers };
}

/**
 * A believable opponent profile near the player's rating (±150, never below
 * 100), with a random username and a random equipped World. `rng` injectable
 * for tests.
 */
export function makeBotProfile(playerRating: number, rng: () => number = Math.random): BotProfile {
  const name = makeBotName(rng);
  const rating = Math.max(100, Math.round(playerRating + (rng() * 2 - 1) * 150));
  const avatarConfig = makeBotAvatarConfig(rng);
  return { name, rating, avatarConfig };
}
