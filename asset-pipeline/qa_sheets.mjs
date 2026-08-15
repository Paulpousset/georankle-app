// Planches contact QA — composite les couches comme WorldAvatar3D :
// cosmos -> orbit_back -> globe -> emblem -> orbit_front -> satellite.
import { readdirSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';

const OUT = '/Users/paulpousset/rankle/georankle-app/asset-pipeline/out';
const DEST = process.argv[2] || '/tmp/qa';
const CELL = 200;

const files = new Set(readdirSync(OUT));
const p = (f) => join(OUT, f);

async function cell(layers, label) {
  // layers: [{file, cover?}] empilés dans l'ordre
  let img = sharp({ create: { width: 512, height: 512, channels: 4, background: '#101828' } });
  const comps = [];
  for (const l of layers) {
    if (!files.has(l.file)) continue;
    let buf;
    if (l.resize) {
      buf = await sharp(p(l.file)).resize(l.resize, l.resize).toBuffer();
      comps.push({ input: buf, left: l.left ?? 40, top: l.top ?? 40 });
    } else {
      buf = await sharp(p(l.file)).resize(512, 512).toBuffer();
      comps.push({ input: buf, left: 0, top: 0 });
    }
  }
  const base = await img.composite(comps).png().toBuffer();
  const small = await sharp(base).resize(CELL, CELL).toBuffer();
  const withLabel = await sharp(small)
    .composite([{
      input: Buffer.from(
        `<svg width="${CELL}" height="24"><rect width="${CELL}" height="24" fill="#000a"/><text x="6" y="17" font-family="Helvetica" font-size="13" fill="#fff">${label}</text></svg>`),
      left: 0, top: CELL - 24,
    }]).png().toBuffer();
  return withLabel;
}

async function sheet(name, cells, cols = 5) {
  const rows = Math.ceil(cells.length / cols);
  const comps = cells.map((buf, i) => ({
    input: buf, left: (i % cols) * CELL, top: Math.floor(i / cols) * CELL,
  }));
  await sharp({ create: { width: cols * CELL, height: rows * CELL, channels: 4, background: '#1a2030' } })
    .composite(comps).png().toFile(join(DEST, name));
  console.log('sheet', name);
}

const globes = [...files].filter(f => f.startsWith('globe_') && f.endsWith('.png')).sort();
const orbits = [...new Set([...files].filter(f => f.startsWith('orbit_')).map(f => f.replace(/_(back|front)\.png$/, '')))].sort();
const emblems = [...files].filter(f => f.startsWith('emblem_') && !f.includes('_sprite') && f.endsWith('.png')).sort();
const sprites = [...files].filter(f => f.includes('_sprite')).sort();
const sats = [...files].filter(f => f.startsWith('sat_')).sort();
const cosmos = [...files].filter(f => f.startsWith('cosmos_')).sort();

const G = 'globe_classic.png';
const BG = 'cosmos_starfield.png';

const globeCells = [];
for (const g of globes) globeCells.push(await cell([{ file: BG }, { file: g }], g.replace('.png', '')));
await sheet('sheet_globes.png', globeCells);

const orbitCells = [];
for (const o of orbits) {
  orbitCells.push(await cell(
    [{ file: BG }, { file: `${o}_back.png` }, { file: G }, { file: `${o}_front.png` }],
    o));
}
await sheet('sheet_orbits.png', orbitCells);

const emblemCells = [];
for (const e of emblems) emblemCells.push(await cell([{ file: BG }, { file: G }, { file: e }], e.replace('.png', '')));
await sheet('sheet_emblems.png', emblemCells);

const spriteCells = [];
for (const s of sprites) spriteCells.push(await cell([{ file: s }], s.replace('.png', '')));
await sheet('sheet_sprites.png', spriteCells);

const satCells = [];
for (const s of sats) satCells.push(await cell([{ file: BG }, { file: G }, { file: s, resize: 150, left: 30, top: 30 }], s.replace('.png', '')));
await sheet('sheet_sats.png', satCells);

const cosmosCells = [];
for (const cfile of cosmos) cosmosCells.push(await cell([{ file: cfile }], cfile.replace('.png', '')));
await sheet('sheet_cosmos.png', cosmosCells);

// quelques avatars complets variés
const combos = [
  ['cosmos_nebula.png', 'orbit_saturn', 'globe_gaia.png', 'emblem_eiffel.png', 'sat_rocket.png'],
  ['cosmos_aurora.png', 'orbit_fire', 'globe_night.png', 'emblem_taj.png', 'sat_ufo.png'],
  ['cosmos_milkyway.png', 'orbit_st_laurel', 'globe_gold.png', 'emblem_st_star.png', 'sat_st_comet.png'],
  ['cosmos_sunrise.png', 'orbit_rainbow', 'globe_ice.png', 'emblem_fuji.png', 'sat_balloon.png'],
  ['cosmos_blackhole.png', 'orbit_neon', 'globe_cyber.png', 'emblem_moai.png', 'sat_satellite.png'],
  ['cosmos_starfield.png', 'orbit_compass', 'globe_st_crowned.png', 'emblem_liberty.png', 'sat_plane.png'],
];
const comboCells = [];
for (const [cos, orb, glo, emb, sat] of combos) {
  comboCells.push(await cell([
    { file: cos }, { file: `${orb}_back.png` }, { file: glo }, { file: emb },
    { file: `${orb}_front.png` }, { file: sat, resize: 140, left: 38, top: 28 },
  ], `${glo.replace('globe_', '').replace('.png', '')}+${orb.replace('orbit_', '')}`));
}
await sheet('sheet_combos.png', comboCells, 3);
console.log('done');
