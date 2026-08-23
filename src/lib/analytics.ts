/**
 * Product analytics — a thin, typed wrapper around PostHog (native).
 *
 * Screens never import PostHog directly: they call `track('event', { ... })`
 * with an event name from the shared catalog (`analyticsEvents.ts`). This keeps
 * the whole event surface in one place (easy to rename, document, or swap the
 * provider) and makes the call sites self-documenting.
 *
 * ⚠️ Ce fichier est l'implémentation **native**. Le web charge `analytics.web.ts`
 * (posthog-js) : posthog-react-native n'émet aucun `$pageview` / `$current_url`
 * / `$referrer`, donc sur le web il ne remplit ni Web Analytics ni l'attribution.
 * Les deux modules exportent exactement la même API.
 *
 * If `EXPO_PUBLIC_POSTHOG_KEY` is unset (e.g. local dev without a key), every
 * helper is a no-op so nothing crashes and no events are sent.
 */
import { Platform } from 'react-native';
import PostHog from 'posthog-react-native';
import { clean, type AnalyticsEvent, type Props } from './analyticsEvents';

export type { AnalyticsEvent } from './analyticsEvents';

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
      // Le défaut (20 events avant envoi) gardait en mémoire toute une session
      // courte : un joueur qui ouvre l'app, fait le défi du jour et repart émet
      // moins de 20 events, et l'app pouvait être tuée avant le flush
      // périodique. On envoie dès 5 events (l'intervalle par défaut, 10 s,
      // reste inchangé — la file est de toute façon persistée sur disque).
      flushAt: 5,
      // Les feature flags sont côté Supabase (src/lib/featureFlags.ts) : pas la
      // peine d'appeler /flags de PostHog au démarrage.
      preloadFeatureFlags: false,
    })
  : null;

// Toujours savoir de quelle surface vient un event : sans ça, web / iOS /
// Android se mélangent dans le même graphe et tout comptage par plateforme est
// faux. `platform` est une super-propriété, attachée à chaque event.
posthog?.register({ platform: Platform.OS, surface: 'app' });

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
