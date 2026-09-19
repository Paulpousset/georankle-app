/**
 * "Drag to spin" hint on the profile globe.
 *
 * The live 3D avatar turns under the finger, but nothing on screen says so.
 * The hint is shown on the first few profile openings (own or other player's),
 * then retired for good: a counter in AsyncStorage, never a per-profile flag,
 * so it doesn't reappear on every new player visited.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'profile_globe_hint_shown';
/** How many profile openings still show the hint. */
export const GLOBE_HINT_MAX_SHOWS = 3;

/**
 * Whether this opening should show the hint — and counts it as shown when so.
 * A storage failure (private mode, quota) shows the hint: harmless either way.
 */
export async function consumeGlobeHint(): Promise<boolean> {
  try {
    const shown = Number((await AsyncStorage.getItem(STORAGE_KEY)) ?? 0) || 0;
    if (shown >= GLOBE_HINT_MAX_SHOWS) return false;
    await AsyncStorage.setItem(STORAGE_KEY, String(shown + 1));
    return true;
  } catch {
    return true;
  }
}

/** Test/debug helper: the hint shows again on the next openings. */
export async function resetGlobeHint(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
