/* global fetch */
/**
 * build_region_data.mjs — generates the sub-national polygon data for the
 * "Régions Géo" game mode (src/screens/FindRegionGame.tsx).
 *
 * Dev/build-time only — NOT shipped in the app. Run with:  node scripts/build_region_data.mjs
 *
 * Sources (licences compatible with a commercial app):
 *  - Natural Earth 10m admin-1 states/provinces (public domain / CC0) → every
 *    launch-set country's first-order divisions, EXCEPT France.
 *  - france-geojson (ODbL, attribution) → France régions (13) + départements (96),
 *    because NE's France admin-1 is actually départements with name typos.
 *
 * Output (committed):
 *  - assets/regions/<CCA3>.json              one country's regions  ({id,name,name_en,lat,lng,r})
 *  - assets/regions/<CCA3>-departments.json  France départements (admin-2)
 *  - assets/regions/manifest.json            the picker's source of truth
 *  - assets/regions/index.ts                 static require() barrel for Metro bundling
 *
 * Geometry format matches assets/world_polygons.json exactly: `r` is an array of
 * rings, each ring an array of [lng,lat] rounded to 2 decimals. Holes are dropped
 * (the canvas hit-test treats every ring as a positive fill, not even-odd).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(__dirname, '.regioncache');
const OUT = path.join(ROOT, 'assets', 'regions');

// ── Sources ──────────────────────────────────────────────────────────────────
const SOURCES = {
  ne: {
    file: 'ne_10m_admin1.geojson',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson',
  },
  frRegions: {
    file: 'fr_regions.geojson',
    url: 'https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions-version-simplifiee.geojson',
  },
  frDepartements: {
    file: 'fr_departements.geojson',
    url: 'https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-version-simplifiee.geojson',
  },
};

// Launch set: countries pulled from Natural Earth admin-1 (adm0_a3 === cca3).
// France is handled separately from france-geojson and is NOT in this list.
const LAUNCH_SET = [
  'USA', 'CAN', 'MEX', 'BRA', 'ARG', 'CHL', 'COL', // Americas
  'DEU', 'ESP', 'ITA', 'CHE', 'BEL', 'NLD', 'AUT', 'POL', 'PRT', 'SWE', 'NOR', 'GRC', // Europe
  'AUS', 'IND', 'JPN', 'CHN', 'IDN', 'TUR', 'RUS', // Asia/Oceania
  'ZAF', 'NGA', 'EGY', 'MAR', // Africa
];

// Simplification: Douglas-Peucker epsilon in degrees, then round to 2 decimals.
const EPS = 0.032;
const MIN_RING_PTS = 4;        // discard rings that collapse below this
const MIN_RING_AREA = 0.0025;  // deg² — drop tiny islands, but always keep a region's largest ring

// ── Geometry helpers ─────────────────────────────────────────────────────────
function round2(n) { return Math.round(n * 100) / 100; }

/** Perpendicular distance from point p to segment a-b (lng/lat plane). */
function perpDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas-Peucker on an open polyline. */
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps) {
    const left = rdp(pts.slice(0, idx + 1), eps);
    const right = rdp(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [pts[0], pts[pts.length - 1]];
}

/** Shoelace area (absolute, deg²). */
function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a / 2);
}

/** Simplify one closed ring → rounded, deduped, closed; null if it collapses. */
function simplifyRing(ring) {
  // ring is closed (first==last); simplify the open form then re-close
  const open = ring.slice(0, -1);
  let s = rdp(open, EPS).map((p) => [round2(p[0]), round2(p[1])]);
  // dedupe consecutive
  const out = [];
  for (const p of s) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  if (out.length < MIN_RING_PTS) return null;
  out.push([out[0][0], out[0][1]]); // close
  return out;
}

/** GeoJSON geometry → array of exterior rings (drops holes). */
function exteriorRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates[0]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((poly) => poly[0]);
  return [];
}

/** Build the simplified `r` (rings array) for a feature, keeping the largest ring. */
function buildRings(geometry) {
  const raw = exteriorRings(geometry);
  const simplified = [];
  for (const ring of raw) {
    const s = simplifyRing(ring);
    if (s) simplified.push({ ring: s, area: ringArea(s) });
  }
  if (simplified.length === 0) return null;
  simplified.sort((a, b) => b.area - a.area);
  const largest = simplified[0];
  const kept = simplified.filter((r, i) => i === 0 || r.area >= MIN_RING_AREA);
  return { rings: kept.map((k) => k.ring), labelRing: largest.ring };
}

/** Area-weighted centroid of a ring (label point); falls back to bbox center. */
function ringCentroid(ring) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    cx += (ring[j][0] + ring[i][0]) * cross;
    cy += (ring[j][1] + ring[i][1]) * cross;
    a += cross;
  }
  if (Math.abs(a) < 1e-9) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const p of ring) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
    return [round2((minx + maxx) / 2), round2((miny + maxy) / 2)];
  }
  a *= 0.5;
  return [round2(cx / (6 * a)), round2(cy / (6 * a))];
}

function pointInRing(lx, ly, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > ly) !== (yj > ly)) && lx < ((xj - xi) * (ly - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A point guaranteed inside the ring: centroid if it lands inside, else a scanline midpoint. */
function interiorPoint(ring) {
  const c = ringCentroid(ring);
  if (pointInRing(c[0], c[1], ring)) return c;
  const y = c[1];
  const xs = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][1], yj = ring[j][1];
    if ((yi > y) !== (yj > y)) {
      xs.push(ring[i][0] + ((y - yi) / (yj - yi)) * (ring[j][0] - ring[i][0]));
    }
  }
  xs.sort((a, b) => a - b);
  let best = c[0], bestW = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const w = xs[i + 1] - xs[i];
    if (w > bestW) { bestW = w; best = (xs[i] + xs[i + 1]) / 2; }
  }
  return [round2(best), round2(y)];
}

function slug(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ── Source loading ───────────────────────────────────────────────────────────
async function ensureSource(src) {
  const p = path.join(CACHE, src.file);
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  console.log(`  downloading ${src.file} …`);
  fs.mkdirSync(CACHE, { recursive: true });
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`download failed ${src.url}: ${res.status}`);
  const text = await res.text();
  fs.writeFileSync(p, text);
  return JSON.parse(text);
}

// ── Region builders ──────────────────────────────────────────────────────────
function makeRegion(id, name, name_en, geometry, labelPt) {
  const built = buildRings(geometry);
  if (!built) return null;
  let pt = labelPt && Number.isFinite(labelPt[0]) && Number.isFinite(labelPt[1])
    ? [round2(labelPt[0]), round2(labelPt[1])]
    : ringCentroid(built.labelRing);
  // Guarantee the label point sits inside the shape (drives recenter + small-region tap fallback).
  if (!built.rings.some((ring) => pointInRing(pt[0], pt[1], ring))) {
    pt = interiorPoint(built.labelRing);
  }
  return { id, name, name_en, lat: pt[1], lng: pt[0], r: built.rings };
}

function dedupeIds(regions) {
  const seen = new Map();
  for (const r of regions) {
    const n = seen.get(r.id) || 0;
    if (n > 0) r.id = `${r.id}-${n}`;
    seen.set(r.id, n + 1);
  }
  return regions;
}

function buildFromNE(ne, cca3, stats) {
  const feats = ne.features.filter((f) => f.properties.adm0_a3 === cca3);
  if (feats.length === 0) return null;
  const regions = [];
  const types = {};
  for (const f of feats) {
    const p = f.properties;
    const name = p.name_fr || p.name || p.name_en;
    const name_en = p.name_en || p.name || name;
    if (!name) continue;
    const iso = (p.iso_3166_2 || '').trim();
    const id = iso || `${cca3}-${slug(name_en)}`;
    const labelPt = Number.isFinite(p.longitude) && Number.isFinite(p.latitude)
      ? [p.longitude, p.latitude] : null;
    const reg = makeRegion(id, name, name_en, f.geometry, labelPt);
    if (!reg) continue;
    regions.push(reg);
    if (p.type_en) types[p.type_en] = (types[p.type_en] || 0) + 1;
  }
  if (regions.length < 2) return null;
  regions.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  dedupeIds(regions);
  const unit = Object.entries(types).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const meta = stats.find((s) => s.cca3 === cca3);
  return {
    country: cca3,
    level: 'regions',
    name: meta?.name || cca3,
    name_en: meta?.name_en || meta?.name || cca3,
    unit,
    regions,
  };
}

function buildFromFrance(gj, level, idPrefix, stats) {
  const regions = [];
  for (const f of gj.features) {
    const nom = f.properties.nom;
    const code = f.properties.code;
    if (!nom) continue;
    const reg = makeRegion(`${idPrefix}${code}`, nom, nom, f.geometry, null);
    if (reg) regions.push(reg);
  }
  regions.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const meta = stats.find((s) => s.cca3 === 'FRA');
  return {
    country: 'FRA',
    level,
    name: meta?.name || 'France',
    name_en: meta?.name_en || 'France',
    unit: level === 'departments' ? 'Department' : 'Region',
    regions,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Loading sources…');
  const ne = await ensureSource(SOURCES.ne);
  const frReg = await ensureSource(SOURCES.frRegions);
  const frDep = await ensureSource(SOURCES.frDepartements);
  const stats = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'countries_stats.json'), 'utf8'));

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const manifest = [];
  const barrel = []; // { key, file }
  let totalBytes = 0;

  function emit(key, file, data, levelsAcc) {
    const json = JSON.stringify(data);
    fs.writeFileSync(path.join(OUT, file), json);
    totalBytes += json.length;
    barrel.push({ key, file });
    levelsAcc.push({ key: data.level, count: data.regions.length });
    console.log(`  ${file.padEnd(26)} ${String(data.regions.length).padStart(3)} regions  ${(json.length / 1024).toFixed(0)} KB`);
  }

  // France — two levels from france-geojson
  {
    const levels = [];
    const reg = buildFromFrance(frReg, 'regions', 'FR-R-', stats);
    emit('FRA', 'FRA.json', reg, levels);
    const dep = buildFromFrance(frDep, 'departments', 'FR-D-', stats);
    emit('FRA-departments', 'FRA-departments.json', dep, levels);
    manifest.push({ cca3: 'FRA', name: reg.name, name_en: reg.name_en, levels });
  }

  // Other countries — single admin-1 level from Natural Earth
  const missing = [];
  for (const cca3 of LAUNCH_SET) {
    const data = buildFromNE(ne, cca3, stats);
    if (!data) { missing.push(cca3); continue; }
    const levels = [];
    emit(cca3, `${cca3}.json`, data, levels);
    manifest.push({ cca3, name: data.name, name_en: data.name_en, unit: data.unit, levels });
  }

  manifest.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Static barrel for Metro bundling
  barrel.sort((a, b) => a.key.localeCompare(b.key));
  const imports = barrel.map((b, i) => `import r${i} from './${b.file}';`).join('\n');
  const entries = barrel.map((b, i) => `  '${b.key}': r${i} as unknown as RegionFile,`).join('\n');
  const indexTs = `/* AUTO-GENERATED by scripts/build_region_data.mjs — do not edit. */
import manifest from './manifest.json';

export interface Region { id: string; name: string; name_en: string; lat: number; lng: number; r: number[][][]; }
export interface RegionFile { country: string; level: string; name: string; name_en: string; unit?: string | null; regions: Region[]; }
export interface RegionLevel { key: string; count: number; }
export interface RegionCountry { cca3: string; name: string; name_en: string; unit?: string | null; levels: RegionLevel[]; }

${imports}

export const REGION_MANIFEST = manifest as unknown as RegionCountry[];

export const BUNDLED_REGIONS: Record<string, RegionFile> = {
${entries}
};

/** Resolve a country+level to its bundled region file (null if absent). */
export function getRegionFile(cca3: string, level: string): RegionFile | null {
  const key = level === 'departments' ? \`\${cca3}-departments\` : cca3;
  return BUNDLED_REGIONS[key] ?? null;
}
`;
  fs.writeFileSync(path.join(OUT, 'index.ts'), indexTs);

  console.log(`\nDone. ${manifest.length} countries, ${barrel.length} files, ${(totalBytes / 1024).toFixed(0)} KB total.`);
  if (missing.length) console.log(`Missing from Natural Earth (adm0_a3 mismatch?): ${missing.join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
