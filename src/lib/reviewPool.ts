/**
 * "Mes erreurs" — the countries you got wrong, remembered per mode.
 *
 * Solo play used to be amnesiac: `scores` and `daily_results` store totals, so
 * missing Kyrgyzstan five times in a row left no trace and the game never
 * showed it to you again on purpose. This is the missing memory, and it is what
 * turns the solo tab into something you can actually revise with.
 *
 * The spacing rule is deliberately light — a country enters on a miss and
 * leaves after GRADUATION_STREAK consecutive hits. Real spaced repetition
 * (SM-2 and friends) schedules by date, which needs the player to come back on
 * the app's terms; here the pool is simply "what you don't know yet", drained
 * by getting it right twice.
 *
 * Purely local (AsyncStorage): no table, no migration, and it works logged out.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { log } from './log';
import type { GameMode } from '../types';
import type { RecapEntry } from '../components/RunRecap';

// Re-exported so callers that already hold the pool have one import to reach
// for; the implementations are pure and live away from AsyncStorage.
export { orderByReview, orderCca3sByReview } from './reviewOrder';

/**
 * Modes that feed and can replay the review pool.
 *
 * Only the identification modes qualify: their question *is* "which country is
 * this?", so a missed country is a fact to relearn. Streak, Plus ou Moins and
 * Rankle ask about themes and rankings instead — missing one says nothing about
 * the country itself, so revising a list of countries there would be noise.
 */
export const REVIEW_MODES: readonly GameMode[] = [
  'globe',
  'guess',
  'silhouette',
  'pinpoint',
  'quiz-capital',
  'quiz-flag',
];

/** Consecutive correct answers that retire a country from the pool. */
export const GRADUATION_STREAK = 2;

/** Hard cap per mode so a long history can't grow unbounded in storage. */
const MAX_ENTRIES = 200;

const STORAGE_VERSION = 1;
const storageKey = (mode: GameMode) => `review:v${STORAGE_VERSION}:${mode}`;

export interface ReviewEntry {
  /** How many times this country has been missed, all-time. */
  misses: number;
  /** Consecutive correct answers since the last miss. */
  streak: number;
  /** ISO date of the last time it came up. */
  lastSeen: string;
}

export type ReviewTable = Record<string, ReviewEntry>;

async function read(mode: GameMode): Promise<ReviewTable> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(mode));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ReviewTable;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // Corrupt or unreadable storage: an empty pool is always safe.
    return {};
  }
}

async function write(mode: GameMode, table: ReviewTable): Promise<void> {
  try {
    // Keep the most-missed entries when trimming — they're the ones worth
    // revising, and the tail is mostly near-graduated countries.
    const entries = Object.entries(table);
    const trimmed =
      entries.length <= MAX_ENTRIES
        ? table
        : Object.fromEntries(
            entries.sort((a, b) => b[1].misses - a[1].misses).slice(0, MAX_ENTRIES),
          );
    await AsyncStorage.setItem(storageKey(mode), JSON.stringify(trimmed));
  } catch (e) {
    log.warn('review pool write failed', e);
  }
}

/**
 * Folds one finished run into the mode's pool.
 *
 * A miss adds (or re-arms) the country. A hit only matters for a country
 * already in the pool: it advances the streak, and graduates it out at
 * GRADUATION_STREAK. Countries you've never missed are never tracked, so the
 * pool stays a list of weaknesses rather than a play log.
 *
 * `today` is injectable so tests don't depend on the clock.
 */
export async function recordRun(
  mode: GameMode,
  entries: RecapEntry[],
  today = new Date().toISOString().slice(0, 10),
): Promise<void> {
  const withCountry = entries.filter((e) => e.cca3);
  if (!withCountry.length) return;

  const table = await read(mode);
  for (const entry of withCountry) {
    const cca3 = entry.cca3!;
    const current = table[cca3];
    if (!entry.ok) {
      table[cca3] = {
        misses: (current?.misses ?? 0) + 1,
        streak: 0,
        lastSeen: today,
      };
      continue;
    }
    if (!current) continue; // never missed → nothing to revise
    const streak = current.streak + 1;
    if (streak >= GRADUATION_STREAK) {
      delete table[cca3];
    } else {
      table[cca3] = { ...current, streak, lastSeen: today };
    }
  }
  await write(mode, table);
}

/** The countries still to revise for a mode, most-missed first. */
export async function reviewCountries(mode: GameMode): Promise<string[]> {
  const table = await read(mode);
  return Object.entries(table)
    .sort((a, b) => b[1].misses - a[1].misses || a[0].localeCompare(b[0]))
    .map(([cca3]) => cca3);
}

/** How many countries are pending for a mode. */
export async function reviewCount(mode: GameMode): Promise<number> {
  return Object.keys(await read(mode)).length;
}

/** Pending counts for several modes at once (drives the menu entry). */
export async function reviewCounts(
  modes: readonly GameMode[],
): Promise<Partial<Record<GameMode, number>>> {
  const pairs = await Promise.all(
    modes.map(async (mode) => [mode, await reviewCount(mode)] as const),
  );
  return Object.fromEntries(pairs.filter(([, n]) => n > 0));
}

/** Forgets a mode's pool (used by the "tout effacer" action and by tests). */
export async function clearReviewPool(mode: GameMode): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(mode));
  } catch {
    // ignore
  }
}
