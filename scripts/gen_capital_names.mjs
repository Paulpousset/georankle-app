/**
 * Assemble `assets/capital_names.json` depuis `scripts/capitals/<langue>.json`.
 *
 * Le CLDR nomme les pays, pas les villes : ces tables sont écrites à la main.
 * Elles n'ont pas toutes la même densité, et c'est voulu :
 *   - **ru, uk, el, th** doivent couvrir les 195 capitales — une ville en
 *     alphabet latin au milieu d'une interface cyrillique, grecque ou thaïe est
 *     illisible, et le script échoue si une manque ;
 *   - les langues à alphabet latin ne listent que les **exonymes** (« Londres »,
 *     « Pechino », « Warszawa ») : partout ailleurs l'orthographe anglaise est
 *     déjà la bonne, et la répéter quatorze fois n'aurait fait que du bruit à
 *     maintenir.
 *
 *   node scripts/gen_capital_names.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const LOCALES = ['es', 'pt', 'de', 'it', 'ru', 'tr', 'pl', 'nl', 'id', 'vi', 'th', 'uk', 'ro', 'el'];
/** Les écritures non latines : couverture complète exigée. */
const FULL_COVERAGE = ['ru', 'uk', 'el', 'th'];

const stats = JSON.parse(readFileSync(join(ROOT, 'assets/countries_stats.json'), 'utf8'));
const codes = stats.map((country) => country.cca3);

const out = {};
const errors = [];

for (const locale of LOCALES) {
  const table = JSON.parse(readFileSync(join(ROOT, `scripts/capitals/${locale}.json`), 'utf8'));
  for (const cca3 of Object.keys(table)) {
    if (!codes.includes(cca3)) errors.push(`${locale}: ${cca3} n'est pas un pays du jeu`);
  }
  if (FULL_COVERAGE.includes(locale)) {
    const missing = codes.filter((cca3) => !table[cca3]);
    if (missing.length) errors.push(`${locale}: ${missing.length} capitales manquantes (${missing.slice(0, 10).join(', ')})`);
  }
  for (const [cca3, name] of Object.entries(table)) {
    (out[cca3] ??= {})[locale] = name;
  }
}

if (errors.length) {
  console.error('\n[capital_names]\n  ' + errors.join('\n  ') + '\n');
  process.exit(1);
}

// Ordre stable : celui des données de jeu, pas celui de lecture des fichiers.
const ordered = {};
for (const cca3 of codes) if (out[cca3]) ordered[cca3] = out[cca3];

writeFileSync(join(ROOT, 'assets/capital_names.json'), JSON.stringify(ordered, null, 0) + '\n', 'utf8');
const total = Object.values(ordered).reduce((sum, entry) => sum + Object.keys(entry).length, 0);
console.log(`assets/capital_names.json : ${Object.keys(ordered).length} pays, ${total} noms`);
