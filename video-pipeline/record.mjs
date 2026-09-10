// Le point d'entrée : sert l'app, ouvre un téléphone, filme la visite.
//
//   npm run record                       # la visite complète, iPhone 6.9"
//   SCENES=globe,silhouette npm run record
//   DEVICE=social TEMPO=1.15 npm run record
//   SEED=7 npm run record                # une autre partie, rejouable à l'identique
//
// Sortie : `out/<appareil>/tour.mp4` + `tour.json`, le manifeste qui dit à
// quelle seconde commence chaque scène. Le manifeste est ce qui relie cette
// prise au montage : HyperFrames y lit les points de coupe au lieu de les
// chercher à l'œil.
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { serve } from './lib/serve.mjs';
import { openApp } from './lib/browser.mjs';
import { record } from './lib/recorder.mjs';
import { Human } from './lib/human.mjs';
import { SCENES, goHome } from './tour.mjs';
import {
  WEB_DIST, PORT, OUT, DEVICES, DEVICE, FPS, SCREENCAST_QUALITY,
  CRF, X264_PRESET, SEED, LOCALE, HEADED, TEMPO,
} from './config.mjs';

const device = DEVICES[DEVICE];
if (!device) throw new Error(`appareil inconnu : ${DEVICE} (${Object.keys(DEVICES).join(', ')})`);

const only = process.env.SCENES ? new Set(process.env.SCENES.split(',').map((s) => s.trim())) : null;
const scenes = SCENES.filter((s) => !only || only.has(s.id));
if (!scenes.length) throw new Error(`aucune scène retenue (SCENES=${process.env.SCENES})`);

const outDir = join(OUT, DEVICE);
mkdirSync(outDir, { recursive: true });
const video = join(outDir, 'tour.mp4');

const t = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(`[${t()}]`, ...a);

log(`appareil ${DEVICE} — ${device.out.width}×${device.out.height} @ ${FPS} i/s`);
log(`${scenes.length} scène(s), graine ${SEED}, tempo ×${TEMPO}`);

const { url, close: closeServer } = await serve(WEB_DIST, PORT);
const { browser, page, cdp } = await openApp({ device, locale: LOCALE, headed: HEADED });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
// L'app est prête quand son menu l'est. `networkidle` ne convient pas : le
// client Supabase réessaie en boucle et le réseau ne retombe jamais à zéro.
await page.getByRole('button', { name: 'Solo', exact: true }).first().waitFor({ state: 'visible', timeout: 60000 });
await page.waitForTimeout(2500); // les polices et le globe d'accueil se posent

const human = new Human(page, cdp, { seed: SEED, tempo: TEMPO, log: (m) => log('  ·', m) });

const rec = await record(page, cdp, {
  out: video,
  width: device.out.width,
  height: device.out.height,
  fps: FPS,
  quality: SCREENCAST_QUALITY,
  crf: CRF,
  preset: X264_PRESET,
  log: (...a) => log(...a),
});

// Une seconde de calme avant le premier geste : un montage a besoin d'une
// amorce, et une vidéo qui commence sur un appui n'en a pas.
await human.pause(1200);

const marks = [];
for (const scene of scenes) {
  const from = rec.at();
  log(`▶ ${scene.id} — ${scene.title}`);
  // Le carnet de la scène : ce qui a été joué et à quelle seconde. C'est ce
  // qui permet au montage de couper sur une bonne réponse sans revisionner.
  const notes = [];
  const note = (o) => {
    notes.push({ at: +rec.at().toFixed(2), ...o });
    if (o.kind === 'answer') log(`  ${o.correct === false ? '✗' : o.correct ? '✓' : '·'} ${o.pick}`);
  };
  let error = null;
  try {
    await scene.run(human, page, note);
  } catch (e) {
    error = e.message.split('\n')[0];
    log(`  ✗ ${scene.id} : ${error}`);
  }
  try {
    await goHome(human, page);
  } catch (e) {
    log(`  ✗ retour au menu : ${e.message.split('\n')[0]}`);
  }
  const to = rec.at();
  marks.push({ id: scene.id, title: scene.title, from: +from.toFixed(3), to: +to.toFixed(3), error, notes });
  log(`  ${error ? '✗' : '✓'} ${scene.id} — ${(to - from).toFixed(1)} s`);
}

await human.pause(1400); // et une sortie, pour la même raison

const stats = await rec.stop();
await browser.close();
await closeServer();

const manifest = {
  generatedAt: new Date().toISOString(),
  device: DEVICE,
  size: device.out,
  fps: FPS,
  seed: SEED,
  tempo: TEMPO,
  locale: LOCALE,
  video: 'tour.mp4',
  duration: +stats.seconds.toFixed(3),
  capturedFrames: stats.received,
  scenes: marks,
  pageErrors: [...new Set(errors)].slice(0, 20),
};
writeFileSync(join(outDir, 'tour.json'), JSON.stringify(manifest, null, 2));

const failed = marks.filter((m) => m.error);
log('');
log(`✓ ${video}`);
log(`  ${stats.seconds.toFixed(1)} s · ${stats.emitted} images encodées · ${stats.received} images capturées`);
log(`  ${marks.length - failed.length}/${marks.length} scènes réussies`);
for (const f of failed) log(`  ✗ ${f.id} : ${f.error}`);
if (manifest.pageErrors.length) log(`  ⚠ erreurs page : ${manifest.pageErrors.length}`);

// Une prise dont la moitié des scènes a échoué n'est pas une prise : on le dit
// au shell pour qu'un enchaînement automatique s'arrête là.
process.exit(failed.length > marks.length / 2 ? 1 : 0);
