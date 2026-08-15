// Télécharge les textures Terre (sources publiques documentées ci-dessous) et
// produit les WebP 2K + 1K attendus par le globe three.js dans assets/textures/.
//   cd asset-pipeline && npm run textures
//
// Sources (ordre d'essai) :
//  - NASA Visible Earth / Earth Observatory : domaine public.
//  - Dépôt three.js (mrdoob/three.js, MIT ; textures dérivées de données NASA).
//  - Solar System Scope (CC BY 4.0 — attribution requise, voir CREDITS ci-dessous).
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'assets', 'textures');
mkdirSync(outDir, { recursive: true });

const TEXTURES = [
  {
    name: 'earth_day',
    credit: 'NASA Blue Marble Next Generation (topographie + bathymétrie)',
    urls: [
      'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg',
      'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73751/world.topo.bathy.200407.3x5400x2700.jpg',
      'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg',
      'https://www.solarsystemscope.com/textures/download/2k_earth_daymap.jpg',
    ],
  },
  {
    name: 'earth_night',
    credit: 'NASA Black Marble 2016',
    urls: [
      'https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg',
      'https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg',
      'https://www.solarsystemscope.com/textures/download/2k_earth_nightmap.jpg',
    ],
  },
  {
    name: 'earth_clouds',
    credit: 'NASA cloud fraction / three.js planets',
    urls: [
      'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_clouds_2048.png',
      'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_clouds_1024.png',
      'https://www.solarsystemscope.com/textures/download/2k_earth_clouds.jpg',
    ],
    maxSize: 1024,
  },
  {
    name: 'earth_bump',
    credit: 'three.js planets (dérivé NASA SRTM)',
    urls: [
      'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_normal_2048.jpg',
      'https://www.solarsystemscope.com/textures/download/2k_earth_normal_map.tif',
    ],
    maxSize: 1024,
    optional: true,
  },
];

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const credits = [];
for (const tex of TEXTURES) {
  let buf = null;
  let used = null;
  for (const url of tex.urls) {
    try {
      process.stdout.write(`${tex.name}: essai ${url} ... `);
      buf = await download(url);
      used = url;
      console.log(`OK (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
      break;
    } catch (e) {
      console.log(`échec (${e.message})`);
    }
  }
  if (!buf) {
    if (tex.optional) {
      console.warn(`${tex.name}: introuvable — ignoré (optionnel).`);
      continue;
    }
    console.error(`${tex.name}: AUCUNE source disponible.`);
    process.exitCode = 1;
    continue;
  }
  const base = sharp(buf, { limitInputPixels: 1e9 });
  const meta = await base.metadata();
  const variants = tex.maxSize
    ? [[Math.min(tex.maxSize, meta.width), `${tex.name}_1k.webp`]]
    : [[2048, `${tex.name}_2k.webp`], [1024, `${tex.name}_1k.webp`]];
  for (const [w, file] of variants) {
    const info = await sharp(buf, { limitInputPixels: 1e9 })
      .resize(w, Math.round(w / 2), { fit: 'fill' })
      .webp({ quality: 80 })
      .toFile(join(outDir, file));
    console.log(`  → ${file} (${(info.size / 1024).toFixed(0)} KB)`);
  }
  credits.push(`- ${tex.name}: ${tex.credit}\n  ${used}`);
}

writeFileSync(
  join(outDir, 'CREDITS.md'),
  `# Textures Terre — sources\n\nGénéré par asset-pipeline/fetch_textures.mjs.\nNASA : domaine public. three.js : MIT. Solar System Scope : CC BY 4.0 (attribution requise).\n\n${credits.join('\n')}\n`,
);
console.log('CREDITS.md écrit.');
