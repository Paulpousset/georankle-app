// Vérifie que CHAQUE extrait attendu par le mode « Langues » est bien en ligne.
//
//   node scripts/check_language_audio.mjs
//
// Branché dans scripts/ship.sh : impossible de shipper une app dont la variante
// audio référencerait un fichier manquant (le joueur verrait la question
// dégrader en texte sans comprendre pourquoi).
//
// Ne vérifie que les langues marquées `audio: true` — mettre une langue à false
// est justement la façon de la retirer de la variante audio.
import { readFileSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  console.error('Manque EXPO_PUBLIC_SUPABASE_URL');
  process.exit(1);
}

const ROOT = new URL('../', import.meta.url).pathname;
const CORPUS = JSON.parse(readFileSync(join(ROOT, 'assets/languages.json'), 'utf8'));
const BUCKET = 'game-audio';

const fnv1a32 = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};
const hash8 = (s) => fnv1a32(s).toString(16).padStart(8, '0');

const expected = [];
for (const lang of CORPUS.languages) {
  if (!lang.audio) continue;
  for (const p of lang.phrases) {
    expected.push({
      id: p.id,
      url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`
        + `/languages/v${CORPUS.version}/${lang.code}/${p.id}.${hash8(p.text)}.mp3`,
    });
  }
}

const missing = [];
const CONCURRENCY = 8;
let at = 0;

await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (at < expected.length) {
      const item = expected[at++];
      const res = await fetch(item.url, { method: 'HEAD' }).catch(() => null);
      if (!res?.ok) missing.push(item.id);
    }
  }),
);

console.log(`${expected.length - missing.length}/${expected.length} extraits en ligne`);
if (missing.length) {
  console.error(`MANQUANTS (${missing.length}) : ${missing.join(', ')}`);
  console.error('Lance : ONLY=<codes> node scripts/gen_language_audio.mjs');
  process.exit(1);
}
