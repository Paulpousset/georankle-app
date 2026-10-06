// Fait écouter plusieurs voix ElevenLabs sur la même réplique de short, pour
// choisir celle de la voix off (variable de dépôt XI_VOICE_FR / XI_VOICE_EN).
//
//   XI_API_KEY=… node voice-samples.mjs [fr]
//
// Candidates : les voix les plus utilisées de la Voice Library dans la langue
// (catégories réseaux sociaux et conversation), puis quelques voix pré-faites
// multilingues. Une voix que le compte ne peut pas utiliser est ignorée.
// Sortie : ../out/voice-samples/NN-nom.mp3 et index.json (id, nom, description).
// Coût : ~150 caractères par voix.
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'out', 'voice-samples');
const KEY = process.env.XI_API_KEY;
const LANG = process.argv[2] || 'fr';
const MODEL = process.env.XI_MODEL || 'eleven_multilingual_v2';
const MAX_LIBRARY = 7;

const SCRIPTS = {
  fr: "Quel pays est au-dessus ? Facile… Celle-là, je la sens bien ! Ça commence à chauffer… Ah. Non, non, non… GeoG, c'est gratuit, le lien est dans la bio !",
  en: "Which country is higher? Easy… I've got a good feeling about this one! It's heating up… Oh. No, no, no… GeoG is free, link in bio!",
};
// Mêmes réglages que voice.mjs.
const SETTINGS = { stability: 0.38, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true };

const PREMADE = [
  ['IKne3meq5aSn9XLyUdCD', 'Charlie', 'pré-faite, homme, décontracté'],
  ['TX3LPaxmHKxFdv7VOQHJ', 'Liam', 'pré-faite, jeune homme, énergique'],
  ['cgSgspJ2msm6clMCkdW9', 'Jessica', 'pré-faite, jeune femme, expressive'],
  ['FGY2WhTYpPnrIDTdsKH5', 'Laura', 'pré-faite, femme, enjouée'],
  ['pNInz6obpgDQGcFmaJgB', 'Adam', 'pré-faite, voix actuelle'],
];

if (!KEY) {
  console.error('XI_API_KEY manquante.');
  process.exit(1);
}
const api = (path, init = {}) =>
  fetch(`https://api.elevenlabs.io${path}`, { ...init, headers: { 'xi-api-key': KEY, ...init.headers } });

async function library() {
  const seen = new Map();
  for (const useCase of ['social_media', 'conversational', 'narrative_story']) {
    const q = new URLSearchParams({ language: LANG, use_cases: useCase, sort: 'usage_character_count_1y', page_size: '10' });
    const res = await api(`/v1/shared-voices?${q}`);
    if (!res.ok) {
      console.warn(`• Voice Library (${useCase}) : ${res.status}`);
      continue;
    }
    for (const v of (await res.json()).voices ?? []) {
      if (!seen.has(v.voice_id)) {
        const desc = [v.gender, v.age, v.accent, v.descriptive, v.use_case].filter(Boolean).join(', ');
        seen.set(v.voice_id, [v.voice_id, v.name, `Voice Library, ${desc}`]);
      }
    }
  }
  return [...seen.values()];
}

mkdirSync(OUT, { recursive: true });
const candidates = [...(await library()), ...PREMADE];
const index = [];
let tried = 0;
let fromLibrary = 0;
for (const [id, name, desc] of candidates) {
  const isLibrary = desc.startsWith('Voice Library');
  if (isLibrary && fromLibrary >= MAX_LIBRARY) continue;
  tried++;
  const res = await api(`/v1/text-to-speech/${id}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: SCRIPTS[LANG] ?? SCRIPTS.en, model_id: MODEL, language_code: LANG, voice_settings: SETTINGS }),
  });
  if (!res.ok) {
    console.warn(`• ${name} (${id}) ignorée : ${res.status} ${(await res.text()).slice(0, 160)}`);
    continue;
  }
  if (isLibrary) fromLibrary++;
  const n = String(index.length + 1).padStart(2, '0');
  const file = `${n}-${name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 30)}.mp3`;
  writeFileSync(join(OUT, file), Buffer.from(await res.arrayBuffer()));
  index.push({ n: Number(n), id, name, desc, file });
  console.log(`✓ ${n} ${name} (${id}) — ${desc}`);
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`${index.length}/${tried} voix dans ${OUT}`);
if (!index.length) process.exit(1);
