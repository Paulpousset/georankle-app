/**
 * In-app store rating prompt (SKStoreReviewController / Play In-App Review).
 *
 * Nearly all of our installs come from App Store search in France, and the
 * ranking there is fed by rating volume — yet the app never asked anyone. The
 * ask is placed at the one moment a player is demonstrably happy: they just
 * finished today's challenge with a streak of MIN_STREAK+ days. The pure
 * `decide()` holds the policy (unit-tested); the wrapper persists the history
 * and talks to the OS, which itself rate-limits how often the sheet appears.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

import { track } from './analytics';

/** Only ask players who came back at least this many days in a row. */
export const MIN_STREAK = 3;
/** Never ask the same device more often than this. */
export const MIN_DAYS_BETWEEN = 90;
/** Stop asking for good after this many prompts. */
export const MAX_ASKS = 3;

const KEY = 'review_prompt_v1';
const DAY_MS = 86_400_000;

export interface ReviewState {
  /** ISO timestamps of every prompt we triggered on this device. */
  askedAt: string[];
}

/** Pure policy: should we ask now, and what to persist if we do. */
export function decide(
  prev: ReviewState | null,
  streak: number,
  now: Date,
): { ask: boolean; next: ReviewState } {
  const state: ReviewState = prev && Array.isArray(prev.askedAt) ? prev : { askedAt: [] };
  if (streak < MIN_STREAK) return { ask: false, next: state };
  if (state.askedAt.length >= MAX_ASKS) return { ask: false, next: state };
  const last = state.askedAt[state.askedAt.length - 1];
  if (last && now.getTime() - new Date(last).getTime() < MIN_DAYS_BETWEEN * DAY_MS) {
    return { ask: false, next: state };
  }
  return { ask: true, next: { askedAt: [...state.askedAt, now.toISOString()] } };
}

async function read(): Promise<ReviewState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ReviewState) : null;
  } catch {
    return null;
  }
}

async function write(state: ReviewState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* best-effort */
  }
}

/**
 * Ask for a store rating if the policy allows. Native only — the web has no
 * store sheet. Resolves to whether the OS was asked (it may still decide not
 * to show anything: Apple caps at 3 sheets per 365 days per app).
 */
export async function maybeAskForReview(streak: number, now: Date = new Date()): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { ask, next } = decide(await read(), streak, now);
  if (!ask) return false;
  try {
    if (!(await StoreReview.hasAction())) return false;
    await write(next);
    track('review_prompted', { streak });
    await StoreReview.requestReview();
    return true;
  } catch {
    return false;
  }
}
