/**
 * build_continent_shapes.mjs — (re)generates the continent silhouettes used by
 * the solo "zone" picker (src/data/continentShapes.gen.ts).
 *
 * Dev/build-time only — NOT shipped. Run with:
 *   node scripts/build_continent_shapes.mjs
 *
 * Source: the game's own assets — `world_polygons.json` for the borders and
 * `countries_stats.json` for each country's continent. Deriving the icons from
 * the same data the game quizzes on means an icon shows exactly the countries
 * you'll be asked about (e.g. Russia sits in Europe here, so the "Asia"
 * silhouette has no Russia — which is correct for this game).
 *
 * Pipeline, per continent:
 *   1. gather every ring of every country in it, in Mercator-ish y so high
 *      latitudes aren't crushed flat;
 *   2. drop far-flung overseas territories (a ring whose centroid sits far from
 *      the continent's median centroid) — otherwise the fit-to-box below
 *      shrinks the mainland to a speck;
 *   3. keep the largest rings only; tiny islands are noise at 22 px;
 *   4. fit into the 24×24 icon box and simplify with Douglas–Peucker.
 *
 * The consumer renders the path with `fill` AND a same-colour `stroke`: the
 * rings are per *country*, so without that hairline the continent shows up as a
 * mosaic of disjoint countries instead of one landmass.
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POLY = JSON.parse(readFileSync(join(ROOT, 'assets/world_polygons.json'), 'utf8'));
const STATS = JSON.parse(readFileSync(join(ROOT, 'assets/countries_stats.json'), 'utf8'));
const REGION = Object.fromEntries(STATS.map((s) => [s.cca3, s.region]));

const CONTINENTS = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];

/** Rings below this many points are coastline noise at icon size. */
const MIN_RING_POINTS = 12;
/** Max distance (in projected degrees) from the continent's median centroid. */
const MAX_CENTROID_DIST = { Oceania: 70, Americas: 90 };
const DEFAULT_CENTROID_DIST = 60;
/** How many of the largest rings to keep. */
const KEEP_RINGS = { Oceania: 6 };
const DEFAULT_KEEP_RINGS = 14;
/** Rings smaller than this fraction of the biggest one are dropped. */
const MIN_AREA_RATIO = 0.012;
/** Douglas–Peucker tolerance, in icon units (the box is 24×24). */
const SIMPLIFY_TOLERANCE = 0.22;
/** Padding inside the 24×24 box. */
const PADDING = 2.2;

const perpDist = (p, a, b) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (!dx && !dy) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  let max = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > max) {
      max = d;
      idx = i;
    }
  }
  if (max <= tol) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)];
}

/** Mercator y, clamped so the poles don't run to infinity. */
const projectY = (lat) => {
  const l = Math.max(-82, Math.min(82, lat));
  return -Math.log(Math.tan(Math.PI / 4 + (l * Math.PI) / 360)) * (180 / Math.PI);
};

const centroid = (r) => {
  let x = 0;
  let y = 0;
  for (const p of r) {
    x += p[0];
    y += p[1];
  }
  return [x / r.length, y / r.length];
};

const ringArea = (r) => {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const j = (i + 1) % r.length;
    a += r[i][0] * r[j][1] - r[j][0] * r[i][1];
  }
  return Math.abs(a / 2);
};

function buildShape(continent) {
  const ids = new Set(
    Object.entries(REGION)
      .filter(([, r]) => r === continent)
      .map(([id]) => id),
  );

  let rings = [];
  for (const country of POLY) {
    if (!ids.has(country.id)) continue;
    for (const ring of country.r) {
      if (ring.length >= MIN_RING_POINTS) rings.push(ring.map(([x, y]) => [x, projectY(y)]));
    }
  }
  if (!rings.length) return null;

  const centroids = rings.map(centroid);
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const mx = median(centroids.map((c) => c[0]));
  const my = median(centroids.map((c) => c[1]));
  const maxDist = MAX_CENTROID_DIST[continent] ?? DEFAULT_CENTROID_DIST;
  rings = rings.filter((_, i) => Math.hypot(centroids[i][0] - mx, centroids[i][1] - my) <= maxDist);

  rings.sort((a, b) => ringArea(b) - ringArea(a));
  const keep = KEEP_RINGS[continent] ?? DEFAULT_KEEP_RINGS;
  const biggest = ringArea(rings[0]);
  rings = rings.slice(0, keep).filter((r) => ringArea(r) >= biggest * MIN_AREA_RATIO);

  const pts = rings.flat();
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const k = (24 - PADDING * 2) / span;
  const ox = (24 - (maxX - minX) * k) / 2;
  const oy = (24 - (maxY - minY) * k) / 2;

  return rings
    .map((r) => {
      const projected = r.map(([x, y]) => [(x - minX) * k + ox, (y - minY) * k + oy]);
      const s = simplify(projected, SIMPLIFY_TOLERANCE);
      if (s.length < 3) return null;
      return `M${s.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}Z`;
    })
    .filter(Boolean)
    .join('');
}

const shapes = {};
for (const c of CONTINENTS) {
  shapes[c] = buildShape(c);
  console.log(`${c.padEnd(9)} ${shapes[c] ? `${shapes[c].length} chars` : 'EMPTY'}`);
}

const out = `/* eslint-disable */
// GENERATED by scripts/build_continent_shapes.mjs — do not edit by hand.
// Régénérer après une mise à jour des frontières :
//   node scripts/build_continent_shapes.mjs
//
// Silhouette de chaque continent, dessinée dans une boîte 24×24, dérivée des
// mêmes frontières que le mode Silhouette. À rendre avec un \`fill\` ET un
// \`stroke\` de la même couleur : les anneaux sont par *pays*, donc sans ce
// filet le continent apparaît en mosaïque au lieu d'une masse continue.

import type { ContinentId } from './continents';

export const CONTINENT_SHAPES: Record<ContinentId, string> = {
${CONTINENTS.map((c) => `  ${c}:\n    '${shapes[c]}',`).join('\n')}
};
`;
writeFileSync(join(ROOT, 'src/data/continentShapes.gen.ts'), out);
console.log('→ src/data/continentShapes.gen.ts');
