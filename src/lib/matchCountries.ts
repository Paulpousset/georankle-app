/**
 * Deterministic, deduplicated answer-country assignment for a whole match.
 *
 * In a multi-mode ranked / custom match, each round used to pick its answer
 * country independently from a per-round seed, so the same country could show up
 * as the answer in several rounds (e.g. the "guess" country reappearing as a
 * globe target). Because both online players must pick the SAME country per round
 * deterministically, the dedup also has to be deterministic — so we precompute
 * the per-round country assignment once at match creation and store it in
 * `game_data.roundCountries`; both clients then just read their assigned cca3s.
 *
 * Modes that don't resolve to a single answer country are out of scope: `classic`
 * uses an 8-country session (precomputed separately — its countries are fed into
 * the used-set here so single-country rounds avoid them), `streak` runs its own
 * question stream, and `regions` is region-based and never shares a match.
 */
import { createSeededRng, seededShuffle } from './rng';
import { gameData as gd } from '../data/gameData';
import { inBand } from './notoriety';
import rawCountriesStats from '../../assets/countries_stats.json';
import type { MatchMode } from '../types';

type Stat = { cca3: string; capital?: string };
const STATS = rawCountriesStats as unknown as Stat[];

/** Eligible cca3 pool per mode (mirrors each screen's own country source). */
function poolFor(mode: MatchMode, questionType?: 'CAPITAL' | 'FLAG'): string[] {
  switch (mode) {
    case 'guess':
      // GuessCountryGame draws from gameData.countries.
      return (gd.countries as { cca3: string }[]).map((c) => c.cca3);
    case 'globe':
      // FindCountryGame draws from countries_stats.json.
      return STATS.map((c) => c.cca3);
    case 'versus':
      // VersusCapitals needs a real capital (flags work for any, but capitals
      // are the stricter filter — keep one pool so a round of either type fits).
      return STATS.filter((c) => c.capital && c.capital !== 'N/A').map((c) => c.cca3);
    default:
      return [];
  }
}

/** Modes whose answer country we assign here (single-answer / per-question). */
const ASSIGNED: ReadonlySet<MatchMode> = new Set<MatchMode>(['guess', 'globe', 'versus']);

/** Small per-mode salt so same-index rounds of different modes don't correlate. */
const MODE_SALT: Record<string, number> = { guess: 11, globe: 23, versus: 41 };

export interface PickRoundCountriesOpts {
  /** questions per round (1-based round number → count); default 1. */
  perRoundCounts?: Record<number, number>;
  /** versus rounds: 'CAPITAL' | 'FLAG' per round (affects nothing today, future-proof). */
  questionTypes?: Record<number, 'CAPITAL' | 'FLAG'>;
  /** cca3 already spoken for (e.g. every classic session's 8 countries). */
  preUsed?: string[];
}

/**
 * Builds `roundCountries`: round number (1-based) → ordered list of answer cca3s
 * (length = that round's question count). Walks rounds in order, never reusing a
 * cca3 across rounds, seeding the used-set with `preUsed`. Falls back to allowing
 * reuse (avoiding only within-round dupes) if a mode's pool is exhausted.
 */
export function pickRoundCountries(
  seed: number,
  modes: MatchMode[],
  opts: PickRoundCountriesOpts = {},
): Record<number, string[]> {
  const { perRoundCounts = {}, questionTypes = {}, preUsed = [] } = opts;
  const used = new Set<string>(preUsed);
  const out: Record<number, string[]> = {};

  modes.forEach((mode, i) => {
    const round = i + 1;
    if (!ASSIGNED.has(mode)) return;

    const count = Math.max(1, perRoundCounts[round] ?? 1);
    const pool = poolFor(mode, questionTypes[round]);
    if (pool.length === 0) return;

    const rng = createSeededRng(seed + i * 997 + (MODE_SALT[mode] ?? 0));
    const shuffled = seededShuffle(pool, rng);

    const picked: string[] = [];
    for (const cca3 of shuffled) {
      if (used.has(cca3)) continue;
      picked.push(cca3);
      used.add(cca3);
      if (picked.length === count) break;
    }
    // Pool exhausted by the global used-set: fill the remainder allowing reuse
    // across rounds but never within this round.
    if (picked.length < count) {
      for (const cca3 of shuffled) {
        if (picked.includes(cca3)) continue;
        picked.push(cca3);
        if (picked.length === count) break;
      }
    }

    out[round] = picked;
  });

  return out;
}

/**
 * Story mode: pick `count` answer cca3s for one level's mode, restricted to a
 * notoriety band so the game gets harder as the band slides toward obscure
 * countries. Reuses each mode's real pool (`poolFor`) and the same seeded
 * shuffle. If the band is too narrow to yield `count` distinct countries, it
 * falls back to the mode's full pool so a level is always playable.
 *
 * Returns the ordered cca3 list to drop straight into `game_data.roundCountries`.
 */
export function pickBandCountries(
  seed: number,
  mode: MatchMode,
  questionType: 'CAPITAL' | 'FLAG' | undefined,
  count: number,
  band: { minRank: number; maxRank: number } | null,
): string[] {
  const full = poolFor(mode, questionType);
  if (full.length === 0) return [];
  const n = Math.max(1, count);
  const banded = band
    ? full.filter((cca3) => inBand(cca3, band))
    : full;
  const pool = banded.length >= n ? banded : full;
  const rng = createSeededRng(seed);
  return seededShuffle(pool, rng).slice(0, n);
}
