/**
 * Frequency gate for interstitial ads.
 *
 * Interstitials grant no coins, so there's no fraud incentive — the whole
 * decision lives client-side. The rule protects retention: at most one
 * interstitial per N finished games, and a hard daily cap. The pure `decide()`
 * function holds the policy (fully unit-tested); the async wrapper just persists
 * the counter in AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Show at most one interstitial per this many finished games. */
export const SHOW_EVERY_N_GAMES = 3;
/** Never show more than this many interstitials in a single UTC day. */
export const DAILY_CAP = 4;

const KEY = 'interstitial_gate_v1';

export interface GateState {
  /** UTC day (YYYY-MM-DD) the counters belong to. */
  day: string;
  /** Interstitials already shown today. */
  shownToday: number;
  /** Finished games since the last interstitial was shown. */
  gamesSinceLast: number;
}

const EMPTY: GateState = { day: '', shownToday: 0, gamesSinceLast: 0 };

/**
 * Pure policy: given the stored state and today's date, record one more finished
 * game and decide whether to show an interstitial now. Rolls the daily counter
 * over at a new day. Returns the decision + the next state to persist.
 */
export function decide(prev: GateState | null, today: string): { show: boolean; next: GateState } {
  const base = prev && prev.day === today ? prev : { ...EMPTY, day: today };
  const gamesSinceLast = base.gamesSinceLast + 1;
  const canShow = gamesSinceLast >= SHOW_EVERY_N_GAMES && base.shownToday < DAILY_CAP;
  if (canShow) {
    return { show: true, next: { day: today, shownToday: base.shownToday + 1, gamesSinceLast: 0 } };
  }
  return { show: false, next: { day: today, shownToday: base.shownToday, gamesSinceLast } };
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
 * Record a finished game and return whether an interstitial should be shown now,
 * persisting the updated counter. UTC day matches the rewarded-ad cap window.
 */
export async function recordGameAndShouldShow(): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const { show, next } = decide(await read(), today);
  await write(next);
  return show;
}

/** Test hook: clear the persisted counter. */
export async function __resetGate(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
