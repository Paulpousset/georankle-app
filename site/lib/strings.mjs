/**
 * Les textes de l'habillage (nav, fil d'Ariane, pied de page, encarts).
 *
 * Le contenu éditorial, lui, vit dans `site/content/<langue>/` : ici on ne met
 * que ce qui est répété sur chaque page et qu'on ne veut donc écrire qu'une fois.
 */
export const STRINGS = {
  fr: {
    home: 'Accueil',
    guides: 'Guides',
    about: 'À propos',
    contact: 'Contact',
    privacy: 'Confidentialité',
    play: 'Jouer',
    modes: 'Modes',
    online: 'En ligne',
    faq: 'FAQ',
    playNow: 'Jouer maintenant',
    skipToContent: 'Aller au contenu',
    languageLabel: 'Langue',
    otherLanguage: 'English',
    otherLanguageFull: 'Read this page in English',
    footerTagline: 'GeoG — jeu de géographie gratuit : quiz, drapeaux, capitales et pays du monde.',
    footerCoords: '47°N 2°E · Fait avec ✦ pour les explorateurs.',
    readNext: 'À lire ensuite',
    relatedModes: 'Autres modes de jeu',
    sourceNote: 'Données du jeu',
    country: 'Pays',
    capital: 'Capitale',
    flag: 'Drapeau',
    neighbours: 'Voisins',
    population: 'Population',
    area: 'Superficie (km²)',
    continent: 'Continent',
  },
  en: {
    home: 'Home',
    guides: 'Guides',
    about: 'About',
    contact: 'Contact',
    privacy: 'Privacy',
    play: 'Play',
    modes: 'Modes',
    online: 'Online',
    faq: 'FAQ',
    playNow: 'Play now',
    skipToContent: 'Skip to content',
    languageLabel: 'Language',
    otherLanguage: 'Français',
    otherLanguageFull: 'Lire cette page en français',
    footerTagline: 'GeoG — the free geography game: flag, capital and country quizzes.',
    footerCoords: '47°N 2°E · Made with ✦ for explorers.',
    readNext: 'Read next',
    relatedModes: 'Other game modes',
    sourceNote: 'Game data',
    country: 'Country',
    capital: 'Capital',
    flag: 'Flag',
    neighbours: 'Neighbours',
    population: 'Population',
    area: 'Area (km²)',
    continent: 'Continent',
  },
};

/** Les textes d'une langue, ou lève si la langue n'est pas publiée. */
export function strings(locale) {
  const s = STRINGS[locale];
  if (!s) throw new Error(`langue sans textes d'habillage : ${locale}`);
  return s;
}
