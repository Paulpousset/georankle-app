// Contact sheets for the Cartoon HD proof of concept — 5 columns, labelled cells.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from '/Users/paulpousset/rankle/georankle-app/asset-pipeline/node_modules/sharp/lib/index.js';

const DIR = '/private/tmp/claude-501/-Users-paulpousset-rankle/412eda56-a296-4295-89f9-183d89f79900/scratchpad/hifi/c/out';
const CELL = 300, LABEL = 26, COLS = 5;

const SHEETS = {
  planetes: ['globe:classic', 'globe:gold', 'globe:lava', 'globe:ice', 'globe:mars', 'globe:pastel', 'globe:night', 'globe:vintage', 'globe:st_crowned', 'globe:gaia'],
  emblemes: ['emblem:eiffel', 'emblem:liberty', 'emblem:fuji', 'emblem:pyramids', 'emblem:bigben', 'emblem:taj', 'emblem:colosseum', 'emblem:moai', 'emblem:sydney', 'emblem:windmill'],
  satellites: ['sat:moon', 'sat:rocket', 'sat:ufo', 'sat:balloon', 'sat:plane', 'sat:iss', 'sat:st_ship', 'sat:comet', 'sat:bird', 'sat:satellite'],
  orbites: ['orbit:asteroids', 'orbit:saturn', 'orbit:neon', 'orbit:fire', 'orbit:meridian', 'orbit:rainbow', 'orbit:fireflies', 'orbit:ice', 'orbit:compass', 'orbit:double'],
};
const NAMES = {
  classic: 'Terre classique', gold: "Planète d'or", lava: 'Monde de lave', ice: 'Planète glacée', mars: 'Mars', pastel: 'Pastel', night: 'Lumières nocturnes', vintage: 'Carte vintage', st_crowned: 'Monde Couronné', gaia: 'Terre Gaïa',
  eiffel: 'Tour Eiffel', liberty: 'Statue de la Liberté', fuji: 'Mont Fuji', pyramids: 'Pyramides', bigben: 'Big Ben', taj: 'Taj Mahal', colosseum: 'Colisée', moai: 'Moaï', sydney: 'Opéra de Sydney', windmill: 'Moulin',
  moon: 'Lune', rocket: 'Fusée', ufo: 'OVNI', balloon: 'Montgolfière', plane: 'Avion', iss: 'ISS', st_ship: 'Navire', comet: 'Comète', bird: 'Oiseau', satellite: 'Satellite',
  asteroids: 'Astéroïdes', saturn: 'Anneaux de Saturne', neon: 'Anneau néon', fire: 'Anneau de feu', meridian: 'Méridien bronze', rainbow: 'Arc-en-ciel', fireflies: 'Lucioles', compass: 'Rose des vents', double: 'Double orbite',
};

function labelSvg(text) {
  const t = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return Buffer.from(`<svg width="${CELL}" height="${LABEL}"><rect width="100%" height="100%" fill="#0b1020"/><text x="10" y="18" font-family="Menlo, monospace" font-size="12" fill="#c9d4e8">${t}</text></svg>`);
}

for (const [sheet, items] of Object.entries(SHEETS)) {
  const rows = Math.ceil(items.length / COLS);
  const W = COLS * CELL, H = rows * (CELL + LABEL);
  const comps = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const id = it.split(':')[1];
    const file = join(DIR, it.replace(':', '_') + '.png');
    const x = (i % COLS) * CELL, y = Math.floor(i / COLS) * (CELL + LABEL);
    if (existsSync(file)) {
      comps.push({ input: await sharp(file).resize(CELL, CELL).png().toBuffer(), left: x, top: y });
    }
    comps.push({ input: labelSvg(NAMES[id] ?? id), left: x, top: y + CELL });
  }
  const out = join(DIR, `sheet_${sheet}.jpg`);
  await sharp({ create: { width: W, height: H, channels: 3, background: '#0b1020' } })
    .composite(comps).jpeg({ quality: 84 }).toFile(out);
  console.log('sheet', out, W, H);
}
