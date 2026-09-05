/**
 * Génère `supabase/functions/_shared/push_i18n.ts` : le peu de texte que le
 * SERVEUR doit écrire lui-même, dans les seize langues.
 *
 * Les notifications d'invitation et de demande d'ami sont composées côté
 * Supabase, hors de l'app : elles ne peuvent pas appeler `tr()`. Plutôt que de
 * retaper quatorze traductions dans une edge function, on extrait des
 * catalogues les quelques clés concernées — le texte reste écrit à un seul
 * endroit, et une retouche de traduction suit automatiquement.
 *
 * Le fichier produit est versionné : les edge functions sont déployées telles
 * quelles, sans étape de build.
 *
 *   node scripts/gen_push_i18n.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LOCALES = ['es', 'pt', 'de', 'it', 'ru', 'tr', 'pl', 'nl', 'id', 'vi', 'th', 'uk', 'ro', 'el'];

/** Les clés anglaises dont le serveur a besoin. */
const KEYS = [
  'New Challenge!',
  '{0} challenges you in {2}!',
  '{0} wants to be friends',
  'A player',
  // Les libellés des modes, cités dans le corps de l'invitation.
  'Rankle',
  'Streak',
  'Versus',
  'Geo Globe',
  'Guess the Country',
  'Country Challenges',
  'Country Quiz',
  'Higher or Lower',
  'Silhouette',
  'Borders',
  'Languages',
];

/** Le français, écrit en clair dans le code de l'app, n'est dans aucun catalogue. */
const FRENCH = Object.fromEntries(
  JSON.parse(readFileSync(join(ROOT, 'src/i18n/keys.json'), 'utf8')).map((entry) => [entry.key, entry.fr]),
);

const table = { en: {}, fr: {} };
for (const key of KEYS) {
  table.en[key] = key;
  table.fr[key] = FRENCH[key] ?? key;
}
for (const locale of LOCALES) {
  const catalog = JSON.parse(readFileSync(join(ROOT, `src/i18n/catalog/${locale}.json`), 'utf8'));
  table[locale] = Object.fromEntries(KEYS.map((key) => [key, catalog[key] || key]));
}

const missing = KEYS.filter((key) => !(key in FRENCH));
if (missing.length) {
  console.error(`[push_i18n] clés absentes de keys.json : ${missing.join(', ')}`);
  process.exit(1);
}

const body = `/**
 * Les textes des notifications poussées, dans les seize langues.
 *
 * ⚠️ Fichier GÉNÉRÉ par \`node scripts/gen_push_i18n.mjs\` depuis
 * \`src/i18n/catalog/\` — ne pas éditer à la main : la prochaine génération
 * écraserait la retouche. Pour corriger une traduction, corriger le catalogue.
 *
 * Le serveur écrit ces quelques phrases lui-même (l'app n'est pas là pour le
 * faire) : elles sont donc extraites du même endroit que le reste, et pas
 * retapées ici.
 */
export type PushLang = keyof typeof PUSH_STRINGS;

const PUSH_STRINGS = ${JSON.stringify(table, null, 2)} as const;

/** La langue du destinataire, ou l'anglais si l'app ne la parle pas (ou plus). */
export function pushLang(value: string | null | undefined): PushLang {
  return value && value in PUSH_STRINGS ? (value as PushLang) : 'en';
}

/** Traduit une clé anglaise, en remplaçant les trous \`{0}\`, \`{1}\`… */
export function pushText(lang: PushLang, key: string, args: (string | number)[] = []): string {
  const table = PUSH_STRINGS[lang] as Record<string, string>;
  const text = table[key] ?? key;
  return text.replace(/\\{(\\d+)\\}/g, (whole, index) => {
    const value = args[Number(index)];
    return value === undefined ? whole : String(value);
  });
}
`;

writeFileSync(join(ROOT, 'supabase/functions/_shared/push_i18n.ts'), body, 'utf8');
console.log(`supabase/functions/_shared/push_i18n.ts : ${KEYS.length} clés x 16 langues`);
