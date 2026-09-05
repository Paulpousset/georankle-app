/**
 * Génère `assets/country_names.json` : le nom des 195 pays dans les quatorze
 * langues ajoutées (le français et l'anglais sont déjà dans les données du jeu).
 *
 * La source est ICU, via `Intl.DisplayNames` de Node : c'est le CLDR d'Unicode,
 * exactement ce qu'affichent iOS et Android, révisé par les locales elles-mêmes.
 * Écrire deux mille sept cents noms de pays à la main aurait été à la fois plus
 * long et moins juste.
 *
 * ⚠️ À relancer avec un Node compilé avec l'ICU complet (`node --version` ≥ 14
 * l'est par défaut) : un ICU réduit rendrait le code du pays au lieu du nom, ce
 * que le script détecte et refuse.
 *
 *   node scripts/gen_country_names.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO = join(ROOT, '..');

/** Les langues sans nom de pays dans les données d'origine. */
const LOCALES = ['es', 'pt', 'de', 'it', 'ru', 'tr', 'pl', 'nl', 'id', 'vi', 'th', 'uk', 'ro', 'el'];

/**
 * Ce que le CLDR ne donne pas, ou pas sous la forme attendue d'un jeu :
 *   - le Kosovo n'a pas de nom partout, ICU rend alors son code ;
 *   - « Côte d'Ivoire » reste en français dans la moitié des locales, alors que
 *     l'exonyme est bien vivant et attendu dans un quiz.
 */
const FALLBACKS = {
  // Les deux Congo : le CLDR les distingue par leur capitale (« Congo -
  // Kinshasa »), ce qui ne se dit pas et se tape encore moins. On rétablit les
  // noms longs, ceux qu'un joueur reconnaît et écrit.
  COD: {
    es: 'República Democrática del Congo', pt: 'República Democrática do Congo',
    de: 'Demokratische Republik Kongo', it: 'Repubblica Democratica del Congo',
    ru: 'Демократическая Республика Конго', tr: 'Demokratik Kongo Cumhuriyeti',
    pl: 'Demokratyczna Republika Konga', nl: 'Democratische Republiek Congo',
    id: 'Republik Demokratik Kongo', vi: 'Cộng hòa Dân chủ Congo',
    th: 'สาธารณรัฐประชาธิปไตยคองโก', uk: 'Демократична Республіка Конго',
    ro: 'Republica Democrată Congo', el: 'Λαϊκή Δημοκρατία του Κονγκό',
  },
  COG: {
    es: 'República del Congo', pt: 'República do Congo', de: 'Republik Kongo',
    it: 'Repubblica del Congo', ru: 'Республика Конго', tr: 'Kongo Cumhuriyeti',
    pl: 'Republika Konga', nl: 'Republiek Congo', id: 'Republik Kongo',
    vi: 'Cộng hòa Congo', th: 'สาธารณรัฐคองโก', uk: 'Республіка Конго',
    ro: 'Republica Congo', el: 'Δημοκρατία του Κονγκό',
  },
  // Le CLDR grec sépare la Bosnie-Herzégovine par un tiret entouré d'espaces.
  BIH: { el: 'Βοσνία-Ερζεγοβίνη' },
  CIV: {
    es: 'Costa de Marfil', de: 'Elfenbeinküste', tr: 'Fildişi Sahili', pl: 'Wybrzeże Kości Słoniowej',
    id: 'Pantai Gading', vi: 'Bờ Biển Ngà', ro: 'Coasta de Fildeș',
  },
  XKX: {
    es: 'Kosovo', pt: 'Kosovo', de: 'Kosovo', it: 'Kosovo', ru: 'Косово', tr: 'Kosova',
    pl: 'Kosowo', nl: 'Kosovo', id: 'Kosovo', vi: 'Kosovo', th: 'โคโซโว', uk: 'Косово',
    ro: 'Kosovo', el: 'Κοσσυφοπέδιο',
  },
};

const stats = JSON.parse(readFileSync(join(ROOT, 'assets/countries_stats.json'), 'utf8'));
const cca3ToCca2 = JSON.parse(readFileSync(join(REPO, 'cca3_to_cca2.json'), 'utf8'));

const out = {};
const missing = [];

for (const country of stats) {
  const cca3 = country.cca3;
  const cca2 = cca3ToCca2[cca3];
  const names = {};
  for (const locale of LOCALES) {
    const override = FALLBACKS[cca3]?.[locale];
    if (override) {
      names[locale] = override;
      continue;
    }
    const display = cca2 ? new Intl.DisplayNames([locale], { type: 'region' }).of(cca2) : null;
    // ICU rend le code tel quel quand il ne connaît pas le territoire.
    if (!display || display === cca2) {
      missing.push(`${cca3}/${locale}`);
      continue;
    }
    // « Myanmar (Birmanie) » : la parenthèse du CLDR ne sert à rien dans un
    // quiz, où le nom doit être une réponse, pas une glose.
    names[locale] = display.replace(/\s*\([^)]*\)\s*$/, '');
  }
  out[cca3] = names;
}

if (missing.length) {
  console.error(`[country_names] ${missing.length} noms introuvables : ${missing.slice(0, 20).join(', ')}`);
  process.exit(1);
}

writeFileSync(join(ROOT, 'assets/country_names.json'), JSON.stringify(out, null, 0) + '\n', 'utf8');
console.log(`assets/country_names.json : ${Object.keys(out).length} pays x ${LOCALES.length} langues`);
