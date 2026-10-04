// Transforme les vidéos brutes (../out/raw/<flow>-<lang>.mp4) en fiches de
// montage (../out/episodes/<flow>-<lang>-v<N>.json), une par accroche.
//
//   node plan.mjs              # toutes les vidéos brutes, une accroche chacune
//   node plan.mjs --variants 3 # 3 montages par vidéo, pour comparer les accroches
//
// L'accroche choisie tourne avec le jour de l'année : deux tournages de suite
// ne sortent pas la même. Les fiches sont du JSON simple, à retoucher à la main
// avant le rendu si besoin.
import { execFileSync } from 'child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, '..', 'out', 'raw');
const EPISODES = join(HERE, '..', 'out', 'episodes');
const hooks = JSON.parse(readFileSync(join(HERE, '..', 'hooks.json'), 'utf8'));

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const variants = Number(arg('variants', '1'));

function probeSeconds(file) {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file,
  ]);
  return Number(String(out).trim());
}

const day = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000);
mkdirSync(EPISODES, { recursive: true });

let count = 0;
for (const file of readdirSync(RAW).filter((f) => f.endsWith('.mp4')).sort()) {
  const m = file.match(/^(.+)-([a-z]{2})\.mp4$/);
  if (!m) continue;
  const [, flow, lang] = m;
  const copy = hooks[flow]?.[lang] ?? hooks[flow]?.en;
  const common = hooks._common[lang] ?? hooks._common.en;
  if (!copy) {
    console.warn(`• pas d'accroche pour ${flow} dans hooks.json, ignoré`);
    continue;
  }
  const clipSeconds = probeSeconds(join(RAW, file));
  for (let v = 0; v < variants; v++) {
    const pick = (list) => list[(day + v) % list.length];
    const episode = {
      clip: file,
      clipSeconds,
      // Les flows démarrent l'enregistrement sur la première question : rien à couper.
      trimStart: 0,
      speed: 1,
      hook: pick(copy.hooks),
      subhook: pick(copy.subhooks),
      captions: (copy.captions ?? []).map(({ fromEnd, ...c }) =>
        fromEnd != null ? { ...c, at: Math.max(0, clipSeconds - fromEnd) } : c,
      ),
      cta: common.cta,
      ctaSub: common.ctaSub,
      icon: 'icon.png',
      lang,
      // Script de la voix off ; voice.mjs y ajoute les fichiers audio et cale
      // les répliques pour qu'elles ne se chevauchent pas.
      voice: [
        { at: 0.2, text: null },
        ...(copy.captions ?? []).map((c) => ({ at: c.at ?? null, fromEnd: c.fromEnd ?? null, text: c.say ?? c.text })),
        common.voiceOutro ? { atEnd: true, text: common.voiceOutro } : null,
      ].filter(Boolean),
      post: `${copy.post}\n\n${common.tags}`,
    };
    episode.voice[0].text = episode.hook;
    for (const line of episode.voice) {
      if (line.fromEnd != null) line.at = Math.max(0, clipSeconds - line.fromEnd);
      delete line.fromEnd;
    }
    const name = `${flow}-${lang}-v${v + 1}`;
    writeFileSync(join(EPISODES, `${name}.json`), JSON.stringify(episode, null, 2) + '\n');
    console.log('•', name, '→', episode.hook);
    count++;
  }
}
console.log(`${count} fiche(s) dans ${EPISODES}`);
