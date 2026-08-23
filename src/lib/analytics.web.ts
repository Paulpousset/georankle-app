/**
 * Product analytics — implémentation **web** (posthog-js).
 *
 * Pourquoi un module séparé : le bundle web est le même code React Native, mais
 * `posthog-react-native` n'émet ni `$pageview`, ni `$current_url`, ni
 * `$referrer`, ni `$browser` — aucune de ces propriétés n'existe dans ce
 * paquet. Résultat : sur playgeog.com, PostHog recevait bien des events mais la
 * section Web Analytics (visiteurs, pages, sources, rebond) restait vide et
 * l'attribution (UTM, referrer) était impossible. posthog-js fait tout ça.
 *
 * Metro choisit ce fichier plutôt qu'`analytics.ts` pour la plateforme web
 * (même mécanisme que `adsSdk.web.ts`) : l'API exportée est identique, donc
 * aucun écran n'a à savoir sur quelle surface il tourne.
 *
 * Deux points de vigilance :
 *  1. `apiHost` passe par `/ph` (réécriture Vercel vers eu.i.posthog.com). Un
 *     appel direct à posthog.com est bloqué par uBlock/Brave/DNS filtrants —
 *     c'est ce qui rendait les chiffres web partiels et incohérents.
 *  2. Les pages de contenu (landing, guides) chargent le MÊME projet avec la
 *     même origine via `public/site-analytics.js`, donc un visiteur gardé son
 *     `distinct_id` de la landing jusqu'à la partie : le funnel SEO → /play est
 *     mesurable de bout en bout.
 */
import posthogJs from 'posthog-js';
import { clean, type AnalyticsEvent, type Props } from './analyticsEvents';

export type { AnalyticsEvent } from './analyticsEvents';

const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;

/**
 * Hôte d'ingestion. Le proxy same-origin `/ph` (voir vercel.json) n'existe que
 * sur le domaine déployé ; en dev local (`expo start --web`, port 8081) il n'y a
 * aucune réécriture, donc on tape PostHog en direct.
 */
const PROXY_PATH = '/ph';
const DIRECT_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

function resolveHost(): string {
  if (typeof window === 'undefined') return DIRECT_HOST;
  const { hostname, origin } = window.location;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
  return isLocal ? DIRECT_HOST : `${origin}${PROXY_PATH}`;
}

/** `true` une fois `init()` passé — tous les helpers sont des no-op sinon. */
let ready = false;

if (apiKey && typeof window !== 'undefined') {
  posthogJs.init(apiKey, {
    api_host: resolveHost(),
    // Les liens "voir dans PostHog" (toolbar, session replay) doivent pointer
    // vers l'app PostHog, pas vers le proxy.
    ui_host: 'https://eu.posthog.com',
    // La navigation est maison (pageStack + gameMode) et l'URL ne change jamais :
    // c'est `trackScreen()` qui émet les $pageview, pas le SDK.
    capture_pageview: false,
    // Donne à Web Analytics la durée de visite et le taux de rebond.
    capture_pageleave: true,
    autocapture: true,
    // Enregistrement de session : coûteux en bande passante sur un jeu qui
    // redessine un globe en continu. À rallumer sciemment si besoin.
    disable_session_recording: true,
    // Les feature flags sont côté Supabase : pas d'appel /flags au démarrage.
    advanced_disable_feature_flags: true,
    persistence: 'localStorage+cookie',
    // Sans profil de personne pour les visiteurs anonymes, les chiffres web ne
    // seraient pas comparables à ceux du natif (où le SDK en crée toujours un).
    person_profiles: 'always',
    loaded: () => {
      ready = true;
    },
  });
  // `loaded` n'est pas appelé si le script est déjà initialisé (hot reload) :
  // l'instance est utilisable dès le retour d'init de toute façon.
  ready = true;
  // Super-propriétés : sans elles, web / iOS / Android se mélangent dans le
  // même graphe et tout comptage par plateforme est faux.
  posthogJs.register({ platform: 'web', surface: 'app' });
}

/**
 * Pas d'équivalent de l'instance native ici : App.tsx ne monte
 * `<PostHogProvider>` (autocapture React Native) que si cet export est non-null,
 * et sur le web c'est `autocapture: true` de posthog-js qui fait le travail.
 */
export const posthog = null;

/** Record a product event. No-op when analytics is disabled. */
export function track(event: AnalyticsEvent, props?: Props): void {
  if (!ready) return;
  posthogJs.capture(event, clean(props));
}

/**
 * Une "page vue" web pour chaque écran du jeu.
 *
 * L'URL réelle ne bouge jamais (/play), donc on fabrique un chemin virtuel :
 * sans ça, le rapport "Pages" de PostHog n'aurait qu'une seule ligne pour tout
 * le jeu. `screen` reste disponible comme propriété brute pour les insights.
 */
export function trackScreen(name: string, props?: Props): void {
  if (!ready) return;
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  posthogJs.capture('$pageview', {
    ...clean(props),
    screen: name,
    $current_url: `${base}/play/${name}`,
  });
}

/**
 * Tie subsequent (and recent anonymous) events to a known user. Call on login.
 * Keep `traits` free of PII — an internal id is enough to build cohorts.
 */
export function identify(userId: string, traits?: Props): void {
  if (!ready) return;
  posthogJs.identify(userId, clean(traits));
}

/** Forget the current user (call on logout) so the next user starts clean. */
export function resetIdentity(): void {
  if (!ready) return;
  posthogJs.reset();
}
