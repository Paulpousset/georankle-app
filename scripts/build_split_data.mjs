/**
 * build_split_data.mjs — generates the city data of the « Partage équitable »
 * mode (src/screens/SplitGame.tsx): for every country that has region shapes
 * (assets/regions), its biggest cities with their population.
 *
 * Dev/build-time only — NOT shipped in the app. Run with:  node scripts/build_split_data.mjs
 *
 * Source: Natural Earth 10m populated places (public domain). POP_MAX is the
 * metropolitan population, which is what a player has in mind for « Lyon ».
 *
 * Second source: GeoNames « cities1000 » (CC BY 4.0, geonames.org), every
 * place of 1000 inhabitants or more, as packed by the all-the-cities npm
 * package. It gives the population of the WHOLE area, not just of the big
 * cities: see assets/split_population.json below.
 *
 * Output (committed): assets/split_cities.json
 *   { "<CCA3>": [[name_en, lat, lng, pop, { <lang>: name }?], …], … }
 * sorted by population, biggest first. For countries with regions, only cities inside one of the
 * country's region shapes are kept (drops overseas places such as
 * Fort-de-France, which the map doesn't draw). Localized names are stored only
 * when they differ from the English one. These are the landmarks drawn on
 * the map.
 *
 * Output (committed): assets/split_population.json
 *   { "<CCA3>": [lat×100, lng×100, thousands, …] }  (flat, one triple per cell)
 * The country's population on a grid: every GeoNames place summed into cells
 * of a size that follows the country's extent, at the cell's weighted centre,
 * then scaled so the cells add up to the country's population in the game
 * data (the villages under 1000 and the countryside go with their nearest
 * places). This is what the lines actually split.
 */

import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(__dirname, '.regioncache');
const REGIONS = path.join(ROOT, 'assets', 'regions');
const OUT = path.join(ROOT, 'assets', 'split_cities.json');
const POP_OUT = path.join(ROOT, 'assets', 'split_population.json');

const GEONAMES = {
  file: 'all-the-cities-3.1.0.tgz',
  url: 'https://registry.npmjs.org/all-the-cities/-/all-the-cities-3.1.0.tgz',
};
/**
 * GeoNames feature codes left out: sections of a city (PPLX, already in its
 * city's count), historical, abandoned and destroyed places.
 */
const SKIP_FEATURES = new Set(['PPLX', 'PPLH', 'PPLQ', 'PPLW', 'PPLCH']);

const SOURCE = {
  file: 'ne_10m_populated_places.geojson',
  url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson',
};

/** Cities kept per country — the game shows fewer, after spacing them out. */
const PER_COUNTRY = 24;
/** Cities kept for a country that only shows up on multi-country maps. */
const PER_GROUP_MEMBER = 8;
/** Below this, a place is a town, not a dot worth weighing. */
const MIN_POP = 50_000;
/** Languages Natural Earth names (the app's other ones fall back on English). */
const LANGS = ['fr', 'de', 'es', 'pt', 'it', 'ru', 'tr', 'pl', 'nl', 'id', 'vi', 'uk', 'el'];

/**
 * Natural Earth rows that are wrong: two « Vila Velha » of 1.2 M, one in
 * Amapá at the mouth of the Amazon, the other counting Vitória's whole metro
 * area a second time (Vila Velha is one of its suburbs).
 */
const SKIP = new Set(['BRA:Vila Velha']);

async function source() {
  const file = path.join(CACHE, SOURCE.file);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(CACHE, { recursive: true });
    console.log(`↓ ${SOURCE.url}`);
    const res = await fetch(SOURCE.url);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Even-odd ray cast on one [lng, lat] ring. */
function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside, or within ~10 km of, one of the regions (coastal cities sit on simplified shores). */
function inCountry(lng, lat, regions) {
  for (const reg of regions) for (const ring of reg.r) if (inRing(lng, lat, ring)) return true;
  const near = 0.1;
  for (const reg of regions)
    for (const ring of reg.r)
      for (const [x, y] of ring) if (Math.abs(x - lng) < near && Math.abs(y - lat) < near) return true;
  return false;
}

const round2 = (n) => Math.round(n * 100) / 100;

async function main() {
  const places = (await source()).features.map((f) => f.properties);
  const out = {};
  const row = (p) => {
    const en = p.NAME_EN || p.NAME;
    const names = {};
    for (const l of LANGS) {
      const n = p[`NAME_${l.toUpperCase()}`];
      if (n && n !== en) names[l] = n;
    }
    const r = [en, round2(p.LATITUDE), round2(p.LONGITUDE), p.POP_MAX];
    if (Object.keys(names).length) r.push(names);
    return r;
  };
  const ofCountry = (cca3) =>
    places
      .filter((p) => p.ADM0_A3 === cca3 && p.POP_MAX >= MIN_POP && !SKIP.has(`${cca3}:${p.NAME}`))
      .sort((a, b) => b.POP_MAX - a.POP_MAX)
      // A name twice in one country is a duplicate (a second « Natal » of 1 M
      // in the Amazon): only the bigger one is kept.
      .filter((p, i, all) => all.findIndex((q) => q.NAME === p.NAME) === i);

  // Countries with region shapes: a map of their own, so their full city list.
  const files = fs
    .readdirSync(REGIONS)
    .filter((f) => /^[A-Z]{3}\.json$/.test(f))
    .sort();
  for (const f of files) {
    const cca3 = f.slice(0, 3);
    const { regions } = JSON.parse(fs.readFileSync(path.join(REGIONS, f), 'utf8'));
    const cities = ofCountry(cca3)
      .filter((p) => inCountry(p.LONGITUDE, p.LATITUDE, regions))
      .slice(0, PER_COUNTRY)
      .map(row);
    out[cca3] = cities;
    console.log(`${cca3}: ${cities.length} villes — ${cities.slice(0, 4).map((c) => c[0]).join(', ')}…`);
  }

  // Every other country only appears on multi-country maps (Benelux, a
  // continent…): its few biggest cities are enough, and the map's frame drops
  // the overseas ones.
  const polygons = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'world_polygons.json'), 'utf8'));
  for (const { id } of polygons) {
    if (out[id]) continue;
    const cities = ofCountry(id).slice(0, PER_GROUP_MEMBER).map(row);
    if (cities.length) out[id] = cities;
  }
  console.log(`+ ${Object.keys(out).length - files.length} autres pays (cartes à plusieurs pays)`);
  fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
  console.log(`→ ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
}

/** Reads all-the-cities' cities.pbf (length-prefixed protobuf messages, deltas for coordinates). */
function readGeonames(buf) {
  let pos = 0;
  const varint = () => {
    let v = 0;
    let mul = 1;
    for (;;) {
      const b = buf[pos++];
      v += (b & 0x7f) * mul;
      if (b < 0x80) return v;
      mul *= 128;
    }
  };
  const svarint = () => {
    const v = varint();
    return v % 2 ? -(v + 1) / 2 : v / 2;
  };
  const out = [];
  let lon = 0;
  let lat = 0;
  while (pos < buf.length) {
    const end = varint() + pos;
    const c = { country: '', feature: '', pop: 0, lat: 0, lng: 0 };
    while (pos < end) {
      const key = varint();
      const tag = key >> 3;
      if ((key & 7) === 2) {
        const len = varint();
        const str = buf.toString('utf8', pos, pos + len);
        pos += len;
        if (tag === 3) c.country = str;
        else if (tag === 7) c.feature = str;
      } else if (tag === 1) svarint();
      else if (tag === 9) c.pop = varint();
      else if (tag === 10) lon += svarint();
      else if (tag === 11) lat += svarint();
      else varint();
    }
    c.lng = lon / 1e5;
    c.lat = lat / 1e5;
    out.push(c);
  }
  return out;
}

/** The pbf inside the npm tarball (a gzipped tar: 512-byte headers, then contents). */
async function geonames() {
  const file = path.join(CACHE, GEONAMES.file);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(CACHE, { recursive: true });
    console.log(`↓ ${GEONAMES.url}`);
    const res = await fetch(GEONAMES.url);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const tar = zlib.gunzipSync(fs.readFileSync(file));
  for (let off = 0; off + 512 <= tar.length; ) {
    const name = tar.toString('utf8', off, off + 100).replace(/\0.*$/s, '');
    const size = parseInt(tar.toString('utf8', off + 124, off + 136).replace(/\0.*$/s, '').trim(), 8) || 0;
    if (name.endsWith('cities.pbf')) return readGeonames(tar.subarray(off + 512, off + 512 + size));
    off += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error('cities.pbf introuvable dans le paquet');
}

/** Cell size in degrees: about 30 cells across the country, 0.1° to 1°. */
function cellSize(rings) {
  let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
  for (const ring of rings)
    for (const [lng, lat] of ring) {
      w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat);
    }
  const extent = Math.min(Math.max(e - w, n - s), 60);
  return Math.min(1, Math.max(0.1, extent / 30));
}

async function buildPopulation() {
  const codes = fs.readFileSync(path.join(ROOT, 'src', 'data', 'countryCodes.ts'), 'utf8');
  const toCca3 = new Map([...codes.matchAll(/([A-Z]{3}): '([A-Z]{2})'/g)].map((m) => [m[2], m[1]]));
  const stats = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'countries_stats.json'), 'utf8'));
  const popOf = new Map(stats.map((s) => [s.cca3, s.population]));
  const polygons = new Map(
    JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'world_polygons.json'), 'utf8')).map((p) => [p.id, p.r]),
  );
  const byCountry = new Map();
  for (const c of await geonames()) {
    if (SKIP_FEATURES.has(c.feature) || !c.pop) continue;
    const cca3 = toCca3.get(c.country);
    if (!cca3 || !polygons.has(cca3)) continue;
    if (!byCountry.has(cca3)) byCountry.set(cca3, []);
    byCountry.get(cca3).push(c);
  }
  const out = {};
  let cells = 0;
  for (const [cca3, places] of [...byCountry.entries()].sort()) {
    const size = cellSize(polygons.get(cca3));
    const bins = new Map();
    for (const p of places) {
      const key = `${Math.floor(p.lat / size)}:${Math.floor(p.lng / size)}`;
      const b = bins.get(key) ?? { pop: 0, lat: 0, lng: 0 };
      b.pop += p.pop;
      b.lat += p.lat * p.pop;
      b.lng += p.lng * p.pop;
      bins.set(key, b);
    }
    const sum = [...bins.values()].reduce((s, b) => s + b.pop, 0);
    const scale = (popOf.get(cca3) ?? sum) / sum;
    const flat = [];
    for (const b of bins.values()) {
      const k = Math.round((b.pop * scale) / 1000);
      if (k <= 0) continue;
      flat.push(Math.round((b.lat / b.pop) * 100), Math.round((b.lng / b.pop) * 100), k);
    }
    out[cca3] = flat;
    cells += flat.length / 3;
  }
  fs.writeFileSync(POP_OUT, JSON.stringify(out) + '\n');
  console.log(`→ ${path.relative(ROOT, POP_OUT)} (${Object.keys(out).length} pays, ${cells} cases, ${(fs.statSync(POP_OUT).size / 1024).toFixed(1)} KB)`);
}

main()
  .then(buildPopulation)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
