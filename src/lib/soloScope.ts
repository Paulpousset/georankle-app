/**
 * Solo continent scope — "je veux réviser l'Afrique".
 *
 * A single continent choice, persisted locally, applied to every solo mode
 * whose answer is a country. It is deliberately confined to free solo play:
 * the daily challenge, leagues, ranked, story mode, online matches and the
 * local parcours must stay worldwide and deterministic, so `Router` only ever
 * passes a scope when there is no `matchData` (see `effectiveScope`).
 *
 * Not every mode can honour every continent — the pools are simply too small in
 * places. The limits below are measured against the real assets, not guessed:
 *
 *   Africa 54 · Asia 47 · Europe 45 · Americas 35 · Oceania 14 countries
 *   silhouette-eligible shapes: 40 / 31 / 27 / 21 / **3** (AUS, NZL, PNG)
 *   classic needs 8 countries sharing 8 themes: Oceania fails ~75% of draws
 *
 * So Oceania is out for `silhouette` and `classic`. Rather than hide those
 * tiles, `effectiveScope` degrades them to worldwide and the menu marks them
 * with a "Monde" badge — the mode stays playable either way.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { CONTINENTS, continentCount, filterCca3sByContinent, type ContinentId } from '../data/continents';
import { silhouetteCountries } from './silhouette';
import type { GameMode } from '../types';

/** Solo modes whose answer is a country, and which therefore accept a scope. */
export const SCOPED_MODES: ReadonlySet<GameMode> = new Set<GameMode>([
  'globe',
  'guess',
  'silhouette',
  'quiz-capital',
  'quiz-flag',
  'higherlower',
  'classic',
  'streak',
]);

/**
 * Smallest pool a mode can be played on. Sized from what a run actually needs:
 * 5 answers + 3 distractors for the quiz-like modes, 8 countries sharing 8
 * themes for `classic` (20 leaves the theme intersection room to breathe), and
 * a chain long enough to be worth playing for `higherlower` / `streak`.
 */
export const MIN_POOL: Record<string, number> = {
  globe: 8,
  guess: 8,
  silhouette: 8,
  'quiz-capital': 8,
  'quiz-flag': 8,
  higherlower: 10,
  classic: 20,
  streak: 10,
};

/** Lazily computed: the shape-eligible pool is derived from world_polygons. */
let silhouettePool: string[] | null = null;

/** How many countries a mode can actually draw from inside a continent. */
export function poolSizeFor(mode: GameMode, continent: ContinentId): number {
  if (mode === 'silhouette') {
    silhouettePool ??= silhouetteCountries();
    return filterCca3sByContinent(silhouettePool, continent).length;
  }
  return continentCount(continent);
}

/** Can this mode be played restricted to this continent? A null scope always can. */
export function scopeSupported(mode: GameMode, continent: ContinentId | null): boolean {
  if (continent === null) return true;
  if (!SCOPED_MODES.has(mode)) return false;
  return poolSizeFor(mode, continent) >= (MIN_POOL[mode] ?? 8);
}

/**
 * The scope a mode will really play with: the chosen continent when it fits,
 * `null` (worldwide) otherwise. Call this at the Router boundary so a screen
 * never has to second-guess whether its pool is big enough.
 */
export function effectiveScope(mode: GameMode, continent: ContinentId | null): ContinentId | null {
  return scopeSupported(mode, continent) ? continent : null;
}

/** Modes that would silently fall back to worldwide under this scope. */
export function unsupportedModes(continent: ContinentId | null): GameMode[] {
  if (continent === null) return [];
  return [...SCOPED_MODES].filter((mode) => !scopeSupported(mode, continent));
}

// ── Persistence ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'solo:scope:v1';

const isContinentId = (v: unknown): v is ContinentId =>
  CONTINENTS.some((c) => c.id === v);

/**
 * Tiny module-level store so the menu chip and the Router read the same value
 * without threading it through a context. Seeded from AsyncStorage once.
 */
let current: ContinentId | null = null;
let hydrated = false;
const listeners = new Set<(v: ContinentId | null) => void>();

async function hydrate(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (isContinentId(raw)) {
      current = raw;
      listeners.forEach((fn) => fn(current));
    }
  } catch {
    // Unreadable storage just means "worldwide", which is the safe default.
  }
}

/** Current scope without subscribing (for non-React call sites). */
export function getSoloScope(): ContinentId | null {
  return current;
}

/** Sets the scope and persists it. */
export function setSoloScope(continent: ContinentId | null): void {
  current = continent;
  listeners.forEach((fn) => fn(continent));
  AsyncStorage.setItem(STORAGE_KEY, continent ?? '').catch(() => {
    // ignore write errors — the choice still holds for this session
  });
}

/** Test helper: forget the cached value so the next hook call re-reads storage. */
export function resetSoloScopeCache(): void {
  current = null;
  hydrated = false;
  training = false;
  trainingHydrated = false;
}

// ── Entraînement ──────────────────────────────────────────────────────────────

const TRAINING_KEY = 'solo:training:v1';

/**
 * Training mode: the same games without the stakes. No mistake ends a run, the
 * answer is always explained, and nothing is recorded — no coins, no
 * leaderboard — so it can't be farmed and there's no reason not to experiment.
 *
 * Stored next to the scope because they're set from the same sheet and answer
 * the same question: "how do I want to play solo right now?"
 */
let training = false;
let trainingHydrated = false;
const trainingListeners = new Set<(v: boolean) => void>();

async function hydrateTraining(): Promise<void> {
  if (trainingHydrated) return;
  trainingHydrated = true;
  try {
    if ((await AsyncStorage.getItem(TRAINING_KEY)) === 'true') {
      training = true;
      trainingListeners.forEach((fn) => fn(true));
    }
  } catch {
    // Unreadable storage → normal play, the safe default.
  }
}

/** Current training flag without subscribing. */
export function getTrainingMode(): boolean {
  return training;
}

export function setTrainingMode(next: boolean): void {
  training = next;
  trainingListeners.forEach((fn) => fn(next));
  AsyncStorage.setItem(TRAINING_KEY, next ? 'true' : 'false').catch(() => {
    // ignore write errors — the choice still holds for this session
  });
}

/** Subscribes a component to the training flag. */
export function useTrainingMode(): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(training);
  useEffect(() => {
    trainingListeners.add(setValue);
    void hydrateTraining();
    return () => {
      trainingListeners.delete(setValue);
    };
  }, []);
  return [value, useCallback((v: boolean) => setTrainingMode(v), [])];
}

/** Subscribes a component to the solo scope. */
export function useSoloScope(): [ContinentId | null, (c: ContinentId | null) => void] {
  const [scope, setScope] = useState<ContinentId | null>(current);

  useEffect(() => {
    listeners.add(setScope);
    void hydrate();
    return () => {
      listeners.delete(setScope);
    };
  }, []);

  const set = useCallback((c: ContinentId | null) => setSoloScope(c), []);
  return [scope, set];
}
