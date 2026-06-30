/* global fetch */
/**
 * build_world_polygons.mjs — (re)generates the country border geometry used by
 * the interactive globe (src/screens/FindCountryGame.tsx → assets/world_polygons.json).
 *
 * Dev/build-time only — NOT shipped. Run with:  node scripts/build_world_polygons.mjs
 *
 * Source: Natural Earth 50m admin-0 countries (public domain / CC0) — 50m keeps
 * enough detail for archipelagos (e.g. the Philippines, which was entirely absent
 * from the committed file and rendered as a single dot).
 *
 * Behaviour: MERGE by default — existing entries are kept untouched and only
 * countries missing from the current file are added (low blast radius). A country
 * is only added if it is an actual game country (in game_data.json) AND its border
 * is large enough to be tappable (area ≥ MIN_ADD_AREA); microstates/archipelagos
 * below that stay as dots (the globe's intentional fallback), and non-game
 * territories (Antarctica, disputed areas, …) are never added. Pass `--force` to
 * regenerate every country from scratch (ignores the area/game filters for ids
 * already present).
 *
 * Output format matches the existing file and assets/regions/*: a flat array of
 * `{ id: <cca3>, r: [[ [lng,lat], … ] ] }`, coords rounded to 2 decimals, holes
 * dropped (the canvas hit-test treats every ring as a positive fill).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(__dirname, '.regioncache');
const OUT = path.join(ROOT, 'assets', 'world_polygons.json');
const GAME_DATA = path.join(ROOT, 'assets', 'game_data.json');

// Minimum border footprint (deg²) for a *newly added* country to get a polygon
// instead of staying a dot. PHL ≈ 24, CUB ≈ 9.5, KWT ≈ 1.6, BHS ≈ 1.1 qualify;
// microstates (Malta, Maldives, San Marino, …) fall below and remain dots.
const MIN_ADD_AREA = 1.0;

const SOURCE = {
  file: 'ne_50m_admin_0_countries.geojson',
  url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson',
};

// Same simplification budget as the regions builder.
const EPS = 0.032;
const MIN_RING_PTS = 4;
const MIN_RING_AREA = 0.0025; // deg² — drop tiny islands, always keep the largest ring

// ── Geometry helpers (shared shape with build_region_data.mjs) ────────────────
const round2 = (n) => Math.round(n * 100) / 100;

function perpDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

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

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a / 2);
}

function simplifyRing(ring) {
  const open = ring.slice(0, -1);
  const s = rdp(open, EPS).map((p) => [round2(p[0]), round2(p[1])]);
  const out = [];
  for (const p of s) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  if (out.length < MIN_RING_PTS) return null;
  out.push([out[0][0], out[0][1]]);
  return out;
}

function exteriorRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates[0]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((poly) => poly[0]);
  return [];
}

function buildRings(geometry) {
  const raw = exteriorRings(geometry);
  const simplified = [];
  for (const ring of raw) {
    const s = simplifyRing(ring);
    if (s) simplified.push({ ring: s, area: ringArea(s) });
  }
  if (simplified.length === 0) return null;
  simplified.sort((a, b) => b.area - a.area);
  const kept = simplified.filter((r, i) => i === 0 || r.area >= MIN_RING_AREA);
  const totalArea = simplified.reduce((s, r) => s + r.area, 0);
  return { rings: kept.map((k) => k.ring), totalArea };
}

// ── Source loading ────────────────────────────────────────────────────────────
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

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const force = process.argv.includes('--force');
  const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
  const byId = new Map(existing.map((p) => [p.id, p]));

  const gameSet = new Set(JSON.parse(fs.readFileSync(GAME_DATA, 'utf8')).countries.map((c) => c.cca3));

  const fc = await ensureSource(SOURCE);
  const added = [];
  const regenerated = [];

  for (const feat of fc.features) {
    const props = feat.properties || {};
    const id = props.ADM0_A3 || props.adm0_a3 || props.ISO_A3;
    if (!id || id === '-99' || id.length !== 3) continue;
    const present = byId.has(id);
    if (present && !force) continue;
    // Only ADD real game countries with a tappable footprint; keep microstates as
    // dots. `--force` re-derives an already-present country regardless.
    if (!present && !gameSet.has(id)) continue;

    const built = buildRings(feat.geometry);
    if (!built) continue;
    if (!present && built.totalArea < MIN_ADD_AREA) continue;

    byId.set(id, { id, r: built.rings });
    (present ? regenerated : added).push(id);
  }

  const out = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(OUT, JSON.stringify(out));

  console.log(`world_polygons.json: ${out.length} countries`);
  if (added.length) console.log(`  added (${added.length}): ${added.sort().join(', ')}`);
  if (regenerated.length) console.log(`  regenerated (${regenerated.length})`);
  console.log(`  PHL present: ${byId.has('PHL')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
