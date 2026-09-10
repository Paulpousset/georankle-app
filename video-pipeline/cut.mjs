// Découpe la prise en plans, et décline le format social.
//
//   node cut.mjs                 # tous les plans + la déclinaison 9:16
//   node cut.mjs globe silhouette
//
// La prise est un long plan-séquence de la visite ; le montage, lui, a besoin
// de morceaux nommés. On les extrait d'après le manifeste plutôt qu'à l'œil :
// les bornes y sont notées à l'image près par l'enregistreur, donc un plan
// commence toujours là où la scène commence — même après un changement de
// rythme qui aurait décalé toute la suite.
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';
import ffmpeg from 'ffmpeg-static';
import { OUT, DEVICE, DEVICES, CRF, X264_PRESET } from './config.mjs';

const dir = join(OUT, DEVICE);
const manifestPath = join(dir, 'tour.json');
if (!existsSync(manifestPath)) {
  console.error(`Pas de prise à découper : ${manifestPath} est absent. Lancez d'abord « npm run record ».`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const master = join(dir, manifest.video);

const only = process.argv.slice(2);
// Une scène vide (un mode encore sous drapeau, par exemple) n'a pas de plan à
// donner : ffmpeg produirait un fichier de zéro image qui casse le montage.
const scenes = manifest.scenes.filter(
  (s) => (!only.length || only.includes(s.id)) && !s.error && s.to - s.from > 1,
);

const run = (args) => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const encode = ['-c:v', 'libx264', '-preset', X264_PRESET, '-crf', String(CRF), '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];

// ── Les plans ───────────────────────────────────────────────────────────────
const clips = join(dir, 'clips');
mkdirSync(clips, { recursive: true });

for (const s of scenes) {
  const out = join(clips, `${s.id}.mp4`);
  run(['-ss', String(s.from), '-i', master, '-t', String((s.to - s.from).toFixed(3)), ...encode, out]);
  const right = (s.notes || []).filter((n) => n.kind === 'answer' && n.correct === true).length;
  const wrong = (s.notes || []).filter((n) => n.kind === 'answer' && n.correct === false).length;
  const score = right + wrong ? ` — ${right}/${right + wrong} bonnes réponses` : '';
  console.log(`✓ ${s.id}.mp4  ${(s.to - s.from).toFixed(1)} s${score}`);
}

// ── La déclinaison verticale ────────────────────────────────────────────────
// 1080×1920 sert à la fois au Play Store et aux formats courts. On recadre au
// centre plutôt que de compresser l'image : un téléphone déformé se remarque
// tout de suite, une bande de contenu perdue en haut et en bas, non.
if (!only.length) {
  const target = DEVICES.social.out;
  const src = DEVICES[DEVICE].out;
  const out = join(dir, `tour-${target.width}x${target.height}.mp4`);
  run([
    '-i', master,
    '-vf', `scale=${target.width}:-2:flags=lanczos,crop=${target.width}:${target.height}:0:(ih-${target.height})/2`,
    ...encode, out,
  ]);
  console.log(`✓ ${out}  (recadré depuis ${src.width}×${src.height})`);
}

const failed = manifest.scenes.filter((s) => s.error);
if (failed.length) console.log(`\n⚠ ${failed.length} scène(s) non découpée(s) : ${failed.map((s) => s.id).join(', ')}`);
