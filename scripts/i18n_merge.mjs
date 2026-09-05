/**
 * Fusionne un lot de traductions dans le catalogue d'une langue.
 *
 * Les catalogues font 1379 entrées : on les remplit par tranches, et ce script
 * recolle chaque tranche sans toucher au reste ni à l'ordre (celui de
 * `keys.json`). Une clé absente de `keys.json` est refusée — c'est presque
 * toujours une coquille dans la clé anglaise, et elle ne s'afficherait jamais.
 *
 *   node scripts/i18n_merge.mjs es tranche.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const [locale, chunkPath] = process.argv.slice(2);

if (!locale || !chunkPath) {
  console.error('usage : node scripts/i18n_merge.mjs <langue> <tranche.json>');
  process.exit(1);
}

const catalogPath = join(ROOT, `src/i18n/catalog/${locale}.json`);
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const chunk = JSON.parse(readFileSync(chunkPath, 'utf8'));

const unknown = Object.keys(chunk).filter((key) => !(key in catalog));
if (unknown.length) {
  console.error(`[${locale}] ${unknown.length} clés inconnues :\n  ` + unknown.slice(0, 10).join('\n  '));
  process.exit(1);
}

let written = 0;
for (const [key, value] of Object.entries(chunk)) {
  if (typeof value !== 'string' || !value.trim()) continue;
  if (!catalog[key]) written += 1;
  catalog[key] = value;
}

writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
const done = Object.values(catalog).filter(Boolean).length;
const total = Object.keys(catalog).length;
console.log(`${locale} : +${written} → ${done}/${total} (${((done / total) * 100).toFixed(1)}%)`);
