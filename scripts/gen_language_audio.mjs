// Génère les extraits parlés du mode « Langues » (ElevenLabs) et les pousse
// dans le bucket Supabase Storage `game-audio`.
//
//   XI_API_KEY=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/gen_language_audio.mjs
//   ONLY=fr,ja,ar  …    # une vague de langues à la fois (économise les crédits)
//   FORCE=1        …    # regénère même si le fichier est déjà en ligne
//   DRY=1          …    # n'appelle rien, affiche juste le plan
//
// Idempotent : un HEAD sur l'URL publique saute ce qui existe déjà. Comme le nom
// de fichier contient le hash du texte, corriger une phrase produit un NOUVEAU
// fichier — donc aucun extrait périmé ne peut être servi par un cache.
//
// ⚠️ `language_code` est OBLIGATOIRE dans la requête : sans lui, le modèle
// multilingue lit régulièrement une phrase portugaise avec un accent espagnol,
// et la « bonne » réponse devient objectivement fausse à l'oreille. C'est le
// risque n°1 du mode.
//
// ⚠️ Les voix tournent sur un pool COMMUN à toutes les langues : si chaque langue
// avait sa voix, le joueur apprendrait des timbres au lieu d'apprendre des
// langues. Idem pour le volume, d'où le loudnorm ffmpeg.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';

const KEY = process.env.XI_API_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const DRY = !!process.env.DRY;
const FORCE = !!process.env.FORCE;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;

if (!DRY && (!KEY || !SERVICE_KEY || !SUPABASE_URL)) {
  console.error('Manque XI_API_KEY / SUPABASE_SERVICE_ROLE_KEY / EXPO_PUBLIC_SUPABASE_URL');
  process.exit(1);
}

const ROOT = new URL('../', import.meta.url).pathname;
const CORPUS = JSON.parse(readFileSync(join(ROOT, 'assets/languages.json'), 'utf8'));
const BUCKET = 'game-audio';

/** FNV-1a 32 bits — MÊME implémentation que src/lib/languageAudio.ts. Toute
 *  divergence rendrait les 310 fichiers introuvables d'un coup. */
const fnv1a32 = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};
const hash8 = (s) => fnv1a32(s).toString(16).padStart(8, '0');
const pathFor = (code, p) =>
  `languages/v${CORPUS.version}/${code}/${p.id}.${hash8(p.text)}.mp3`;
const urlFor = (rel) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${rel}`;

// ── Pool de voix, commun à toutes les langues ───────────────────────────────
// Voix ElevenLabs pré-faites, mixte H/F. `node scripts/gen_language_audio.mjs`
// avec VOICES=… pour surcharger ; GET /v1/voices pour en découvrir d'autres.
const VOICE_POOL = (process.env.VOICES || [
  '21m00Tcm4TlvDq8ikWAM', // Rachel   F
  'AZnzlk1XvdvUeBnXmlld', // Domi     F
  'EXAVITQu4vr4xnSDxMaL', // Sarah    F
  'ErXwobaYiN019PkySvjV', // Antoni   H
  'MF3mGyEYCl7XYWbV9V6O', // Elli     F
  'TxGEqnHWrfWFTfGW9XjX', // Josh     H
  'VR6AewLTigWG4xSOukaG', // Arnold   H
  'pNInz6obpgDQGcFmaJgB', // Adam     H
  'yoZ06aMxZJJ28mfd3POQ', // Sam      H
  'jsScnYkNNda9Q1NES5nn', // Léo      H
].join(',')).split(',');

const voiceFor = (phraseId) => VOICE_POOL[fnv1a32(phraseId) % VOICE_POOL.length];

const H = { 'xi-api-key': KEY, 'Content-Type': 'application/json' };
const SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true };

const TMP = join(tmpdir(), `langaudio-${process.pid}`);
mkdirSync(TMP, { recursive: true });

let made = 0, skipped = 0, failed = 0;
const plan = [];

for (const lang of CORPUS.languages) {
  if (ONLY && !ONLY.has(lang.code)) continue;
  // `audio: false` = pas encore validée à l'écoute, donc exclue des vagues
  // globales. La demander NOMMÉMENT via ONLY la génère quand même : c'est le
  // seul moyen de l'essayer avant de décider si on l'active.
  if (!lang.audio && !ONLY) { console.log(`· ${lang.code} : audio:false, ignoré`); continue; }

  for (const phrase of lang.phrases) {
    const rel = pathFor(lang.code, phrase);
    plan.push(rel);
    if (DRY) continue;

    // 1) Idempotence.
    if (!FORCE) {
      const head = await fetch(urlFor(rel), { method: 'HEAD' }).catch(() => null);
      if (head?.ok) { skipped++; continue; }
    }

    // 2) Synthèse.
    const body = {
      text: phrase.text,
      model_id: lang.ttsModel,
      language_code: lang.code,      // ← NE JAMAIS RETIRER (cf. en-tête)
      voice_settings: SETTINGS,
    };
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceFor(phrase.id)}?output_format=mp3_44100_128`,
      { method: 'POST', headers: H, body: JSON.stringify(body) },
    );
    if (!res.ok) {
      console.error(`✗ ${phrase.id} : ${res.status} ${(await res.text()).slice(0, 160)}`);
      failed++;
      continue;
    }
    const raw = join(TMP, `${phrase.id}.raw.mp3`);
    const out = join(TMP, `${phrase.id}.mp3`);
    writeFileSync(raw, Buffer.from(await res.arrayBuffer()));

    // 3) Mono 96k + silences rognés + volume normalisé. Le loudnorm compte : sans
    // lui le volume varie d'une voix à l'autre et devient un indice parasite.
    try {
      execFileSync('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error', '-i', raw,
        '-ac', '1',
        '-af', 'silenceremove=start_periods=1:start_silence=0.05:start_threshold=-50dB,'
             + 'areverse,silenceremove=start_periods=1:start_silence=0.05:start_threshold=-50dB,areverse,'
             + 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-c:a', 'libmp3lame', '-b:a', '96k', out,
      ]);
    } catch (e) {
      console.error(`✗ ${phrase.id} : ffmpeg a échoué`, e.message);
      failed++;
      continue;
    }

    // 4) Upload (service_role : le bucket n'accepte aucune écriture cliente).
    const buf = readFileSync(out);
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${rel}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'audio/mpeg',
        'x-upsert': 'true',
        'cache-control': 'max-age=31536000',
      },
      body: buf,
    });
    if (!up.ok) {
      console.error(`✗ ${phrase.id} : upload ${up.status} ${(await up.text()).slice(0, 160)}`);
      failed++;
      continue;
    }
    made++;
    console.log(`✓ ${rel} (${(buf.length / 1024).toFixed(0)} Ko)`);
  }
}

rmSync(TMP, { recursive: true, force: true });

if (DRY) {
  console.log(plan.join('\n'));
  console.log(`\n${plan.length} extraits à générer.`);
} else {
  console.log(`\n${made} générés · ${skipped} déjà en ligne · ${failed} en échec`);
  console.log('Écoute-les AVANT de flipper languages_audio : un accent faux rend la bonne réponse fausse.');
  if (failed) process.exit(1);
}
