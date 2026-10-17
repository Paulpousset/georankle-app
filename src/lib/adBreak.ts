/**
 * "Pub dans 3, 2, 1…" — a short notice shown right before an interstitial, so
 * the ad never lands on the player by surprise.
 *
 * The notice itself is drawn by <AdBreakNotice/>, mounted once at the root; it
 * registers here through a module-level handler (same pattern as alert.ts), so
 * monetization.ts can await it without a context or a prop. With no host
 * mounted (jest, web) the notice resolves immediately.
 */

/** How long the countdown runs, in whole seconds. */
export const AD_BREAK_COUNTDOWN_S = 3;

type Handler = () => Promise<void>;

let handler: Handler | null = null;

/** Called by <AdBreakNotice/> on mount (and with null on unmount). */
export function setAdBreakHandler(next: Handler | null): void {
  handler = next;
}

/** Show the countdown and resolve once it reaches zero. Never throws. */
export async function announceAdBreak(): Promise<void> {
  if (!handler) return;
  try {
    await handler();
  } catch {
    /* a broken notice must never block the ad flow */
  }
}
