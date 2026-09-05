/**
 * Les langues du site au-delà du français et de l'anglais.
 *
 * Le français et l'anglais ont des pages écrites à la main, une par une, dans
 * `site/content/fr` et `site/content/en` — quatre-vingt-seize pages d'éditorial.
 * Les quatorze autres langues suivent un autre modèle : un fichier de données
 * par langue (`site/content/i18n/<langue>.json`) qui porte les URL, les noms des
 * modes et la centaine de phrases propres au site ; tout le reste — la
 * description de chaque mode, ses conseils — est repris des **catalogues de
 * l'app**, déjà traduits, plutôt que réécrit ici.
 *
 * Ce n'est pas un raccourci de paresse : c'est la seule façon d'avoir une page
 * par mode et par langue qui reste juste quand une règle du jeu change. La
 * phrase change dans l'app, le site suit.
 *
 * Ajouter une langue = déposer un JSON dans `site/content/i18n/` et l'ajouter à
 * `SITE_LOCALES` ci-dessous. Rien d'autre.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT } from './paths.mjs';

/** Les langues générées, dans l'ordre du sélecteur. */
export const SITE_LOCALES = [
  'es', 'pt', 'de', 'it', 'ru',
  'tr', 'pl', 'nl', 'id', 'vi', 'th', 'uk', 'ro', 'el',
];

/** Le `hreflang`, l'`og:locale` et l'attribut `lang` de chacune. */
export const SITE_LOCALE_META = {
  es: { hreflang: 'es', ogLocale: 'es_ES', htmlLang: 'es' },
  pt: { hreflang: 'pt', ogLocale: 'pt_BR', htmlLang: 'pt-BR' },
  de: { hreflang: 'de', ogLocale: 'de_DE', htmlLang: 'de' },
  it: { hreflang: 'it', ogLocale: 'it_IT', htmlLang: 'it' },
  ru: { hreflang: 'ru', ogLocale: 'ru_RU', htmlLang: 'ru' },
  tr: { hreflang: 'tr', ogLocale: 'tr_TR', htmlLang: 'tr' },
  pl: { hreflang: 'pl', ogLocale: 'pl_PL', htmlLang: 'pl' },
  nl: { hreflang: 'nl', ogLocale: 'nl_NL', htmlLang: 'nl' },
  id: { hreflang: 'id', ogLocale: 'id_ID', htmlLang: 'id' },
  vi: { hreflang: 'vi', ogLocale: 'vi_VN', htmlLang: 'vi' },
  th: { hreflang: 'th', ogLocale: 'th_TH', htmlLang: 'th' },
  uk: { hreflang: 'uk', ogLocale: 'uk_UA', htmlLang: 'uk' },
  ro: { hreflang: 'ro', ogLocale: 'ro_RO', htmlLang: 'ro' },
  el: { hreflang: 'el', ogLocale: 'el_GR', htmlLang: 'el' },
};

const DATA = {};
for (const locale of SITE_LOCALES) {
  DATA[locale] = JSON.parse(readFileSync(join(CONTENT, 'i18n', `${locale}.json`), 'utf8'));
}

/** Les données d'une langue générée, ou `null` pour le français et l'anglais. */
export function localeData(locale) {
  return DATA[locale] ?? null;
}

/** Vrai si la langue est générée (par opposition à écrite à la main). */
export function isGenerated(locale) {
  return locale in DATA;
}
