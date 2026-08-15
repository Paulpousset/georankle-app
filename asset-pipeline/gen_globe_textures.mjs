// Génère les textures équirectangulaires CARTOON des styles de globe
// (continents de world_polygons.json, halo côtier blanc + contour foncé épais,
// même DA que les globes three.js in-app) → textures_globe/<style>.png 2048×1024.
// Consommées par le rig Blender (matériaux toon des cosmétiques `globe_*`).
//   cd asset-pipeline && node gen_globe_textures.mjs [style ...]
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const W = 2048, H = 1024;
const POLYS = JSON.parse(readFileSync(join(here, '..', 'assets', 'world_polygons.json'), 'utf8'));

const CITY_LIGHTS = [
  [2, 48], [-0.1, 51], [13, 52], [12, 41], [37, 55], [28, -26], [18, -33],
  [31, 30], [55, 25], [77, 28], [116, 39], [121, 31], [139, 35], [103, 1],
  [151, -33], [-58, -34], [-46, -23], [-99, 19], [-118, 34],
];

const POLITICAL = ['#e8a87c', '#c38d9e', '#85a392', '#e8c468', '#8aa6c1',
  '#d98c8c', '#9ec7a0', '#c9a06a', '#b0a4c9', '#7fb3b0'];

// Palettes cartoon par style (sous-ensemble étendu au fil des sessions rig).
const STYLES = {
  classic:  { ocean: ['#63bcf2', '#1d6fc0'], land: '#7cc45e', halo: 'rgba(255,255,255,0.65)', line: '#2e5b33', grat: 'rgba(255,255,255,0.20)' },
  satellite:{ ocean: ['#3f96d8', '#0e4e92'], land: '#4e9e4a', halo: 'rgba(255,255,255,0.5)', line: '#1e4a24', grat: 'rgba(255,255,255,0.14)' },
  gaia:     { ocean: ['#4fd8c4', '#0f7a6e'], land: '#5ecf58', halo: 'rgba(220,255,240,0.6)', line: '#1c6a30', grat: 'rgba(255,255,255,0.16)' },
  pastel:   { ocean: ['#cfe8e4', '#93bfd0'], land: '#f2c6d0', halo: 'rgba(255,255,255,0.8)', line: '#c98aa0', grat: 'rgba(255,255,255,0.3)' },
  political:{ ocean: ['#bfe0f2', '#84b4d8'], land: null, halo: 'rgba(255,255,255,0.7)', line: '#ffffff', grat: 'rgba(255,255,255,0.25)', political: true },
  vintage:  { ocean: ['#efdcb2', '#c8a76e'], land: '#c9ab6e', halo: 'rgba(255,246,220,0.55)', line: '#6f5226', grat: 'rgba(111,82,38,0.35)' },
  gold:     { ocean: ['#ffe08a', '#c8871e'], land: '#e0b23e', halo: 'rgba(255,246,200,0.7)', line: '#7a5212', grat: 'rgba(122,82,18,0.3)' },
  night:    { ocean: ['#152a52', '#070f24'], land: '#1d3a5f', halo: 'rgba(122,160,196,0.35)', line: '#5d86ac', grat: 'rgba(122,160,196,0.15)', cities: true },
  ice:      { ocean: ['#bfe6f7', '#6aa8d0'], land: '#f4fafd', halo: 'rgba(255,255,255,0.9)', line: '#9cc2d8', grat: 'rgba(255,255,255,0.3)' },
  mars:     { ocean: ['#e8935a', '#8a3c16'], land: null, halo: null, line: null, grat: 'rgba(110,47,20,0.35)', craters: true },
  lava:     { ocean: ['#3a1410', '#140404'], land: '#241009', halo: 'rgba(255,106,42,0.35)', line: '#ff7a2e', grat: 'rgba(58,20,16,0.6)', cracks: '#ff8a3a' },
  blueprint:{ ocean: ['#1d4d8f', '#0e2c58'], land: null, halo: null, line: '#dce9fa', grat: 'rgba(220,233,250,0.5)', dash: true },
  cyber:    { ocean: ['#0a1420', '#03070f'], land: null, halo: 'rgba(192,77,240,0.3)', line: '#c04df0', grat: 'rgba(58,240,160,0.35)', nodes: '#3af0a0' },
  hologram: { ocean: ['#0c2c3c', '#03121c'], land: null, halo: 'rgba(95,240,255,0.3)', line: '#5ff0ff', grat: 'rgba(95,240,255,0.4)' },
  biolum:   { ocean: ['#04141c', '#01060a'], land: '#083024', halo: 'rgba(47,240,192,0.35)', line: '#2ff0c0', grat: 'rgba(47,240,192,0.2)', plankton: '#2ff0c0' },
  eclipse:  { ocean: ['#0c0c14', '#020203'], land: '#0c0c12', halo: 'rgba(255,224,170,0.18)', line: '#26263a', grat: 'rgba(26,26,38,0.6)' },
  relief:   { ocean: ['#6ec0e0', '#1d5a8a'], land: '#c2a368', halo: 'rgba(255,255,255,0.55)', line: '#7a5a2a', grat: 'rgba(255,255,255,0.18)' },
  st_fractured: { ocean: ['#2c4a74', '#0a1226'], land: '#1c3050', halo: 'rgba(255,122,58,0.3)', line: '#ff8a3a', grat: 'rgba(40,60,96,0.5)', cracks: '#ff8a3a' },
  st_galaxy:    { ocean: ['#2a1e5e', '#08051c'], land: null, halo: 'rgba(184,160,255,0.35)', line: '#b8a0ff', grat: 'rgba(184,160,255,0.3)', plankton: '#d8c8ff' },
  st_crowned:   { ocean: ['#ffe08a', '#c8871e'], land: '#e0b23e', halo: 'rgba(255,246,200,0.7)', line: '#7a5212', grat: 'rgba(122,82,18,0.3)', sparkle: true },
};

function rngFactory(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const px = (lon) => ((lon + 180) / 360) * W;
const py = (lat) => ((90 - lat) / 180) * H;

function unwrap(ring) {
  const out = []; let prev = null;
  for (const [lon, lat] of ring) {
    let l = lon;
    if (prev !== null) { while (l - prev > 180) l -= 360; while (prev - l > 180) l += 360; }
    out.push([l, lat]); prev = l;
  }
  return out;
}

function ringPath(ring, off) {
  return unwrap(ring)
    .map(([lon, lat], i) => `${i ? 'L' : 'M'}${(px(lon) + off).toFixed(1)},${py(lat).toFixed(1)}`)
    .join('') + 'Z';
}

function landPaths(cb) {
  const parts = [];
  for (const off of [-W, 0, W]) {
    for (let i = 0; i < POLYS.length; i++) {
      const d = POLYS[i].r.map((ring) => ringPath(ring, off)).join('');
      parts.push(cb(d, i));
    }
  }
  return parts.join('\n');
}

function buildSvg(name, st) {
  const rnd = rngFactory(424242);
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`];
  svg.push(`<defs><linearGradient id="oc" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${st.ocean[0]}"/><stop offset="1" stop-color="${st.ocean[1]}"/></linearGradient></defs>`);
  svg.push(`<rect width="${W}" height="${H}" fill="url(#oc)"/>`);
  for (let la = -60; la <= 60; la += 30)
    svg.push(`<line x1="0" y1="${py(la)}" x2="${W}" y2="${py(la)}" stroke="${st.grat}" stroke-width="2"/>`);
  for (let lo = -150; lo <= 180; lo += 30)
    svg.push(`<line x1="${px(lo)}" y1="${H * 0.03}" x2="${px(lo)}" y2="${H * 0.97}" stroke="${st.grat}" stroke-width="2"/>`);
  if (st.craters) {
    for (let i = 0; i < 90; i++) {
      const x = rnd() * W, y = H * 0.08 + rnd() * H * 0.84, r = 6 + rnd() * 40;
      svg.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="rgba(0,0,0,0.20)" stroke="rgba(255,190,140,0.4)" stroke-width="3"/>`);
    }
    svg.push(`<ellipse cx="${W / 2}" cy="${H * 0.04}" rx="${W * 0.3}" ry="${H * 0.07}" fill="rgba(255,246,238,0.9)"/>`);
  } else {
    if (st.halo) svg.push(landPaths((d) => `<path d="${d}" fill="none" stroke="${st.halo}" stroke-width="11" stroke-linejoin="round"/>`));
    svg.push(landPaths((d, i) => {
      const fill = st.political ? POLITICAL[i % POLITICAL.length] : (st.land ?? 'none');
      const dash = st.dash ? ' stroke-dasharray="10,8"' : '';
      return `<path d="${d}" fill="${fill}" stroke="${st.line ?? 'none'}" stroke-width="3.5" stroke-linejoin="round"${dash}/>`;
    }));
  }
  if (st.cities) for (const [lon, lat] of CITY_LIGHTS) {
    svg.push(`<circle cx="${px(lon)}" cy="${py(lat)}" r="7" fill="#ffd89a" opacity="0.95"/>
      <circle cx="${px(lon)}" cy="${py(lat)}" r="14" fill="#ffca7a" opacity="0.30"/>`);
  }
  if (st.cracks) {
    // Fissures CLIPPÉES À LA TERRE : des cracks dans la croûte, jamais en mer
    // (les polylignes libres traversaient les archipels comme des « traits »
    // reliant les îles). Tracé nerveux en petits segments, double passe.
    svg.push(`<defs><clipPath id="landclip">${landPaths((d) => `<path d="${d}"/>`)}</clipPath></defs>`);
    svg.push(`<g clip-path="url(#landclip)">`);
    for (let k = 0; k < 60; k++) {
      let x = rnd() * W, y = H * 0.06 + rnd() * H * 0.88;
      let heading = rnd() * Math.PI * 2;
      let d = `M${x.toFixed(0)},${y.toFixed(0)}`;
      for (let s2 = 0; s2 < 7; s2++) {
        heading += (rnd() - 0.5) * 1.7;
        x += Math.cos(heading) * (14 + rnd() * 26);
        y += Math.sin(heading) * (10 + rnd() * 18);
        d += `L${x.toFixed(0)},${y.toFixed(0)}`;
      }
      svg.push(`<path d="${d}" fill="none" stroke="#3a120a" stroke-width="6" opacity="0.55" stroke-linejoin="round"/>`);
      svg.push(`<path d="${d}" fill="none" stroke="${st.cracks}" stroke-width="3" opacity="0.95" stroke-linejoin="round"/>`);
    }
    svg.push('</g>');
  }
  if (st.plankton) for (let k = 0; k < 260; k++)
    svg.push(`<circle cx="${rnd() * W}" cy="${rnd() * H}" r="${1.5 + rnd() * 3}" fill="${st.plankton}" opacity="${0.25 + rnd() * 0.5}"/>`);
  if (st.nodes) for (let k = 0; k < 120; k++)
    svg.push(`<circle cx="${rnd() * W}" cy="${rnd() * H}" r="4" fill="${st.nodes}" opacity="${0.4 + rnd() * 0.5}"/>`);
  if (st.sparkle) for (let k = 0; k < 60; k++) {
    const x = rnd() * W, y = rnd() * H, r = 4 + rnd() * 7;
    svg.push(`<path d="M${x - r},${y}H${x + r}M${x},${y - r}V${y + r}" stroke="rgba(255,244,200,0.9)" stroke-width="2.5"/>`);
  }
  svg.push('</svg>');
  return svg.join('\n');
}

const outDir = join(here, 'textures_globe');
mkdirSync(outDir, { recursive: true });
const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(STYLES);
for (const name of names) {
  const st = STYLES[name];
  if (!st) { console.error(`style inconnu: ${name}`); continue; }
  const svg = buildSvg(name, st);
  const out = join(outDir, `${name}.png`);
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log(`${name}.png OK`);
}
writeFileSync(join(outDir, 'STYLES.md'), `Styles générés: ${Object.keys(STYLES).join(', ')}\n`);
