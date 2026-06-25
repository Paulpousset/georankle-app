/**
 * Daily Challenge — core logic shared by every solo mode.
 *
 * The whole point is determinism + retention:
 *  - Every solo mode has one puzzle per UTC day, identical for all players.
 *    The puzzle is driven by a seed derived from the date + mode (`seedFor`),
 *    fed into the same `createSeededRng` the multiplayer sync already uses, so a
 *    daily run reuses each mode's existing seeded code path untouched.
 *  - A single attempt per day per mode; results + a global "daily streak" are
 *    cached locally (AsyncStorage) so the feature works logged-out, and synced
 *    to Supabase (server-authoritative) once the user is signed in.
 *
 * Streak rules (used identically client-side and in the `complete_daily` RPC):
 *   lastDate == today      → unchanged (already played something today)
 *   lastDate == yesterday  → +1
 *   otherwise              → reset to 1
 */
import type { User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { GameMode, Language } from '../types';
import { supabase } from './supabase';
import { tr } from '../i18n';

/** The solo modes that have a daily challenge (mirrors MainMenu's solo list). */
export const DAILY_MODES: GameMode[] = [
  'classic',
  'streak',
  'guess',
  'globe',
  'regions',
  'quiz-capital',
  'quiz-flag',
  'quiz-mix',
];

/** Day index 0 maps to this UTC date — only affects the displayed "#N". */
const PUZZLE_EPOCH_UTC = Date.UTC(2024, 0, 1);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** One stored daily result for a (date, mode). `grid` is the emoji share block. */
export interface DailyResult {
  mode: GameMode;
  date: string;
  score: number;
  grid?: string;
}

/** The state surfaced to the UI (today's completions + the global streak). */
export interface DailyState {
  streak: number;
  best: number;
  /** Number of modes completed today. */
  todayCount: number;
  /** Today's results keyed by mode. */
  results: Record<string, DailyResult>;
}

/** What we persist locally — only today's completions are kept (bounded). */
interface StoredState {
  streak: number;
  best: number;
  /** Last UTC date with ≥1 completion (drives the streak). */
  lastDate: string | null;
  today: { date: string; results: Record<string, DailyResult> };
}

const STORAGE_KEY = 'daily:state';

// ── Date / seed helpers ──────────────────────────────────────────────────────

/** UTC day index since the epoch above — the puzzle number shown as "#N". */
export function getPuzzleNumber(d: Date = new Date()): number {
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((utc - PUZZLE_EPOCH_UTC) / MS_PER_DAY);
}

/** Today's UTC date as `YYYY-MM-DD`. The "day" is global (UTC) for everyone. */
export function getTodayUTC(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Milliseconds until the next UTC midnight — for the "comes back tomorrow" timer. */
export function msUntilNextPuzzle(d: Date = new Date()): number {
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return next - d.getTime();
}

/** Difference in whole days between two `YYYY-MM-DD` strings (a - b). */
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / MS_PER_DAY);
}

/**
 * Deterministic per-(date, mode) seed via FNV-1a over `${date}:${mode}`.
 * Distinct mode → distinct puzzle; same inputs → same seed forever.
 */
export function seedFor(date: string, mode: GameMode): number {
  const s = `${date}:${mode}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Pure streak transition. Returns the new streak/best/lastDate given the prior
 * values and the date being completed. Exported for unit testing and reused by
 * the server RPC's logic (kept in sync intentionally).
 */
export function computeStreak(
  prev: { streak: number; best: number; lastDate: string | null },
  date: string,
): { streak: number; best: number; lastDate: string } {
  let streak: number;
  if (prev.lastDate === date) {
    streak = prev.streak; // already counted today
  } else if (prev.lastDate && dayDiff(date, prev.lastDate) === 1) {
    streak = prev.streak + 1;
  } else {
    streak = 1;
  }
  return { streak, best: Math.max(prev.best, streak), lastDate: date };
}

// ── Local persistence ────────────────────────────────────────────────────────

const EMPTY_STORED: StoredState = {
  streak: 0,
  best: 0,
  lastDate: null,
  today: { date: '', results: {} },
};

async function readStored(): Promise<StoredState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_STORED };
    const parsed = JSON.parse(raw) as StoredState;
    return { ...EMPTY_STORED, ...parsed };
  } catch {
    return { ...EMPTY_STORED };
  }
}

async function writeStored(state: StoredState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best-effort — losing the cache only resets local progress, not server.
  }
}

/** Normalise stored → today: a stale `today` block (older date) reads as empty. */
function toState(stored: StoredState, today: string): DailyState {
  const results = stored.today.date === today ? stored.today.results : {};
  // If lastDate is neither today nor yesterday, the streak is broken → show 0.
  const alive =
    stored.lastDate != null &&
    (stored.lastDate === today || dayDiff(today, stored.lastDate) === 1);
  return {
    streak: alive ? stored.streak : 0,
    best: stored.best,
    todayCount: Object.keys(results).length,
    results,
  };
}

/** Current daily state (streak + today's completions), normalised to today. */
export async function getLocalState(): Promise<DailyState> {
  return toState(await readStored(), getTodayUTC());
}

/** Record a completion locally (keeping the best score) and advance the streak. */
async function recordLocal(result: DailyResult): Promise<StoredState> {
  const stored = await readStored();
  const date = result.date;

  // Reset today's block when the day rolls over.
  if (stored.today.date !== date) stored.today = { date, results: {} };

  const existing = stored.today.results[result.mode];
  if (!existing || result.score > existing.score) {
    stored.today.results[result.mode] = result;
  }

  const next = computeStreak(stored, date);
  stored.streak = next.streak;
  stored.best = next.best;
  stored.lastDate = next.lastDate;

  await writeStored(stored);
  return stored;
}

// ── Server sync ──────────────────────────────────────────────────────────────

/**
 * Record a daily completion. Always updates the local cache; when signed in,
 * also calls the server-authoritative RPC and adopts its streak values. Never
 * throws — a network failure leaves the local state intact.
 */
export async function completeDaily(user: User | null, result: DailyResult): Promise<DailyState> {
  const stored = await recordLocal(result);
  const today = getTodayUTC();

  if (user) {
    try {
      const { data, error } = await supabase.rpc('complete_daily', {
        p_date: result.date,
        p_mode: result.mode,
        p_score: result.score,
        p_grid: result.grid ?? null,
      });
      if (!error && data) {
        stored.streak = data.streak ?? stored.streak;
        stored.best = data.best_streak ?? stored.best;
        stored.lastDate = today;
        await writeStored(stored);
      }
    } catch {
      // Keep the optimistic local result; server will reconcile on next sync.
    }
  }

  return toState(stored, today);
}

/**
 * On login, push any of today's locally-recorded results to the server (the RPC
 * is idempotent per (user, date, mode)), then adopt the server's streak. Past
 * logged-out days beyond today are not migrated. Never throws.
 */
export async function syncOnLogin(_user: User): Promise<void> {
  try {
    const stored = await readStored();
    const today = getTodayUTC();
    const todays = stored.today.date === today ? Object.values(stored.today.results) : [];

    let serverStreak = stored.streak;
    let serverBest = stored.best;
    for (const r of todays) {
      const { data, error } = await supabase.rpc('complete_daily', {
        p_date: r.date,
        p_mode: r.mode,
        p_score: r.score,
        p_grid: r.grid ?? null,
      });
      if (!error && data) {
        serverStreak = data.streak ?? serverStreak;
        serverBest = data.best_streak ?? serverBest;
      }
    }

    // Adopt the larger streak so a logged-out run isn't punished on login.
    stored.streak = Math.max(serverStreak, stored.streak);
    stored.best = Math.max(serverBest, stored.best);
    await writeStored(stored);
  } catch {
    // Sync is best-effort; local cache remains usable offline.
  }
}

// ── Display helpers ──────────────────────────────────────────────────────────

/** Short title for a daily mode card (FR/EN), matching MainMenu's wording. */
export function dailyModeLabel(mode: GameMode, language: Language): string {
  switch (mode) {
    case 'classic':
      return 'Rankle';
    case 'streak':
      return tr(language, 'Streak', 'Streak');
    case 'guess':
      return tr(language, 'Devine le Pays', 'Guess Country');
    case 'globe':
      return tr(language, 'Globe Géo', 'Geo Globe');
    case 'regions':
      return tr(language, 'Régions Géo', 'Geo Regions');
    case 'quiz-capital':
      return tr(language, 'Capitales', 'Capitals');
    case 'quiz-flag':
      return tr(language, 'Drapeaux', 'Flags');
    case 'quiz-mix':
      return 'Mix';
    default:
      return mode;
  }
}
