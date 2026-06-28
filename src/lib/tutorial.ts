/**
 * First-launch onboarding flag.
 *
 * A single boolean persisted in AsyncStorage so the welcome tour shows exactly
 * once. Stored locally (not server-side) on purpose: the tour explains the UI,
 * which is the same whether or not you're logged in, and it must work on the
 * very first open before any account exists.
 *
 * Bump TUTORIAL_VERSION to re-show the tour to everyone after a major UI change.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const TUTORIAL_VERSION = 1;
const STORAGE_KEY = `tutorial:seen:v${TUTORIAL_VERSION}`;

/** Has the user already seen (completed or skipped) the onboarding tour? */
export async function getHasSeenTutorial(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) === 'true';
  } catch {
    // If storage is unreadable, treat as "seen" so we never trap the user in a
    // tour that can't be dismissed.
    return true;
  }
}

/** Mark the onboarding tour as seen so it won't appear again. */
export async function setHasSeenTutorial(seen: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, seen ? 'true' : 'false');
  } catch {
    // ignore write errors — worst case the tour shows once more next launch
  }
}

/** Test/dev helper: clear the flag so the tour shows again on next launch. */
export async function resetTutorial(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
