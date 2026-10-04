// Rend chaque fiche de ../out/episodes en MP4 1080×1920 dans ../out/final,
// avec à côté le texte de la publication (<nom>.txt) à coller sous la vidéo.
//
//   node render.mjs                    # toutes les fiches
//   node render.mjs higher-lower-en-v1 # une seule
//
// CHROME_PATH force le navigateur (sinon Remotion télécharge le sien).
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, '..', 'out', 'raw');
const EPISODES = join(HERE, '..', 'out', 'episodes');
const FINAL = join(HERE, '..', 'out', 'final');
const PUBLIC = join(HERE, 'public');
mkdirSync(FINAL, { recursive: true });
mkdirSync(PUBLIC, { recursive: true });

const only = process.argv[2];
const names = readdirSync(EPISODES)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .filter((n) => !only || n === only)
  .sort();
if (!names.length) {
  console.error(`Aucune fiche dans ${EPISODES} : lance d'abord « node plan.mjs ».`);
  process.exit(1);
}

copyFileSync(join(HERE, '..', '..', 'assets', 'icon.png'), join(PUBLIC, 'icon.png'));
for (const n of names) {
  const { clip } = JSON.parse(readFileSync(join(EPISODES, `${n}.json`), 'utf8'));
  if (!existsSync(join(PUBLIC, clip))) copyFileSync(join(RAW, clip), join(PUBLIC, clip));
}

// Le bundle est fait APRÈS la copie : Remotion fige le contenu de public/.
const serveUrl = await bundle({ entryPoint: join(HERE, 'src', 'index.ts') });
const browserExecutable = process.env.CHROME_PATH || null;

for (const n of names) {
  const { post, ...props } = JSON.parse(readFileSync(join(EPISODES, `${n}.json`), 'utf8'));
  const composition = await selectComposition({ serveUrl, id: 'Short', inputProps: props, browserExecutable });
  const out = join(FINAL, `${n}.mp4`);
  console.log(`▶ ${n} (${(composition.durationInFrames / composition.fps).toFixed(1)} s)`);
  await renderMedia({
    serveUrl,
    composition,
    inputProps: props,
    codec: 'h264',
    // Recommandé par TikTok / Instagram pour l'import : H.264, yuv420p, ~30 i/s.
    pixelFormat: 'yuv420p',
    crf: 18,
    outputLocation: out,
    browserExecutable,
  });
  if (post) writeFileSync(join(FINAL, `${n}.txt`), `${post}\n`);
  console.log(`✓ ${out}`);
}
