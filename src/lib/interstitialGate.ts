/**
 * Frequency gate for interstitial ads.
 *
 * Interstitials grant no coins, so there's no fraud incentive — the whole
 * decision lives client-side. The rule is time-based: at most one interstitial
 * every MIN_INTERVAL_MS of play, only ever at a natural break (leaving a game),
 * plus a hard daily cap. The clock starts at app launch, so opening the app never
 * greets the player with an ad. The pure `decide()` function holds the policy
 * (fully unit-tested); the async wrapper just persists the state in AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Minimum time between two interstitials (and from app launch to the first). */
export const MIN_INTERVAL_MS = 6 * 60 * 1000;
/** Never show more than this many interstitials in a single UTC day. */
export const DAILY_CAP = 10;

const KEY = 'interstitial_gate_v2';

/** When this JS session started — the earliest anchor for the interval. */
const SESSION_START = Date.now();

export interface GateState {
  /** UTC day (YYYY-MM-DD) the daily counter belongs to. */
  day: string;
  /** Interstitials already shown today. */
  shownToday: number;
  /** Epoch ms of the last interstitial shown (0 = never). */
  lastShownAt: number;
}

const EMPTY: GateState = { day: '', shownToday: 0, lastShownAt: 0 };

/**
 * Pure policy: at a natural break, decide whether to show an interstitial now.
 * Shows once MIN_INTERVAL_MS has passed since both the last interstitial and the
 * session start, under the daily cap. Rolls the daily counter over at a new day.
 * Returns the decision + the next state to persist.
 */
export function decide(
  prev: GateState | null,
  now: number,
  sessionStart: number,
): { show: boolean; next: GateState } {
  const today = new Date(now).toISOString().slice(0, 10);
  const base =
    prev && prev.day === today
      ? prev
      : { ...EMPTY, day: today, lastShownAt: prev?.lastShownAt ?? 0 };
  const anchor = Math.max(base.lastShownAt, sessionStart);
  const canShow = now - anchor >= MIN_INTERVAL_MS && base.shownToday < DAILY_CAP;
  if (canShow) {
    return { show: true, next: { day: today, shownToday: base.shownToday + 1, lastShownAt: now } };
  }
  return { show: false, next: base };
}

async function read(): Promise<GateState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GateState) : null;
  } catch {
    return null;
  }
}

async function write(state: GateState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* best-effort */
  }
}

/**
 * At a natural break (a game was just left), return whether an interstitial
 * should be shown now, persisting the updated state. UTC day matches the
 * rewarded-ad cap window.
 */
export async function shouldShowAtBreak(): Promise<boolean> {
  const { show, next } = decide(await read(), Date.now(), SESSION_START);
  if (show) await write(next);
  return show;
}

/** Test hook: clear the persisted state. */
export async function __resetGate(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
