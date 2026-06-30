/**
 * Active-match persistence — remembers the online match the player is currently
 * in, so they can be offered "Resume match" after a disconnect or after backing
 * out to the menu (see match_reconnect.sql for the server-side window + forfeit).
 *
 * Only the match id + a timestamp are stored locally; the authoritative state
 * always comes from the server. A stored pointer older than RESUME_WINDOW_MS is
 * considered stale and ignored.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'georankle.activeMatch';

/** How long after the last activity a match may still be resumed. */
export const RESUME_WINDOW_MS = 2 * 60 * 1000;

export interface ActiveMatchRef {
  matchId: string;
  /** Epoch ms when the match was entered / last touched. */
  at: number;
}

/** Remember (or refresh) the match the player is currently in. */
export async function setActiveMatch(matchId: string, now: number): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ matchId, at: now } satisfies ActiveMatchRef));
  } catch {
    // best-effort
  }
}

/** Clear the pointer (match finished, forfeited, or resume declined). */
export async function clearActiveMatch(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}

/** Read the stored pointer, or null if absent/corrupt. */
export async function getActiveMatch(): Promise<ActiveMatchRef | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveMatchRef;
    if (typeof parsed?.matchId !== 'string' || typeof parsed?.at !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Whether a stored pointer is still within the resume window relative to `now`. */
export function isResumable(ref: ActiveMatchRef | null, now: number): ref is ActiveMatchRef {
  return !!ref && now - ref.at <= RESUME_WINDOW_MS;
}

/** Read the pointer only if it is still resumable; clears it otherwise. */
export async function getResumableMatch(now: number): Promise<ActiveMatchRef | null> {
  const ref = await getActiveMatch();
  if (isResumable(ref, now)) return ref;
  if (ref) await clearActiveMatch();
  return null;
}
