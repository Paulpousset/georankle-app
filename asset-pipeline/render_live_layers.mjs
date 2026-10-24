// Rendu des couches `globe_*` SANS Blender : la scène three.js live
// (buildAvatarHtml — même caméra, mêmes 5 lumières, même shader Cartoon HD
// que le rig, cf. rig.json) est ouverte dans le Chromium de Playwright, le
// globe seul sur fond transparent, rendu à 2× puis réduit (anti-crénelage).
// Sert aux globes ajoutés quand aucun poste Blender n'est dispo : la couche
// reste superposable aux anneaux/emblèmes pré-rendus du pack.
//   cd asset-pipeline && node render_live_layers.mjs --ids globe_jungle,globe_desert [--size 512] [--out ./out]
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { createRequire } from 'module';

import { build } from 'esbuild';

// Playwright n'est pas une dépendance du pipeline : on prend celui installé
// globalement avec son Chromium (require résout aussi NODE_PATH, pas import).
const { chromium } = createRequire(import.meta.url)('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const ids = (opt('--ids', '') || '').split(',').filter(Boolean);
const size = Number(opt('--size', 512));
const outDir = opt('--out', join(here, 'out'));
if (!ids.length) {
  console.error('usage: node render_live_layers.mjs --ids globe_a,globe_b [--size 512] [--out dir]');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

// buildAvatarHtml lit ses tables dans des composants RN (GLOBE_STYLES de
// WorldAvatar…) : on le bundle avec react-native* bouchonnés pour l'exécuter
// sous Node.
const stubRN = {
  name: 'stub-rn',
  setup(b) {
    b.onResolve({ filter: /^(react-native|react-native-svg|expo-.*|@react-native.*)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'const p = new Proxy(function () {}, { get: () => p, apply: () => p }); module.exports = p;',
      loader: 'js',
    }));
  },
};
const entry = `export { buildAvatarHtml } from ${JSON.stringify(join(root, 'src/lib/avatar3d/buildAvatarHtml.ts'))};
export { DEFAULT_AVATAR_CONFIG } from ${JSON.stringify(join(root, 'src/data/cosmetics.ts'))};
export { THREE_SRC } from ${JSON.stringify(join(root, 'src/vendor/threeSource.ts'))};`;
const bundled = await build({
  stdin: { contents: entry, resolveDir: root, loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', write: false, plugins: [stubRN],
  jsx: 'automatic', loader: { '.png': 'empty', '.webp': 'empty', '.glb': 'empty', '.mp3': 'empty' },
  logLevel: 'error',
});
const { buildAvatarHtml, DEFAULT_AVATAR_CONFIG, THREE_SRC } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

const MIME = { webp: 'image/webp', png: 'image/png', glb: 'model/gltf-binary' };
const dataUri = (p) =>
  existsSync(p) ? `data:${MIME[p.split('.').pop()]};base64,${readFileSync(p).toString('base64')}` : null;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: size * 2, height: size * 2 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror', e.message));

for (const id of ids) {
  const style = id.replace(/^globe_/, '');
  const assets = {
    globeTex: dataUri(join(root, 'assets', 'globes', `globe_${style}.webp`)),
    landModel: dataUri(join(root, 'assets', 'models3d', 'globe_land.glb')),
    globePropsModel: dataUri(join(root, 'assets', 'models3d', `globe_${style}_props.glb`)),
  };
  if (!assets.globeTex) { console.error(`${id}: texture assets/globes/globe_${style}.webp absente`); continue; }
  const layers = { ...DEFAULT_AVATAR_CONFIG.layers, globe: { id, tint: null } };
  const html = buildAvatarHtml({ threeSrc: THREE_SRC, config: { v: 4, useCustom: true, layers }, sprites: assets, reduceMotion: true, maxDpr: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  // Textures + GLB arrivent en asynchrone : on attend qu'ils soient posés.
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    /* global scene, rotLon, rotLat, homeLon, homeLat, applyRot */
    window.post = null;           // pas de bloom : jamais cuit dans les couches
    scene.background = null;      // fond transparent
    rotLon = homeLon; rotLat = homeLat; applyRot();
    window.needsRender = true;
  });
  await page.waitForTimeout(400);
  const shot = await page.screenshot({ omitBackground: true });
  const out = join(outDir, `${id}.png`);
  await sharp(shot).resize(size, size, { kernel: 'lanczos3' }).png().toFile(out);
  console.log(`${id}.png OK`);
}
await browser.close();
