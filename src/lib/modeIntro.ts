/**
 * Per-mode "how to play" intro flags.
 *
 * The first time a player enters a given game mode we show a one-card popup
 * explaining the rules (see ModeIntroGate / MODE_INTROS). Each mode gets its own
 * boolean in AsyncStorage so the explanation appears exactly once per mode, then
 * never again — the same idea as the first-launch onboarding tour, scoped per
 * mode instead of per app. Stored locally (not server-side): the rules are the
 * same logged in or out, and the popup must work before any account exists.
 *
 * Keyed per mode rather than per context on purpose: learning "Globe Géo" solo
 * means it won't re-explain itself when you later meet it online or in a daily
 * challenge — it's the same gameplay.
 *
 * Bump MODE_INTRO_VERSION to re-show every mode's intro after a major rules
 * change.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { GameMode } from '../types';

const MODE_INTRO_VERSION = 1;
const storageKey = (mode: GameMode) => `modeIntro:seen:v${MODE_INTRO_VERSION}:${mode}`;

/** Has the player already seen the intro popup for this mode? */
export async function hasSeenModeIntro(mode: GameMode): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(storageKey(mode))) === 'true';
  } catch {
    // If storage is unreadable, treat as "seen" so we never trap the player
    // behind a popup that can't be dismissed.
    return true;
  }
}

/** Mark a mode's intro as seen so it won't appear again. */
export async function setModeIntroSeen(mode: GameMode): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(mode), 'true');
  } catch {
    // ignore write errors — worst case the popup shows once more next time
  }
}

/** Test/dev helper: clear one or all mode-intro flags so they show again. */
export async function resetModeIntros(modes: GameMode[]): Promise<void> {
  try {
    await AsyncStorage.multiRemove(modes.map(storageKey));
  } catch {
    // ignore
  }
}
