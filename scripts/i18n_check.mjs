/**
 * Contrôles d'intégrité des catalogues, à lancer avant de livrer.
 *
 * Une traduction ne se relit pas à l'œil dans quatorze langues : ce script
 * vérifie ce qui casse *silencieusement* à l'exécution.
 *
 *   1. **les trous `{0}`** — une traduction qui en perd un affiche une phrase
 *      amputée, une qui en invente un affiche « {3} » à l'écran ;
 *   2. **les clés inconnues** — un catalogue qui garde une clé disparue du code
 *      est du poids mort, et souvent le signe d'une faute de frappe ;
 *   3. **les valeurs vides ou identiques à l'anglais** — les premières
 *      retombent sur l'anglais (donc non traduites), les secondes sont
 *      légitimes pour « OK » ou « km² », mais suspectes en nombre.
 *
 *   node scripts/i18n_check.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CATALOGS = join(ROOT, 'src/i18n/catalog');

const keys = JSON.parse(readFileSync(join(ROOT, 'src/i18n/keys.json'), 'utf8'));
const known = new Set(keys.map((entry) => entry.key));

/** Les trous d'une chaîne, triés : « {1} et {0} » → ['{0}','{1}']. */
function slots(text) {
  return [...text.matchAll(/\{\d+\}/g)].map((match) => match[0]).sort();
}

/**
 * Les trous « de désinence » de l'anglais : collés à un mot, ils ne portent pas
 * une valeur mais un « s » de pluriel (`{0} round{1}`, `item{1}`, `stay{4}`).
 * Les autres langues n'en ont pas l'usage et ont le droit de les laisser tomber
 * — `format()` ne remplace que les trous présents. En perdre un qui porte une
 * VALEUR, en revanche, ampute la phrase : c'est ce que le contrôle traque.
 */
function suffixSlots(text) {
  return [...text.matchAll(/\w\{(\d+)\}/g)].map((match) => `{${match[1]}}`);
}

const errors = [];
const warnings = [];

for (const file of readdirSync(CATALOGS).filter((name) => name.endsWith('.json'))) {
  const locale = file.replace('.json', '');
  const catalog = JSON.parse(readFileSync(join(CATALOGS, file), 'utf8'));
  let empty = 0;
  let identical = 0;

  for (const [key, value] of Object.entries(catalog)) {
    if (!known.has(key)) {
      errors.push(`${locale}: clé inconnue « ${key.slice(0, 60)} »`);
      continue;
    }
    if (!value) {
      empty += 1;
      continue;
    }
    const optional = new Set(suffixSlots(key));
    const expected = slots(key);
    const got = slots(value);
    const missingSlots = expected.filter((slot) => !got.includes(slot) && !optional.has(slot));
    const extraSlots = got.filter((slot) => !expected.includes(slot));
    if (missingSlots.length || extraSlots.length) {
      errors.push(
        `${locale}: trous incohérents pour « ${key.slice(0, 50)} »` +
          (missingSlots.length ? ` — manquants ${missingSlots.join(' ')}` : '') +
          (extraSlots.length ? ` — en trop ${extraSlots.join(' ')}` : ''),
      );
    }
    if (value === key) identical += 1;
  }

  const total = Object.keys(catalog).length;
  const missing = keys.length - total;
  if (missing > 0) warnings.push(`${locale}: ${missing} clés absentes du catalogue`);
  if (empty) warnings.push(`${locale}: ${empty} valeurs vides (repli sur l'anglais)`);
  console.log(
    `${locale} : ${total} clés, ${empty} vides, ${identical} identiques à l'anglais`,
  );
}

if (warnings.length) console.log('\n' + warnings.map((line) => '⚠️  ' + line).join('\n'));
if (errors.length) {
  console.error('\n' + errors.slice(0, 40).map((line) => '❌ ' + line).join('\n'));
  console.error(`\n${errors.length} erreur(s).`);
  process.exit(1);
}
console.log('\n✅ trous, clés et couverture : rien à signaler.');
