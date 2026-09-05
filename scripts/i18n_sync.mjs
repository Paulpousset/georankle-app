/**
 * Aligne les catalogues `src/i18n/catalog/<langue>.json` sur `src/i18n/keys.json`.
 *
 * Ajoute les clés nouvelles avec une valeur vide (= « à traduire », `tr`
 * retombe alors sur l'anglais), retire celles qui ont disparu du code, et
 * réordonne tout comme la liste de clés pour que les différences restent
 * lisibles. Les traductions déjà écrites ne sont jamais touchées.
 *
 *   node scripts/i18n_extract.mjs --write   # d'abord : rafraîchir les clés
 *   node scripts/i18n_sync.mjs              # ensuite : propager aux 14 langues
 *   node scripts/i18n_sync.mjs --report     # état d'avancement, sans écrire
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CATALOGS = join(ROOT, 'src/i18n/catalog');
const REPORT_ONLY = process.argv.includes('--report');

const LOCALES = ['es', 'pt', 'de', 'it', 'ru', 'tr', 'pl', 'nl', 'id', 'vi', 'th', 'uk', 'ro', 'el'];

const keys = JSON.parse(readFileSync(join(ROOT, 'src/i18n/keys.json'), 'utf8')).map((entry) => entry.key);

let missingTotal = 0;
for (const locale of LOCALES) {
  const path = join(CATALOGS, `${locale}.json`);
  const current = JSON.parse(readFileSync(path, 'utf8'));
  const next = {};
  let missing = 0;
  for (const key of keys) {
    const value = current[key] ?? '';
    next[key] = value;
    if (!value) missing += 1;
  }
  const dropped = Object.keys(current).filter((key) => !(key in next)).length;
  missingTotal += missing;
  const done = keys.length - missing;
  const pct = ((done / keys.length) * 100).toFixed(1);
  console.log(
    `${locale} : ${done}/${keys.length} traduites (${pct}%)` +
      (dropped ? `, ${dropped} clés obsolètes retirées` : ''),
  );
  if (!REPORT_ONLY) writeFileSync(path, JSON.stringify(next, null, 2) + '\n', 'utf8');
}

console.log(`\n${keys.length} clés x ${LOCALES.length} langues — ${missingTotal} à traduire.`);
