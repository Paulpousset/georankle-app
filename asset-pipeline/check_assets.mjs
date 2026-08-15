// Garde-fou QA (branché dans scripts/ship.sh) : vérifie la correspondance
// bidirectionnelle ids du catalogue ↔ fichiers assets/cosmetics/*.webp.
// Tant que le pack n'est pas rendu (dossier absent/vide), simple avertissement ;
// dès qu'il existe, toute divergence est bloquante (exit 1).
// Lancer via tsx : cd asset-pipeline && npm run check
import { existsSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { ALL_PARTS } from '../src/data/cosmetics';

const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(here, '..', 'assets', 'cosmetics');

const files = existsSync(assetsDir) ? readdirSync(assetsDir).filter((f) => f.endsWith('.webp')) : [];
if (files.length === 0) {
  console.warn('check_assets: pack cosmétique non rendu (assets/cosmetics vide) — OK, fallback SVG.');
  process.exit(0);
}

const fileSet = new Set(files);
// Slots "aucun" + le seul item teintable (procédural en RN) : pas de rendu attendu.
const needsRender = ALL_PARTS.filter((p) => !p.id.endsWith('_none') && p.id !== 'cosmos_bluenight');

const missing = [];
for (const part of needsRender) {
  const hasMain = fileSet.has(`${part.id}.webp`);
  const hasBack = fileSet.has(`${part.id}_back.webp`);
  const hasFront = fileSet.has(`${part.id}_front.webp`);
  if (!hasMain && !(hasBack && hasFront)) missing.push(part.id);
  if ((hasBack || hasFront) && !(hasBack && hasFront)) missing.push(`${part.id} (paire back/front incomplète)`);
}

const knownNames = new Set(
  needsRender.flatMap((p) => [
    `${p.id}.webp`, `${p.id}_back.webp`, `${p.id}_front.webp`, `${p.id}_sprite.webp`,
  ]),
);
const orphans = files.filter((f) => !knownNames.has(f));

if (missing.length) console.error(`MANQUANTS (${missing.length}) : ${missing.join(', ')}`);
if (orphans.length) console.error(`ORPHELINS (${orphans.length}) : ${orphans.join(', ')}`);
if (missing.length || orphans.length) process.exit(1);
console.log(`check_assets: OK — ${files.length} fichiers couvrent ${needsRender.length} items.`);
