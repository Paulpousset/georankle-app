import { supabase } from './supabase';

// Throttle: at most one last_seen write per this window, per app session.
const MIN_INTERVAL_MS = 10 * 60 * 1000;
let lastTouch = 0;

/**
 * Record that the signed-in user is active right now. Powers the "inactive for
 * N days" notification segment. Safe to call often — writes are throttled and
 * failures are swallowed (activity tracking must never disrupt the app).
 */
export async function touchLastSeen(): Promise<void> {
  const now = Date.now();
  if (now - lastTouch < MIN_INTERVAL_MS) return;
  lastTouch = now;
  try {
    await supabase.rpc('touch_last_seen');
  } catch {
    lastTouch = 0; // let the next attempt retry
  }
}
