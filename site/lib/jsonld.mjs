/**
 * Les constructeurs de données structurées (phase 4 du plan SEO).
 *
 * Un principe : **rien n'est inventé**. Pas d'`aggregateRating` tant que les
 * notes des stores ne sont pas récupérées automatiquement, pas de `SearchAction`
 * tant qu'il n'y a pas de recherche interne, pas de `datePublished` deviné —
 * les dates viennent du fichier de contenu, qui les déclare explicitement.
 *
 * Chaque page reçoit ses blocs via `jsonLd` dans son front-matter ; le gabarit
 * y ajoute systématiquement le fil d'Ariane quand la page en a un.
 */
import { ORIGIN } from './paths.mjs';
import { APP_LANGUAGES } from './constants.mjs';

const APP_STORE = 'https://apps.apple.com/app/id6779650018';
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.paulpousset.geog';

/** L'éditeur, réutilisé par tous les types. */
export function publisher() {
  return {
    '@type': 'Organization',
    name: 'GeoG',
    url: `${ORIGIN}/`,
    logo: { '@type': 'ImageObject', url: `${ORIGIN}/icon-512.png`, width: 512, height: 512 },
  };
}

/**
 * La fiche du jeu, posée sur la page d'accueil.
 *
 * `VideoGame` (demandé par le plan) et `SoftwareApplication` (déjà en place)
 * ne s'excluent pas : un jeu téléchargeable est légitimement les deux, et le
 * tableau `@type` évite de perdre les propriétés d'application (`offers`,
 * `operatingSystem`) en gagnant celles de jeu (`genre`, `gamePlatform`).
 *
 * `inLanguage` liste les langues que **l'app** parle réellement — deux, pas six.
 */
export function videoGame({ description }) {
  return {
    '@context': 'https://schema.org',
    '@type': ['VideoGame', 'SoftwareApplication'],
    name: 'GeoG',
    url: `${ORIGIN}/`,
    description,
    inLanguage: APP_LANGUAGES,
    genre: ['Educational', 'Quiz', 'Geography'],
    gamePlatform: ['Web browser', 'iOS', 'Android'],
    applicationCategory: 'GameApplication',
    operatingSystem: 'Web, iOS, Android',
    image: `${ORIGIN}/og-invite.png`,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' },
    author: { '@type': 'Person', name: 'Paul Pousset' },
    publisher: publisher(),
    downloadUrl: [APP_STORE, PLAY_STORE],
    isAccessibleForFree: true,
  };
}

/** Une FAQ. `items` : `[{ q, a }]`. */
export function faqPage(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

/** Le fil d'Ariane. `trail` : `[{ name, path }]`, la page courante incluse. */
export function breadcrumbList(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: step.name,
      ...(step.path ? { item: `${ORIGIN}${step.path}` } : {}),
    })),
  };
}

/** Un article éditorial. `published`/`modified` sont des dates ISO réelles. */
export function article({ headline, description, url, locale, published, modified, image }) {
  if (!published || !modified) {
    throw new Error(`Article sans date : ${url} — renseigne « published » et « modified »`);
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    inLanguage: locale,
    datePublished: published,
    dateModified: modified,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    image: image ? `${ORIGIN}${image}` : `${ORIGIN}/og-invite.png`,
    author: publisher(),
    publisher: publisher(),
  };
}

/** Une liste ordonnée — les tableaux des pages continent. */
export function itemList({ name, items }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item,
    })),
  };
}

/** Sérialise un bloc pour l'injection dans le `<head>`. */
export function render(blocks) {
  return blocks
    .filter(Boolean)
    .map((b) => `  <script type="application/ld+json">\n${JSON.stringify(b, null, 2)}\n  </script>`)
    .join('\n');
}
