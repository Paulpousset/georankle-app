/**
 * Product analytics — a thin, typed wrapper around PostHog.
 *
 * Screens never import PostHog directly: they call `track('event', { ... })`
 * with an event name from the catalog below. This keeps the whole event
 * surface in one place (easy to rename, document, or swap the provider) and
 * makes the call sites self-documenting.
 *
 * If `EXPO_PUBLIC_POSTHOG_KEY` is unset (e.g. local dev without a key), every
 * helper is a no-op so nothing crashes and no events are sent.
 */
import PostHog from 'posthog-react-native';

const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

/**
 * The shared PostHog client, or `null` when analytics is disabled (no key).
 * Exported so it can be handed to <PostHogProvider client={posthog}> in App.
 */
export const posthog: PostHog | null = apiKey
  ? new PostHog(apiKey, {
      host,
      // Sessions / DAU / retention come for free from lifecycle events.
      captureAppLifecycleEvents: true,
    })
  : null;

/** Every product event we emit. Add new names here to keep call sites honest. */
export type AnalyticsEvent =
  // Auth
  | 'signed_up'
  | 'logged_in'
  | 'logged_out'
  // Games (solo + local)
  | 'game_started'
  | 'game_completed'
  | 'local_parcours_started'
  // Daily challenge
  | 'daily_opened'
  | 'daily_completed'
  | 'daily_shared'
  | 'daily_reminder_set'
  // Multiplayer
  | 'matchmaking_started'
  | 'match_invite_sent'
  | 'match_invite_accepted'
  | 'match_invite_declined'
  | 'match_started'
  | 'round_completed'
  | 'match_completed'
  // Economy
  | 'shop_opened'
  | 'cosmetic_purchased'
  | 'avatar_equipped'
  // Social
  | 'friend_request_sent'
  | 'friend_request_accepted'
  | 'friend_removed'
  | 'user_searched'
  | 'player_profile_viewed'
  // Discovery
  | 'leaderboard_opened'
  // Settings
  | 'theme_toggled'
  | 'language_toggled'
  // Admin
  | 'admin_broadcast_sent'
  | 'admin_campaign_saved';

type Props = Record<string, string | number | boolean | null | undefined>;

/**
 * Drop `undefined` values — callers commonly pass `x ?? undefined` or omit a
 * field, but PostHog's property type rejects `undefined`.
 */
function clean(props?: Props): Record<string, string | number | boolean | null> | undefined {
  if (!props) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Record a product event. No-op when analytics is disabled. */
export function track(event: AnalyticsEvent, props?: Props): void {
  posthog?.capture(event, clean(props));
}

/** Record a screen view. No-op when analytics is disabled. */
export function trackScreen(name: string, props?: Props): void {
  posthog?.screen(name, clean(props));
}

/**
 * Tie subsequent (and recent anonymous) events to a known user. Call on login.
 * Keep `traits` free of PII — an internal id is enough to build cohorts.
 */
export function identify(userId: string, traits?: Props): void {
  posthog?.identify(userId, clean(traits));
}

/** Forget the current user (call on logout) so the next user starts clean. */
export function resetIdentity(): void {
  posthog?.reset();
}
