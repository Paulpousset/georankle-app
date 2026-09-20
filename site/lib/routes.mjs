/**
 * La table de correspondance des URL, source unique du routage multilingue.
 *
 * Tout ce qui touche à l'internationalisation en découle : les `hreflang`, le
 * `canonical`, le sélecteur de langue, le sitemap et les liens internes. Aucune
 * URL n'est écrite en dur dans un fragment de contenu — on écrit
 * `{{link:guide-flags}}` et c'est cette table qui résout, dans la langue de la
 * page en cours.
 *
 * Deux règles non négociables, héritées du plan SEO :
 *   1. **le français reste à la racine**, sans préfixe et sans redirection ;
 *      les URL FR existantes ne bougent pas d'un caractère ;
 *   2. **une langue absente n'apparaît pas** dans les alternates — un hreflang
 *      qui pointe vers une 404 annule le bénéfice de tout le bloc.
 *
 * Depuis que l'app parle seize langues, le site les suit — mais pas au même
 * niveau : le français et l'anglais publient les 52 pages écrites à la main
 * (guides, atlas, modes), les quatorze autres publient TROIS pages : l'accueil,
 * la coquille du jeu et la politique de confidentialité, générées depuis
 * `site/content/i18n/` et les catalogues de l'app (voir siteLocales.mjs).
 *
 * Elles en publiaient dix-sept jusqu'au 20/09/2026 : douze pages de mode,
 * à-propos et contact en plus. Ces pages faisaient 50 à 110 mots chacune, avec
 * le script AdSense dans le <head> — 196 pages sur 342, 70 % du sitemap, de
 * contenu automatique et quasi vide. C'est le profil exact du motif « contenu
 * à faible valeur informative » qui a valu le cinquième refus AdSense. Elles
 * sont retirées : les modes mènent droit au jeu (`/xx/play?mode=…`), à-propos
 * et contact sont repliés dans l'accueil de la langue, et les anciennes URL
 * redirigent (vercel.json, vérifié par checkVercelRoutes). Ne pas les recréer
 * sans un contenu propre par langue (voir generated.mjs).
 *
 * Une langue qui n'a pas une page ne la déclare pas : la règle 2 ci-dessus fait
 * le reste, et aucun hreflang ne pointe vers une 404.
 */
import { MODES } from './modes.mjs';
import { CONTINENTS } from './continents.mjs';
import { SITE_LOCALES, SITE_LOCALE_META, localeData } from './siteLocales.mjs';

/** Les langues que le site publie réellement. */
export const LOCALES = ['fr', 'en', ...SITE_LOCALES];

/** Le français est servi à la racine : c'est la langue sans préfixe. */
export const DEFAULT_LOCALE = 'fr';

/** `x-default` pointe vers l'anglais : c'est la version la plus universelle. */
export const X_DEFAULT_LOCALE = 'en';

/** Le code `hreflang` et l'`og:locale` de chaque langue. */
export const LOCALE_META = {
  fr: { hreflang: 'fr', ogLocale: 'fr_FR', label: 'Français', htmlLang: 'fr' },
  en: { hreflang: 'en', ogLocale: 'en_US', label: 'English', htmlLang: 'en' },
  ...Object.fromEntries(
    SITE_LOCALES.map((locale) => [
      locale,
      { ...SITE_LOCALE_META[locale], label: localeData(locale).label },
    ]),
  ),
};

/** `/es/`, `/es/play`, `/es/juego-de-banderas/`… — le préfixe de langue est l'espace de nommage. */
function localized(locale, slug) {
  return slug ? `/${locale}/${slug}/` : `/${locale}/`;
}

/** Les chemins d'une route dans les quatorze langues générées. */
function generatedPaths(build) {
  return Object.fromEntries(SITE_LOCALES.map((locale) => [locale, build(locale, localeData(locale))]));
}

/**
 * `kind` sert au gabarit et au sitemap :
 *   - `landing` : la page d'accueil, gabarit sur mesure
 *   - `app`     : la coquille du jeu (`/play`), pas de gabarit de contenu
 *   - `page`    : page institutionnelle (à propos, contact, confidentialité)
 *   - `hub`     : sommaire (le sommaire des guides)
 *   - `guide`   : article éditorial → JSON-LD `Article` + fil d'Ariane
 *   - `mode`    : page de mode de jeu (phase 2)
 *   - `atlas`   : page continent avec tableau de données (phase 3)
 */
const CORE = [
  {
    id: 'home',
    kind: 'landing',
    priority: 1.0,
    changefreq: 'weekly',
    paths: { fr: '/', en: '/en/', ...generatedPaths((locale) => localized(locale, '')) },
  },
  {
    id: 'play',
    kind: 'app',
    priority: 0.6,
    changefreq: 'daily',
    paths: { fr: '/play', en: '/en/play', ...generatedPaths((locale) => `/${locale}/play`) },
  },
  { id: 'guides', kind: 'hub', priority: 0.9, changefreq: 'weekly', paths: { fr: '/guides/', en: '/en/guides/' } },
  {
    id: 'about',
    kind: 'page',
    priority: 0.5,
    changefreq: 'monthly',
    paths: { fr: '/a-propos/', en: '/en/about/' },
  },
  {
    id: 'contact',
    kind: 'page',
    priority: 0.4,
    changefreq: 'yearly',
    paths: { fr: '/contact/', en: '/en/contact/' },
  },
  // `/privacy.html` est référencé par les fiches des stores et par l'app :
  // l'URL ne peut pas changer, on lui donne juste une version anglaise propre.
  {
    id: 'privacy',
    kind: 'page',
    priority: 0.2,
    changefreq: 'yearly',
    paths: {
      fr: '/privacy.html',
      en: '/en/privacy/',
      ...generatedPaths((locale, data) => localized(locale, data.slugs.privacy)),
    },
  },
];

/** Les six guides piliers, écrits avant ce générateur. */
const GUIDES = [
  {
    id: 'guide-countries-count',
    paths: {
      fr: '/guides/combien-de-pays-dans-le-monde/',
      en: '/en/guides/how-many-countries-in-the-world/',
    },
  },
  { id: 'guide-flags', paths: { fr: '/guides/drapeaux-du-monde/', en: '/en/guides/world-flags/' } },
  { id: 'guide-capitals', paths: { fr: '/guides/capitales-du-monde/', en: '/en/guides/world-capitals/' } },
  { id: 'guide-borders', paths: { fr: '/guides/frontieres-terrestres/', en: '/en/guides/land-borders/' } },
  { id: 'guide-memorize-flags', paths: { fr: '/guides/memoriser-les-drapeaux/', en: '/en/guides/memorize-flags/' } },
  { id: 'guide-revise', paths: { fr: '/guides/reviser-la-geographie/', en: '/en/guides/study-geography/' } },
];

/** Les guides thématiques ajoutés en phase 3.2 — français seulement pour l'instant. */
const THEMATIC = [
  {
    id: 'guide-hard-to-place',
    paths: { fr: '/guides/pays-difficiles-a-placer/', en: '/en/guides/hardest-countries-to-locate/' },
  },
  { id: 'guide-microstates', paths: { fr: '/guides/micro-etats/', en: '/en/guides/microstates/' } },
  { id: 'guide-landlocked', paths: { fr: '/guides/pays-enclaves/', en: '/en/guides/landlocked-countries/' } },
  {
    id: 'guide-renamed',
    paths: { fr: '/guides/pays-qui-ont-change-de-nom/', en: '/en/guides/countries-that-changed-name/' },
  },
  { id: 'guide-disputed', paths: { fr: '/guides/territoires-contestes/', en: '/en/guides/disputed-territories/' } },
  {
    id: 'guide-lookalike-flags',
    paths: { fr: '/guides/drapeaux-qui-se-ressemblent/', en: '/en/guides/similar-flags/' },
  },
];

/**
 * Les 12 pages de mode (phase 2), dérivées de la table des modes — en français
 * et en anglais seulement, écrites à la main (900 à 1 100 mots chacune).
 */
const MODE_ROUTES = MODES.map((mode) => ({
  id: mode.id,
  kind: 'mode',
  priority: 0.8,
  changefreq: 'monthly',
  paths: { fr: mode.fr.slug, en: mode.en.slug },
  mode: mode.id,
}));

/**
 * Les 18 pages continent (phase 3) : {drapeaux, capitales, pays} × 6 continents.
 * `atlasFamily` dit quel tableau générer, `continent` sur quel sous-ensemble.
 */
/** « North America » → « north-america », pour les URL anglaises. */
const enSlug = (continent) => continent.en.toLowerCase().replace(/\s+/g, '-');

const ATLAS_FAMILIES = [
  { family: 'flags', fr: (c) => `/guides/drapeaux-${c.id}/`, en: (c) => `/en/guides/flags-of-${enSlug(c)}/` },
  { family: 'capitals', fr: (c) => `/guides/capitales-${c.id}/`, en: (c) => `/en/guides/capitals-of-${enSlug(c)}/` },
  // `pays-d-europe`, `pays-d-amerique-du-nord`… : l'id du continent est déjà
  // un slug sans accent, contrairement à son nom français.
  { family: 'countries', fr: (c) => `/guides/pays-d-${c.id}/`, en: (c) => `/en/guides/countries-of-${enSlug(c)}/` },
];

const ATLAS_ROUTES = ATLAS_FAMILIES.flatMap((family) =>
  CONTINENTS.map((continent) => ({
    id: `atlas-${family.family}-${continent.id}`,
    kind: 'atlas',
    priority: 0.7,
    changefreq: 'monthly',
    paths: { fr: family.fr(continent), en: family.en(continent) },
    atlasFamily: family.family,
    continent: continent.id,
  })),
);

/**
 * La grappe « Rankle » (16/09/2026) : quatre pages satellites autour de la
 * page de mode `/rankle/`, chacune avec une substance qui n'existe nulle part
 * ailleurs sur le site — le nom historique du jeu (« GeoRankle »), les règles
 * et le barème, la stratégie (grille réelle résolue depuis les données), la
 * variante Streak (qui n'avait pas de page). Toutes mènent au jeu en un clic ;
 * `parent` les range sous `/rankle/` dans le fil d'Ariane.
 *
 * Volontairement PAS plus : trois pages de plus (Rankle du jour, en ligne,
 * application) ont été écrites puis retirées le jour même, parce qu'elles
 * recopiaient les pages défi du jour / duels / classé / accueil — le profil
 * « contenu à faible valeur » qui a déjà valu quatre refus AdSense. Ce que
 * ces pages disaient tient en une section de `/rankle/`. Les alias courts
 * (`/georanke`, `/rankle-game`, `/jeu-rankle`…) ne sont pas des pages non
 * plus : ce sont des redirections vers le jeu, dans vercel.json — une page
 * par intention, jamais une page par orthographe.
 */
const RANKLE = [
  { id: 'rankle-georankle', paths: { fr: '/georankle/', en: '/en/georankle/' } },
  { id: 'rankle-rules', paths: { fr: '/rankle/regles/', en: '/en/rankle/rules/' } },
  { id: 'rankle-tips', paths: { fr: '/rankle/astuces/', en: '/en/rankle/tips/' } },
  { id: 'rankle-streak', paths: { fr: '/rankle/streak/', en: '/en/rankle/streak/' } },
].map((r) => ({ kind: 'guide', priority: 0.7, changefreq: 'monthly', parent: 'mode-rankle', ...r }));

/** Les ids de la grappe, dans l'ordre d'affichage du bloc « Tout sur Rankle ». */
export const RANKLE_IDS = RANKLE.map((r) => r.id);

/** Toutes les routes du site, normalisées. */
export const ROUTES = [
  ...CORE,
  ...GUIDES.map((g) => ({ kind: 'guide', priority: 0.8, changefreq: 'monthly', ...g })),
  ...MODE_ROUTES,
  ...ATLAS_ROUTES,
  ...THEMATIC.map((g) => ({ kind: 'guide', priority: 0.7, changefreq: 'monthly', ...g })),
  ...RANKLE,
];

const BY_ID = new Map(ROUTES.map((r) => [r.id, r]));

/** Une route par son id. Lève si l'id n'existe pas — pas de lien mort silencieux. */
export function route(id) {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`route inconnue : « ${id} » (lien interne cassé ?)`);
  return found;
}

/**
 * L'URL d'une route dans une langue donnée, avec repli sur le français quand la
 * page n'est pas traduite. Le repli est volontaire : mieux vaut, depuis une page
 * anglaise, un lien vers le guide français existant qu'un lien mort — mais ce
 * repli ne génère jamais de `hreflang` (voir `alternates`).
 */
export function href(id, locale) {
  const r = route(id);
  return r.paths[locale] || r.paths[DEFAULT_LOCALE];
}

/** Vrai si la route existe réellement dans cette langue. */
export function exists(id, locale) {
  return Boolean(route(id).paths[locale]);
}

/**
 * Les alternates d'une page, prêts à devenir des `<link rel="alternate">`.
 * Inclut l'auto-référence (règle du plan §1.2) et `x-default` sur l'anglais,
 * avec repli sur le français si l'anglais n'existe pas pour cette page.
 */
export function alternates(id) {
  const r = route(id);
  const out = LOCALES.filter((l) => r.paths[l]).map((l) => ({
    hreflang: LOCALE_META[l].hreflang,
    path: r.paths[l],
  }));
  const xDefault = r.paths[X_DEFAULT_LOCALE] || r.paths[DEFAULT_LOCALE];
  out.push({ hreflang: 'x-default', path: xDefault });
  return out;
}

/** Les routes publiées dans une langue, dans l'ordre de déclaration. */
export function routesIn(locale) {
  return ROUTES.filter((r) => r.paths[locale]);
}
