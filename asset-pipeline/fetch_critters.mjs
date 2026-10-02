// Downloads the Quaternius CC0 models used by critters.json into critters/glb/.
//   node fetch_critters.mjs
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const BASE = 'https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/';
const PACK = {
  Fox: 'animals_pack', Deer: 'animals_pack', Alpaca: 'animals_pack', Husky: 'animals_pack',
  Wolf: 'animals_pack', Stag: 'animals_pack', Horse: 'animals_pack', Donkey: 'animals_pack', Bull: 'animals_pack',
  Trex: 'dinosaurs_pack', Triceratops: 'dinosaurs_pack', Velociraptor: 'dinosaurs_pack',
  Frog: 'easy_enemies_pack', Snake: 'easy_enemies_pack', Wasp: 'easy_enemies_pack',
  Dolphin: 'fish_pack', Whale: 'fish_pack', Manta_ray: 'fish_pack',
  Koi: 'cute_fish_pack', Clownfish: 'cute_fish_pack', Piranha: 'cute_fish_pack',
  'Astronaut_FinnTheFrog-transformed': 'ultimate_space_pack',
  'Astronaut_BarbaraTheBee-transformed': 'ultimate_space_pack',
  Pancake: 'spaceships_pack',
};
const table = JSON.parse(fs.readFileSync(path.join(HERE, 'critters.json'), 'utf8'));
const models = [...new Set(Object.entries(table).filter(([k]) => !k.startsWith('_')).map(([, v]) => v.model))];
const out = path.join(HERE, 'critters', 'glb');
fs.mkdirSync(out, { recursive: true });
for (const m of models) {
  const dest = path.join(out, `${m}.glb`);
  if (fs.existsSync(dest)) continue;
  const res = await fetch(`${BASE}${PACK[m]}/${m}.glb`);
  if (!res.ok) throw new Error(`${m}: HTTP ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log('fetched', m);
}
