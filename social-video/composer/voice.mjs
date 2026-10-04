// Voix off ElevenLabs pour chaque fiche de ../out/episodes : synthétise chaque
// réplique, la dépose dans public/voice/ et écrit dans la fiche le fichier, sa
// durée et son moment, calé pour que deux répliques ne se chevauchent jamais.
//
//   XI_API_KEY=… node voice.mjs
//
// Variables :
//   XI_API_KEY            obligatoire ; sans elle les vidéos restent muettes
//                         (les sous-titres suffisent), rien n'échoue.
//   XI_VOICE_<LANG>       voix par langue (XI_VOICE_FR, XI_VOICE_EN…), sinon
//   XI_VOICE              voix commune à toutes les langues.
//   XI_MODEL              eleven_multilingual_v2 par défaut ; eleven_v3 est plus
//                         expressif (rires, hésitations) mais moins régulier.
//
// Cache : le nom du fichier est un hash (voix, modèle, langue, texte). Relancer
// ne recrédite rien ; changer une phrase ne paie que cette phrase.
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EPISODES = join(HERE, '..', 'out', 'episodes');
const VOICE_DIR = join(HERE, 'public', 'voice');

const KEY = process.env.XI_API_KEY;
const MODEL = process.env.XI_MODEL || 'eleven_multilingual_v2';
// Voix pré-faite (Adam) en dernier recours : une voix choisie dans la Voice
// Library, ou mieux un clone de ta propre voix, sonne nettement plus humain.
const DEFAULT_VOICE = process.env.XI_VOICE || 'pNInz6obpgDQGcFmaJgB';
// Plus de variation que les réglages du mode Langues : on veut un ton de
// créateur, pas un lecteur neutre.
const SETTINGS = { stability: 0.38, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true };
const GAP = 0.15;

if (!KEY) {
  console.warn('• XI_API_KEY absente : pas de voix off, les vidéos sortiront muettes.');
  process.exit(0);
}
mkdirSync(VOICE_DIR, { recursive: true });

const voiceFor = (lang) => process.env[`XI_VOICE_${lang.toUpperCase()}`] || DEFAULT_VOICE;
// Les emojis se lisent mal (ou pas du tout) : on les retire avant la synthèse.
const speakable = (text) =>
  text.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();

const probeSeconds = (file) =>
  Number(
    String(
      execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]),
    ).trim(),
  );

async function synthesize(text, lang) {
  const voice = voiceFor(lang);
  const id = createHash('sha1').update([voice, MODEL, lang, text].join('|')).digest('hex').slice(0, 16);
  const rel = `voice/${id}.mp3`;
  const file = join(HERE, 'public', rel);
  if (!existsSync(file)) {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
        // language_code évite qu'une phrase française soit lue avec un accent
        // anglais (même leçon que scripts/gen_language_audio.mjs).
        body: JSON.stringify({ text, model_id: MODEL, language_code: lang, voice_settings: SETTINGS }),
      },
    );
    if (!res.ok) throw new Error(`ElevenLabs ${res.status} : ${(await res.text()).slice(0, 200)}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`  + ${rel} « ${text} »`);
  }
  return { file: rel, seconds: probeSeconds(file) };
}

const only = process.argv[2];
let failed = 0;
for (const f of readdirSync(EPISODES).filter((n) => n.endsWith('.json')).sort()) {
  if (only && f !== `${only}.json`) continue;
  const path = join(EPISODES, f);
  const ep = JSON.parse(readFileSync(path, 'utf8'));
  if (!ep.voice?.length) continue;
  console.log(`▶ ${f}`);
  try {
    // Les répliques « partie » sont calées dans l'ordre, sans chevauchement ;
    // une réplique qui déborderait sur la carte de fin est abandonnée.
    const gameSeconds = (ep.clipSeconds - ep.trimStart) / ep.speed;
    let cursor = 0;
    const lines = [];
    for (const line of ep.voice) {
      const text = speakable(line.text ?? '');
      if (!text) continue;
      const audio = await synthesize(text, ep.lang ?? 'fr');
      if (line.atEnd) {
        lines.push({ ...line, ...audio });
        // La carte de fin dure le temps de la réplique, avec un souffle.
        ep.endCardSeconds = Math.max(2.5, audio.seconds + 0.8);
        continue;
      }
      const at = Math.max(line.at ?? 0, cursor);
      if (at + audio.seconds > gameSeconds) {
        console.log(`  – « ${text} » ne tient pas avant la fin, ignorée`);
        continue;
      }
      lines.push({ ...line, ...audio, at });
      cursor = at + audio.seconds + GAP;
    }
    ep.voice = lines;
    writeFileSync(path, JSON.stringify(ep, null, 2) + '\n');
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
    failed++;
  }
}
process.exit(failed ? 1 : 0);
