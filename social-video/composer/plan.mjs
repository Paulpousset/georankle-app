// Transforme les vidéos brutes (../out/raw/<flow>-<lang>.mp4) en fiches de
// montage (../out/episodes/<flow>-<lang>-v<N>.json), une par accroche.
//
//   node plan.mjs              # toutes les vidéos brutes, une accroche chacune
//   node plan.mjs --variants 3 # 3 montages par vidéo, pour comparer les accroches
//
// L'accroche choisie tourne avec le jour de l'année : deux tournages de suite
// ne sortent pas la même.
//
// Montage serré : la partie est accélérée (SPEED) et, si elle reste trop
// longue, on coupe des questions du milieu (sauts marqués par un flash) pour
// tenir en ~TARGET secondes, fin de partie comprise. Le résultat est
// <flow>-<lang>.cut.mp4, plus un fond flouté <flow>-<lang>.bg.mp4. Les fiches sont du JSON simple, à retoucher à la main
// avant le rendu si besoin.
//
// Intro : la première image de la partie est tenue le temps que la voix lise
// l'accroche, puis la partie démarre. Si le tournage a laissé des repères
// (<flow>-<lang>.marks.jsonl, voir marks-server.mjs), la voix dit chaque
// bonne réponse au moment du tap, à la place des répliques « lines ».
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
const SPEED = Number(arg('speed', '1.25'));
const TARGET = Number(arg('target', '24'));

function probeSeconds(file) {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file,
  ]);
  return Number(String(out).trim());
}

// Changements de question : l'écran change d'un coup à chaque nouvelle manche.
// Le montage y cale un petit zoom et un « pop ». Seuil bas (l'interface reste
// la même, seuls drapeau / pays / textes changent), puis on garde au plus un
// moment par 1,5 s, rien dans la première seconde ni sur l'écran de fin de
// partie (~5 dernières secondes).
function detectBeats(file, clipSeconds) {
  let out = '';
  try {
    out = execFileSync('ffmpeg', [
      '-v', 'error', '-i', file, '-an',
      '-vf', "scale=180:-2,select='gt(scene,0.08)',metadata=print:file=-",
      '-f', 'null', '-',
    ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  } catch {
    return [];
  }
  const beats = [];
  for (const m of out.matchAll(/pts_time:([\d.]+)/g)) {
    const t = Number(m[1]);
    if (t < 1 || t > clipSeconds - 5.5) continue;
    if (beats.length && t - beats[beats.length - 1] < 1.5) continue;
    beats.push(Math.round(t * 100) / 100);
  }
  return beats;
}

// L'enregistrement commence sur l'écran sombre de l'app qui apparaît en
// fondu (~0,6 s) : la vidéo montée démarre sur la première image nette, pour
// que la toute première image du short soit déjà la partie.
function detectStart(file) {
  let out = '';
  try {
    out = execFileSync('ffmpeg', [
      '-v', 'error', '-t', '3', '-i', file, '-an',
      '-vf', 'scale=90:-2,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-',
      '-f', 'null', '-',
    ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  } catch {
    return 0;
  }
  const frames = [...out.matchAll(/pts_time:([\d.]+)[\s\S]*?YAVG=([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const max = Math.max(...frames.map(([, y]) => y));
  return frames.find(([, y]) => y >= 0.95 * max)?.[0] ?? 0;
}

// Garde des questions entières (d'un changement de question au suivant) :
// toujours le début et les deux dernières (la dernière bonne réponse, la
// question ratée et l'écran de fin), puis le plus de questions du début que
// le budget permet. Renvoie les plages gardées, en secondes de la vidéo brute.
function keepRanges(start, beats, clipSeconds) {
  const bounds = [start, ...beats.filter((b) => b > start + 0.5), clipSeconds];
  const pieces = bounds.slice(0, -1).map((a, i) => [a, bounds[i + 1]]);
  const budget = TARGET * SPEED;
  if (clipSeconds - start <= budget || pieces.length < 4) return [[start, clipSeconds]];
  const tail = pieces.slice(-2);
  let used = tail.reduce((s, [a, b]) => s + b - a, 0);
  const head = [];
  for (const piece of pieces.slice(0, -2)) {
    if (head.length && used + piece[1] - piece[0] > budget) break;
    head.push(piece);
    used += piece[1] - piece[0];
  }
  const ranges = [];
  for (const [a, b] of [...head, ...tail]) {
    const last = ranges[ranges.length - 1];
    if (last && Math.abs(last[1] - a) < 0.01) last[1] = b;
    else ranges.push([a, b]);
  }
  return ranges;
}

// Durée de l'intro : le temps de lire la plus longue accroche (~14 signes par
// seconde pour la voix), bornée entre 2,2 et 4 s.
const introSeconds = (hooksList) =>
  Math.round(Math.min(4, Math.max(2.2, Math.max(...hooksList.map((h) => h.length)) / 14 + 0.4)) * 10) / 10;

// Bonnes réponses signalées pendant le tournage, en secondes de la vidéo
// brute. Le repère « stop » est posé juste avant la fin de l'enregistrement :
// la vidéo a commencé rawSeconds plus tôt.
function readAnswers(file, rawSeconds) {
  let marks;
  try {
    marks = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  } catch {
    return [];
  }
  const stop = marks.find((m) => m.kind === 'stop');
  if (!stop) return [];
  const t0 = stop.t - rawSeconds;
  return marks
    .filter((m) => m.kind === 'answer' && m.text)
    .map((m) => ({ at: m.t - t0, text: m.text }))
    .filter((m) => m.at > 0 && m.at < rawSeconds);
}

// Monte la vidéo serrée et son fond flouté avec ffmpeg ; renvoie la
// correspondance temps brut → temps monté (null si coupé) et les sauts.
function cut(file, ranges, intro, outCut, outBg) {
  const parts = ranges.map(([a, b], i) => `[0:v]trim=start=${a}:end=${b},setpts=PTS-STARTPTS[p${i}]`);
  const graph = `${parts.join(';')};${ranges.map((_, i) => `[p${i}]`).join('')}concat=n=${ranges.length}:v=1:a=0,setpts=PTS/${SPEED},fps=30,tpad=start_mode=clone:start_duration=${intro}[v]`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-filter_complex', graph, '-map', '[v]', '-an',
    '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', outCut]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', outCut, '-an',
    '-vf', 'scale=180:-2,boxblur=12:2,eq=saturation=1.4:brightness=-0.05',
    '-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', outBg]);
  const offsets = [];
  let acc = 0;
  for (const [a, b] of ranges) {
    offsets.push(acc);
    acc += b - a;
  }
  const map = (t) => {
    const i = ranges.findIndex(([a, b]) => t >= a && t <= b);
    return i < 0 ? null : Math.round((intro + (offsets[i] + t - ranges[i][0]) / SPEED) * 100) / 100;
  };
  const jumps = offsets.slice(1).map((o) => Math.round((intro + o / SPEED) * 100) / 100);
  return { map, jumps };
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
  const rawSeconds = probeSeconds(join(RAW, file));
  const rawBeats = detectBeats(join(RAW, file), rawSeconds);
  const ranges = keepRanges(detectStart(join(RAW, file)), rawBeats, rawSeconds);
  const clip = `${flow}-${lang}.cut.mp4`;
  const background = `${flow}-${lang}.bg.mp4`;
  const intro = introSeconds(copy.hooks);
  const { map, jumps } = cut(join(RAW, file), ranges, intro, join(RAW, clip), join(RAW, background));
  const answers = readAnswers(join(RAW, `${flow}-${lang}.marks.jsonl`), rawSeconds)
    .map((a) => ({ at: map(a.at), text: `${a.text} !`, maxLate: 0.8 }))
    .filter((a) => a.at != null);
  const clipSeconds = probeSeconds(join(RAW, clip));
  const beats = rawBeats.map(map).filter((t) => t != null && !jumps.some((j) => Math.abs(j - t) < 0.3));
  // Sous-titres et répliques : en temps brut, puis recalés sur le montage.
  const rawAt = (c) => (c.fromEnd != null ? Math.max(0, rawSeconds - c.fromEnd) : c.at);
  const captions = (copy.captions ?? [])
    .map(({ fromEnd, say, ...c }) => ({ ...c, at: map(rawAt({ ...c, fromEnd })) }))
    .filter((c) => c.at != null);
  console.log(`• ${file} : ${rawSeconds.toFixed(1)} s → ${clipSeconds.toFixed(1)} s (intro ${intro} s ; ${ranges.map(([a, b]) => `${a.toFixed(1)}–${b.toFixed(1)}`).join(', ')}) ; ${answers.length} réponse(s) dite(s)`);
  for (let v = 0; v < variants; v++) {
    const pick = (list) => list[(day + v) % list.length];
    const episode = {
      clip,
      background,
      clipSeconds,
      trimStart: 0,
      speed: 1,
      hook: pick(copy.hooks),
      subhook: pick(copy.subhooks),
      beats,
      jumps,
      captions,
      cta: common.cta,
      ctaSub: common.ctaSub,
      icon: 'icon.png',
      lang,
      // Script de la voix off ; voice.mjs y ajoute les fichiers audio et cale
      // les répliques pour qu'elles ne se chevauchent pas.
      voice: [
        { at: 0.2, text: null },
        ...(copy.captions ?? [])
          .map((c) => ({ at: map(rawAt(c)), text: c.say ?? c.text }))
          .filter((l) => l.at != null),
        // Répliques de partie sur les 2e, 4e et 6e questions, pour que la voix
        // accompagne tout le jeu et pas seulement l'accroche. Si l'écran change
        // trop peu pour repérer les questions, on les répartit sur la partie.
        ...answers,
        ...(answers.length ? [] : copy.lines ?? []).map((text, i, all) => ({
          at: beats[1 + i * 2] ?? Math.round((3 + ((clipSeconds - 9) * (i + 1)) / (all.length + 1)) * 100) / 100,
          text,
        })),
        common.voiceOutro ? { atEnd: true, text: common.voiceOutro } : null,
      ].filter(Boolean),
      post: `${copy.post}\n\n${common.tags}`,
    };
    episode.voice[0].text = episode.hook;
    // voice.mjs cale les répliques dans l'ordre : on les trie par moment,
    // la réplique de fin (atEnd) en dernier.
    episode.voice.sort((x, y) => (x.atEnd ? Infinity : x.at ?? 0) - (y.atEnd ? Infinity : y.at ?? 0));
    const name = `${flow}-${lang}-v${v + 1}`;
    writeFileSync(join(EPISODES, `${name}.json`), JSON.stringify(episode, null, 2) + '\n');
    console.log('•', name, '→', episode.hook);
    count++;
  }
}
console.log(`${count} fiche(s) dans ${EPISODES}`);
