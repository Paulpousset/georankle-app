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
 * Output (committed): assets/split_cities.json
 *   { "<CCA3>": [[name_en, lat, lng, pop, { <lang>: name }?], …], … }
 * sorted by population, biggest first. Only cities that fall inside one of the
 * country's region shapes are kept (drops overseas places such as
 * Fort-de-France, which the map doesn't draw). Localized names are stored only
 * when they differ from the English one.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(__dirname, '.regioncache');
const REGIONS = path.join(ROOT, 'assets', 'regions');
const OUT = path.join(ROOT, 'assets', 'split_cities.json');

const SOURCE = {
  file: 'ne_10m_populated_places.geojson',
  url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson',
};

/** Cities kept per country — the game shows fewer, after spacing them out. */
const PER_COUNTRY = 24;
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
  const files = fs
    .readdirSync(REGIONS)
    .filter((f) => /^[A-Z]{3}\.json$/.test(f))
    .sort();
  for (const f of files) {
    const cca3 = f.slice(0, 3);
    const { regions } = JSON.parse(fs.readFileSync(path.join(REGIONS, f), 'utf8'));
    const cities = places
      .filter((p) => p.ADM0_A3 === cca3 && p.POP_MAX >= MIN_POP && !SKIP.has(`${cca3}:${p.NAME}`))
      .filter((p) => inCountry(p.LONGITUDE, p.LATITUDE, regions))
      .sort((a, b) => b.POP_MAX - a.POP_MAX)
      .slice(0, PER_COUNTRY)
      .map((p) => {
        const en = p.NAME_EN || p.NAME;
        const names = {};
        for (const l of LANGS) {
          const n = p[`NAME_${l.toUpperCase()}`];
          if (n && n !== en) names[l] = n;
        }
        const row = [en, round2(p.LATITUDE), round2(p.LONGITUDE), p.POP_MAX];
        if (Object.keys(names).length) row.push(names);
        return row;
      });
    out[cca3] = cities;
    console.log(`${cca3}: ${cities.length} villes — ${cities.slice(0, 4).map((c) => c[0]).join(', ')}…`);
  }
  fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
  console.log(`→ ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
