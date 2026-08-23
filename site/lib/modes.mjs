/**
 * Les douze modes de jeu présentés au public, et l'ancre SEO de chacun.
 *
 * ⚠️ Ce n'est PAS le catalogue technique des modes — celui-là vit dans
 * `src/types/index.ts` (`GameMode` / `MatchMode`) et sert à la logique de jeu.
 * Ici on décrit ce que le joueur reconnaît dans le menu, ce qui ne se recouvre
 * pas exactement : « Drapeaux » et « Capitales » sont deux `GameMode` solo
 * (`quiz-flag`, `quiz-capital`) alors que « Duels en ligne », « Classé » et
 * « Histoire » sont des enveloppes autour de plusieurs modes.
 *
 * `appMode` porte l'identifiant que `src/lib/webEntry.ts` sait interpréter
 * dans `/play?mode=…` ; `null` = le lien mène à l'entrée par défaut.
 *
 * L'ordre est celui de la landing, et `MODE_COUNT` en découle : ajouter un mode
 * ici met à jour « 12 modes » partout sur le site.
 */
export const MODES = [
  {
    id: 'mode-flags',
    appMode: 'quiz-flag',
    fr: { name: 'Drapeaux', slug: '/jeu-drapeaux/' },
    en: { name: 'Flags', slug: '/en/flag-game/' },
  },
  {
    id: 'mode-capitals',
    appMode: 'quiz-capital',
    fr: { name: 'Capitales', slug: '/quiz-capitales/' },
    en: { name: 'Capitals', slug: '/en/capitals-quiz/' },
  },
  {
    id: 'mode-globe',
    appMode: 'globe',
    fr: { name: 'Globe 3D', slug: '/globe-3d/' },
    en: { name: '3D Globe', slug: '/en/3d-globe/' },
  },
  {
    id: 'mode-silhouettes',
    appMode: 'silhouette',
    fr: { name: 'Silhouettes', slug: '/silhouettes-pays/' },
    en: { name: 'Silhouettes', slug: '/en/country-shapes/' },
  },
  {
    id: 'mode-borders',
    appMode: 'borders',
    fr: { name: 'Frontières', slug: '/jeu-frontieres/' },
    en: { name: 'Borders', slug: '/en/borders-game/' },
  },
  {
    id: 'mode-guess',
    appMode: 'guess',
    fr: { name: 'Devine le pays', slug: '/devine-le-pays/' },
    en: { name: 'Guess the Country', slug: '/en/guess-the-country/' },
  },
  {
    id: 'mode-rankle',
    appMode: 'classic',
    fr: { name: 'Rankle', slug: '/rankle/' },
    en: { name: 'Rankle', slug: '/en/rankle/' },
  },
  {
    id: 'mode-higherlower',
    appMode: 'higherlower',
    fr: { name: 'Plus ou moins', slug: '/plus-ou-moins-pays/' },
    en: { name: 'Higher or Lower', slug: '/en/higher-or-lower-countries/' },
  },
  {
    id: 'mode-daily',
    // Le défi du jour est déjà l'entrée par défaut de /play : pas de paramètre.
    appMode: null,
    fr: { name: 'Défi du jour', slug: '/defi-du-jour/' },
    en: { name: 'Daily Challenge', slug: '/en/daily-challenge/' },
  },
  {
    id: 'mode-online',
    appMode: null,
    fr: { name: 'Duels en ligne', slug: '/duels-en-ligne/' },
    en: { name: 'Online Duels', slug: '/en/online-duels/' },
  },
  {
    id: 'mode-ranked',
    appMode: null,
    fr: { name: 'Mode classé', slug: '/mode-classe/' },
    en: { name: 'Ranked Mode', slug: '/en/ranked-mode/' },
  },
  {
    id: 'mode-story',
    appMode: null,
    fr: { name: 'Mode histoire', slug: '/mode-histoire/' },
    en: { name: 'Story Mode', slug: '/en/story-mode/' },
  },
];

/** Un mode par son id de route, ou `undefined`. */
export function modeById(id) {
  return MODES.find((m) => m.id === id);
}
