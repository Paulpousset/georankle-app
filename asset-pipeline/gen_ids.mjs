// Exporte le catalogue cosmétique en ids.json pour render_layers.py (Blender
// n'importe pas de TypeScript). Lancer via tsx : cd asset-pipeline && npm run ids
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { ALL_PARTS } from '../src/data/cosmetics';

const here = dirname(fileURLToPath(import.meta.url));

const rows = ALL_PARTS.map((p) => ({
  id: p.id,
  category: p.category,
  style: p.globeStyle ?? p.orbitStyle ?? p.cosmosStyle ?? null,
  exclusive: !!p.exclusive,
  // Les slots "aucun" et le cosmos teintable (procédural en RN) n'ont pas de rendu.
  needsRender: !p.id.endsWith('_none') && p.id !== 'sat_none' && p.id !== 'cosmos_bluenight',
}));

writeFileSync(join(here, 'ids.json'), JSON.stringify(rows, null, 2));
console.log(`ids.json : ${rows.length} items (${rows.filter((r) => r.needsRender).length} à rendre)`);
