/**
 * « Partage équitable » — pure map building, geometry and scoring.
 *
 * A country (or a group of countries: Benelux, Scandinavia, a whole
 * continent…) is drawn with its borders and its biggest cities, named but
 * with no figures: knowing which ones are big is the game. The player draws
 * one or two straight lines across the map so that the population of the
 * cities shown is split into equal parts
 * (2 parts with one line; 3 or 4 with two). The score is how close the split
 * gets to equal shares, measured against the best split straight lines can
 * reach on that map — a country whose capital outweighs the rest can still
 * score full marks.
 *
 * Maps come from the region shapes (assets/regions), the globe's country
 * outlines (assets/world_polygons.json) for multi-country maps, and the city
 * table built by scripts/build_split_data.mjs. Everything is seeded: same seed, same maps.
 */
import type { Language } from '../types';
import rawSplitCities from '../../assets/split_cities.json';
import rawWorldPolygons from '../../assets/world_polygons.json';
import rawCountriesStats from '../../assets/countries_stats.json';
import { BUNDLED_REGIONS } from '../../assets/regions';
import { coreRegions } from './regionView';
import { createSeededRng, seededShuffle } from './rng';
import { silhouetteCountryName } from './silhouette';
import { tr } from '../i18n';

/** [name_en, lat, lng, population, localized names?] */
type CityRow = [string, number, number, number, Partial<Record<Language, string>>?];
const CITY_TABLE = rawSplitCities as unknown as Record<string, CityRow[]>;
const WORLD_RINGS = new Map(
  (rawWorldPolygons as { id: string; r: number[][][] }[]).map((p) => [p.id, p.r]),
);
const STATS = rawCountriesStats as { cca3: string; region?: string; subregion?: string }[];

/** Board width in SVG viewBox units; the height follows the country's shape. */
export const BOARD_W = 160;
const MIN_BOARD_H = 110;
const MAX_BOARD_H = 210;
/** Margin kept around the country inside the board. */
const PAD = 8;

/** Points for an equal split; a 5-map run therefore scores 0..1000. */
export const SPLIT_MAX_POINTS = 200;

/** Cities shown per map, at most. */
const MAX_CITIES = 14;
/** Fewer than this and there is nothing to weigh. */
const MIN_CITIES = 7;
/** Two cities closer than this (viewBox units) would overlap: the smaller is left out. */
const MIN_CITY_GAP = 9;

/**
 * Number of parts asked for each map of a run: two halves to start, then
 * thirds, then quarters. One line for halves, two lines beyond.
 */
const PARTS_PLAN: SplitParts[] = [2, 2, 3, 3, 4];

/**
 * A map is only asked for a number of parts when straight lines can get this
 * close to equal shares on it (total variation distance, see `splitError`).
 * Halves are looser: no line can cut Paris off alone, so France's best is
 * 61/39 — still a fair map, since points are counted from that best.
 */
const MAX_BEST_ERROR: Record<SplitParts, number> = { 2: 0.12, 3: 0.06, 4: 0.06 };

export type SplitParts = 2 | 3 | 4;

export interface SplitCity {
  name: string;
  names?: Partial<Record<Language, string>>;
  pop: number;
  /** Position on the board, in viewBox units. */
  x: number;
  y: number;
}

export interface SplitMap {
  /** A country's cca3, or a group's id (see SPLIT_GROUPS). */
  id: string;
  width: number;
  height: number;
  /** One SVG path per region or country (the land drawn is their union). */
  regions: string[];
  cities: SplitCity[];
  total: number;
}

export interface SplitQuestion {
  /** A country's cca3, or a group's id (see SPLIT_GROUPS). */
  id: string;
  parts: SplitParts;
  /** Lines the player draws: 1 for halves, 2 for thirds and quarters. */
  lines: 1 | 2;
  /** Smallest error straight lines can reach on this map (see `bestSplitError`). */
  best: number;
}

export interface Pt {
  x: number;
  y: number;
}
/** A player's line: the infinite line through two points of the board. */
export interface SplitLine {
  a: Pt;
  b: Pt;
}

/**
 * Left out: Japan (Okinawa shrinks the main islands and Honshu's cities pile
 * up into one unreadable cluster) and Russia (half its people fit in a corner
 * of the map, the rest is empty taiga).
 */
const EXCLUDED = new Set(['JPN', 'RUS']);

/** Countries that have both region shapes and enough cities once spaced out (see splitMap). */
export function splitCountries(): string[] {
  return Object.keys(BUNDLED_REGIONS)
    .filter((c) => !EXCLUDED.has(c) && splitMap(c) !== null)
    .sort();
}

/** Every country of a continent (or one of its subregions), from the game data. */
const inRegion = (region: string, subregion?: string) => () =>
  STATS.filter((s) => s.region === region && (!subregion || s.subregion === subregion)).map((s) => s.cca3);

export interface SplitGroup {
  id: string;
  fr: string;
  en: string;
  members: string[] | (() => string[]);
  /** Frame of the map: [west, south, east, north] in degrees. */
  bbox: [number, number, number, number];
  /** Draw members with region shapes province by province (small groups, where the globe's outlines are too coarse). */
  detail?: boolean;
}

/**
 * Maps that span several countries, up to a whole continent. Not here: the
 * British Isles and the Balkans, where the globe's outlines are too coarse
 * (Great Britain in 48 points) or have holes (no Kosovo).
 */
export const SPLIT_GROUPS: SplitGroup[] = [
  { id: 'benelux', fr: 'Benelux', en: 'Benelux', members: ['BEL', 'NLD', 'LUX'], bbox: [2.5, 49.4, 7.3, 53.6], detail: true },
  { id: 'iberia', fr: 'Péninsule ibérique', en: 'Iberian Peninsula', members: ['ESP', 'PRT'], bbox: [-9.6, 35.9, 3.4, 43.9], detail: true },
  { id: 'scandinavia', fr: 'Scandinavie', en: 'Scandinavia', members: ['NOR', 'SWE', 'DNK', 'FIN'], bbox: [4.5, 54.5, 31.6, 71.2], detail: true },
  { id: 'dach', fr: 'Allemagne, Autriche, Suisse', en: 'Germany, Austria, Switzerland', members: ['DEU', 'AUT', 'CHE'], bbox: [5.8, 45.8, 17.2, 55.1], detail: true },
  { id: 'maghreb', fr: 'Maghreb', en: 'Maghreb', members: ['MAR', 'DZA', 'TUN'], bbox: [-13.2, 27.5, 11.7, 37.4] },
  { id: 'western-europe', fr: 'Europe de l’Ouest', en: 'Western Europe', members: ['FRA', 'BEL', 'NLD', 'LUX', 'DEU', 'CHE', 'AUT', 'ITA', 'GBR', 'IRL', 'ESP', 'PRT'], bbox: [-10.7, 36, 17.2, 59] },
  { id: 'europe', fr: 'Europe', en: 'Europe', members: inRegion('Europe'), bbox: [-25, 34.5, 45, 71.5] },
  { id: 'africa', fr: 'Afrique', en: 'Africa', members: inRegion('Africa'), bbox: [-18, -35, 52, 38] },
  { id: 'north-america', fr: 'Amérique du Nord', en: 'North America', members: ['USA', 'CAN', 'MEX'], bbox: [-130, 14, -52, 62] },
  { id: 'south-america', fr: 'Amérique du Sud', en: 'South America', members: inRegion('Americas', 'South America'), bbox: [-82, -56, -34, 13] },
  { id: 'middle-east', fr: 'Moyen-Orient', en: 'Middle East', members: ['SAU', 'IRN', 'IRQ', 'SYR', 'JOR', 'ISR', 'LBN', 'ARE', 'OMN', 'YEM', 'KWT', 'QAT', 'EGY', 'TUR'], bbox: [25, 12, 63, 42] },
  { id: 'south-asia', fr: 'Asie du Sud', en: 'South Asia', members: inRegion('Asia', 'Southern Asia'), bbox: [60, 5, 98, 37.5] },
  { id: 'east-asia', fr: 'Asie de l’Est', en: 'East Asia', members: inRegion('Asia', 'Eastern Asia'), bbox: [73, 18, 146, 54] },
  { id: 'southeast-asia', fr: 'Asie du Sud-Est', en: 'Southeast Asia', members: inRegion('Asia', 'South-Eastern Asia'), bbox: [92, -11, 141, 29] },
  { id: 'oceania', fr: 'Océanie', en: 'Oceania', members: ['AUS', 'NZL', 'PNG'], bbox: [110, -48, 180, 0] },
];
const GROUP_BY_ID = new Map(SPLIT_GROUPS.map((g) => [g.id, g]));

/** Is this map id a group of countries (rather than one country)? */
export function isSplitGroup(id: string): boolean {
  return GROUP_BY_ID.has(id);
}

/** Groups that have enough cities once spaced out. */
export function splitGroups(): string[] {
  return SPLIT_GROUPS.map((g) => g.id).filter((id) => splitMap(id) !== null);
}

const mapCache = new Map<string, SplitMap | null>();

/**
 * The board of a map: a country's main body (far-flung territories left out,
 * see coreRegions) or a group's frame, projected equirectangularly around its
 * centre with longitudes shrunk by cos(latitude), fitted into BOARD_W, and its
 * biggest cities spaced out so no two dots overlap.
 */
export function splitMap(id: string): SplitMap | null {
  if (mapCache.has(id)) return mapCache.get(id)!;
  let map: SplitMap | null = null;
  const group = GROUP_BY_ID.get(id);
  if (group) {
    const members = typeof group.members === 'function' ? group.members() : group.members;
    const [west, south, east, north] = group.bbox;
    const shapes = members.flatMap((c) => {
      const file = group.detail ? BUNDLED_REGIONS[c] : undefined;
      if (file) return file.regions.map((r) => r.r);
      const rings = WORLD_RINGS.get(c);
      return rings ? [rings] : [];
    });
    const rows = members
      .flatMap((c) => (WORLD_RINGS.has(c) || BUNDLED_REGIONS[c] ? CITY_TABLE[c] ?? [] : []))
      .filter(([, lat, lng]) => lng >= west && lng <= east && lat >= south && lat <= north)
      .sort((a, b) => b[3] - a[3]);
    map = buildMap(id, shapes, { west, south, east, north }, rows);
  } else {
    const file = BUNDLED_REGIONS[id];
    const rows = CITY_TABLE[id];
    if (file && rows) {
      const core = coreRegions(file.regions);
      const lng0 = core[0].lng;
      const wrap = (lng: number) => lng0 + ((((lng - lng0) % 360) + 540) % 360) - 180;
      let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
      for (const r of core)
        for (const ring of r.r)
          for (const [lng, lat] of ring) {
            const x = wrap(lng);
            if (x < west) west = x;
            if (x > east) east = x;
            if (lat < south) south = lat;
            if (lat > north) north = lat;
          }
      map = buildMap(id, core.map((r) => r.r), { west, south, east, north }, rows);
    }
  }
  mapCache.set(id, map);
  return map;
}

/**
 * A ring with continuous longitudes (no jump at the ±180° seam), shifted by
 * whole turns to sit nearest `lng0`. Wrapping each point on its own would cut
 * Russia in two on a map of Europe and draw a band across the whole board.
 */
function continuous(ring: number[][], lng0: number): number[][] {
  const out: number[][] = [];
  let prev = 0;
  let sum = 0;
  ring.forEach(([lng, lat], i) => {
    let x = lng;
    if (i > 0) {
      while (x - prev > 180) x -= 360;
      while (x - prev < -180) x += 360;
    }
    out.push([x, lat]);
    prev = x;
    sum += x;
  });
  const shift = Math.round((lng0 - sum / Math.max(1, ring.length)) / 360) * 360;
  return shift ? out.map(([x, y]) => [x + shift, y]) : out;
}

/**
 * Fits a frame (in degrees, `west` may run past ±180 for a country straddling
 * the antimeridian) into the board, draws the shapes (each a list of [lng, lat]
 * rings) and keeps the biggest cities of `rows` (sorted by population) that
 * fall inside the frame and clear each other.
 */
function buildMap(
  id: string,
  shapes: number[][][][],
  frame: { west: number; south: number; east: number; north: number },
  rows: CityRow[],
): SplitMap | null {
  const lng0 = (frame.west + frame.east) / 2;
  const wrap = (lng: number) => lng0 + ((((lng - lng0) % 360) + 540) % 360) - 180;
  const k = Math.cos((((frame.south + frame.north) / 2) * Math.PI) / 180);
  const minX = (frame.west - lng0) * k;
  const w = Math.max((frame.east - frame.west) * k, 1e-6);
  const h = Math.max(frame.north - frame.south, 1e-6);
  const height = Math.round(Math.min(MAX_BOARD_H, Math.max(MIN_BOARD_H, (BOARD_W * h) / w)));
  const unit = Math.min((BOARD_W - 2 * PAD) / w, (height - 2 * PAD) / h);
  const offX = (BOARD_W - w * unit) / 2;
  const offY = (height - h * unit) / 2;
  /** `lng` already within a turn of lng0 (see `continuous`). */
  const project = (lng: number, lat: number): Pt => ({
    x: offX + ((lng - lng0) * k - minX) * unit,
    y: offY + (frame.north - lat) * unit,
  });
  const toBoard = (lng: number, lat: number): Pt => project(wrap(lng), lat);

  const regions = shapes
    .map((rings) =>
      rings
        .map((ring) => continuous(ring, lng0).map(([lng, lat]) => project(lng, lat)))
        // Rings wholly off the board (Alaska on North America…) are not drawn.
        .filter((ring) => ring.some((p) => p.x >= 0 && p.x <= BOARD_W && p.y >= 0 && p.y <= height))
        .map((ring) => ring.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('') + 'Z')
        .join(''),
    )
    .filter(Boolean);

  const cities: SplitCity[] = [];
  for (const [name, lat, lng, pop, names] of rows) {
    if (cities.length >= MAX_CITIES) break;
    const p = toBoard(lng, lat);
    // Outside the drawn frame: an island or territory the map leaves out.
    if (p.x < PAD / 2 || p.x > BOARD_W - PAD / 2 || p.y < PAD / 2 || p.y > height - PAD / 2) continue;
    if (cities.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < MIN_CITY_GAP)) continue;
    cities.push({ name, names, pop, x: p.x, y: p.y });
  }
  if (cities.length < MIN_CITIES) return null;
  return { id, width: BOARD_W, height, regions, cities, total: cities.reduce((s, c) => s + c.pop, 0) };
}

/** Which side of a line a point falls on (true = left of a→b). */
function sideOf(line: SplitLine, p: Pt): boolean {
  return (line.b.x - line.a.x) * (p.y - line.a.y) - (line.b.y - line.a.y) * (p.x - line.a.x) > 0;
}

/**
 * Part of every city once the lines are drawn: a bit per line, so one line
 * gives parts 0/1 and two lines 0..3. Cities sharing a key are in one part.
 */
export function cityParts(map: SplitMap, lines: SplitLine[]): number[] {
  return map.cities.map((c) => lines.reduce((key, l, i) => key | (sideOf(l, c) ? 1 << i : 0), 0));
}

/** Population share of each non-empty part, biggest first. */
export function partShares(map: SplitMap, lines: SplitLine[]): { key: number; share: number }[] {
  const sums = new Map<number, number>();
  cityParts(map, lines).forEach((key, i) => sums.set(key, (sums.get(key) ?? 0) + map.cities[i].pop));
  return [...sums.entries()]
    .map(([key, s]) => ({ key, share: s / map.total }))
    .sort((a, b) => b.share - a.share);
}

/**
 * How far shares are from `parts` equal ones: the population that would have
 * to move for every part to hold exactly 1/parts (total variation distance,
 * 0 = perfect). Missing parts count as empty; extra parts (two crossing lines
 * when thirds were asked) are population in the wrong place.
 */
export function splitError(shares: number[], parts: SplitParts): number {
  const sorted = [...shares].sort((a, b) => b - a);
  let err = 0;
  for (let i = 0; i < Math.max(parts, sorted.length); i++) {
    err += Math.abs((sorted[i] ?? 0) - (i < parts ? 1 / parts : 0));
  }
  return err / 2;
}

/**
 * Every way one straight line can split the cities, as bitmasks of the cities
 * on one side. The line through two cities, nudged so each of the two falls on
 * either side, reaches every split a line can make; the empty mask stands for
 * a line drawn off the map.
 */
function lineSplits(cities: Pt[]): number[] {
  const n = cities.length;
  const full = (1 << n) - 1;
  const masks = new Set<number>([0]);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const a = cities[i];
      const b = cities[j];
      let base = 0;
      for (let k = 0; k < n; k++) {
        if (k === i || k === j) continue;
        const cross = (b.x - a.x) * (cities[k].y - a.y) - (b.y - a.y) * (cities[k].x - a.x);
        if (cross > 0) base |= 1 << k;
      }
      for (const extra of [0, 1 << i, 1 << j, (1 << i) | (1 << j)]) {
        // A split and its mirror are the same two parts: keep the one without city 0.
        const m = base | extra;
        masks.add(m & 1 ? full ^ m : m);
      }
    }
  return [...masks];
}

const bestCache = new Map<string, number>();

/**
 * The smallest error (see `splitError`) any `lines` straight lines can reach
 * on a map when `parts` equal parts are asked: exhaustive over every split one
 * line can make (two lines: every pair of them, which covers crossing and
 * parallel lines alike).
 */
export function bestSplitError(map: SplitMap, parts: SplitParts, lines: 1 | 2): number {
  const cacheKey = `${map.id}:${parts}:${lines}`;
  if (bestCache.has(cacheKey)) return bestCache.get(cacheKey)!;
  const n = map.cities.length;
  const full = (1 << n) - 1;
  const sum = new Float64Array(1 << n);
  for (let m = 1; m <= full; m++) {
    const low = m & -m;
    sum[m] = sum[m ^ low] + map.cities[31 - Math.clz32(low)].pop / map.total;
  }
  const splits = lineSplits(map.cities);
  let best = Infinity;
  if (lines === 1) {
    for (const m of splits) best = Math.min(best, splitError([sum[m], sum[full ^ m]], parts));
  } else {
    for (let i = 0; i < splits.length; i++) {
      const m1 = splits[i];
      const r1 = full ^ m1;
      for (let j = i; j < splits.length; j++) {
        const m2 = splits[j];
        const r2 = full ^ m2;
        const err = splitError([sum[m1 & m2], sum[m1 & r2], sum[r1 & m2], sum[r1 & r2]], parts);
        if (err < best) best = err;
      }
    }
  }
  bestCache.set(cacheKey, best);
  return best;
}

/** Which maps of a run span several countries (the others are one country). */
const GROUP_SLOTS = new Set([1, 3]);

/**
 * A seeded run of `count` maps: one country on most, a group of countries on
 * GROUP_SLOTS. A map appears at most once per run, and only on a number of
 * parts it can actually be split into (a capital heavier than a third of the
 * map never gets thirds).
 */
export function buildSplitRun(seed: number, count = 5): SplitQuestion[] {
  const rng = createSeededRng(seed);
  const countries = seededShuffle(splitCountries(), rng);
  const groups = seededShuffle(splitGroups(), rng);
  const used = new Set<string>();
  const run: SplitQuestion[] = [];
  for (let i = 0; i < count; i++) {
    const parts = PARTS_PLAN[Math.min(i, PARTS_PLAN.length - 1)];
    const lines = parts === 2 ? 1 : 2;
    // A group slot falls back on a country if no group fits (and vice versa).
    const pool = GROUP_SLOTS.has(i) ? [...groups, ...countries] : [...countries, ...groups];
    for (const id of pool) {
      if (used.has(id)) continue;
      const map = splitMap(id);
      if (!map) continue;
      const best = bestSplitError(map, parts, lines);
      if (best > MAX_BEST_ERROR[parts]) continue;
      used.add(id);
      run.push({ id, parts, lines, best });
      break;
    }
  }
  return run;
}

/**
 * Points for a split: 200 at the best error straight lines can reach, falling
 * linearly to 0 when the error reaches 60 % of the worst possible one (every
 * city in one part) — 80/20 halves, 65/20/15 thirds.
 */
export function splitPoints(error: number, q: Pick<SplitQuestion, 'parts' | 'best'>): number {
  if (!Number.isFinite(error)) return 0;
  const zero = 0.6 * (1 - 1 / q.parts);
  const span = Math.max(1e-9, zero - q.best);
  const t = (error - q.best) / span;
  return Math.round(SPLIT_MAX_POINTS * Math.max(0, Math.min(1, 1 - t)));
}

/** Points of a set of drawn lines on a question's map. */
export function scoreLines(q: SplitQuestion, lines: SplitLine[]): { points: number; error: number } {
  const map = splitMap(q.id);
  if (!map) return { points: 0, error: 1 };
  const error = splitError(
    partShares(map, lines).map((p) => p.share),
    q.parts,
  );
  return { points: splitPoints(error, q), error };
}

/**
 * The segment of the infinite line through a and b that crosses a w×h board,
 * or null if the line misses it (or a and b coincide).
 */
export function clipToBoard(line: SplitLine, w: number, h: number): [Pt, Pt] | null {
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  if (Math.hypot(dx, dy) < 1e-6) return null;
  // Liang–Barsky on t ∈ (−∞, ∞).
  let t0 = -Infinity;
  let t1 = Infinity;
  const edges: [number, number][] = [
    [-dx, line.a.x],
    [dx, w - line.a.x],
    [-dy, line.a.y],
    [dy, h - line.a.y],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  if (t0 > t1) return null;
  return [
    { x: line.a.x + t0 * dx, y: line.a.y + t0 * dy },
    { x: line.a.x + t1 * dx, y: line.a.y + t1 * dy },
  ];
}

/** Keeps the part of a polygon on one side of a line (Sutherland–Hodgman, one edge). */
function clipHalfPlane(poly: Pt[], line: SplitLine, left: boolean): Pt[] {
  const out: Pt[] = [];
  const inside = (p: Pt) => sideOf(line, p) === left;
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const cIn = inside(cur);
    const pIn = inside(prev);
    if (cIn !== pIn) {
      const dx = line.b.x - line.a.x;
      const dy = line.b.y - line.a.y;
      const ex = cur.x - prev.x;
      const ey = cur.y - prev.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) > 1e-12) {
        const t = (dx * (line.a.y - prev.y) - dy * (line.a.x - prev.x)) / den;
        out.push({ x: prev.x + t * ex, y: prev.y + t * ey });
      }
    }
    if (cIn) out.push(cur);
  }
  return out;
}

/**
 * The board cut by the lines, one SVG path per part, keyed like `cityParts`.
 * Drawn under the regions' outline (clipped to the country) to tint each part.
 */
export function partCells(lines: SplitLine[], w: number, h: number): { key: number; path: string }[] {
  const board: Pt[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const cells: { key: number; path: string }[] = [];
  for (let key = 0; key < 1 << lines.length; key++) {
    let poly = board;
    lines.forEach((l, i) => {
      if (poly.length) poly = clipHalfPlane(poly, l, (key & (1 << i)) !== 0);
    });
    if (poly.length < 3) continue;
    cells.push({
      key,
      path: poly.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('') + 'Z',
    });
  }
  return cells;
}

/** Localized name of a map: the country's (shared with Silhouette) or the group's. */
export function splitMapName(id: string, lang: Language): string {
  const group = GROUP_BY_ID.get(id);
  return group ? tr(lang, group.fr, group.en) : silhouetteCountryName(id, lang);
}

/**
 * Dot radius of a city, in viewBox units. The same for every city: a dot
 * sized by population would give the answer away (Paul, 25/10/2026: « juste
 * les grandes villes », the populations only show once the split is in).
 */
export function cityRadius(_map: SplitMap, _city: SplitCity): number {
  return 2.2;
}

/** Label font size, in viewBox units. */
export const LABEL_SIZE = 4.4;
/** Rough advance of one character of the label font, as a share of its size. */
const CHAR_W = 0.62;

export interface CityLabel {
  x: number;
  /** Baseline. */
  y: number;
  anchor: 'start' | 'end' | 'middle';
}

/**
 * Where to write each city's label (sized for « Lyon 1,4 M », the text once
 * revealed, so labels don't move when populations appear), biggest first: to
 * the right of its dot, else left, above or below — the first spot that stays
 * on the board and clears every dot and label already placed. With no clear
 * spot, the one overlapping least.
 */
export function placeLabels(map: SplitMap, texts: string[]): CityLabel[] {
  type Box = { x0: number; y0: number; x1: number; y1: number };
  const boxes: Box[] = map.cities.map((c) => {
    const r = cityRadius(map, c);
    return { x0: c.x - r, y0: c.y - r, x1: c.x + r, y1: c.y + r };
  });
  const overlap = (a: Box, b: Box) =>
    Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
    Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const h = LABEL_SIZE;
  return map.cities.map((c, i) => {
    const r = cityRadius(map, c);
    const w = texts[i].length * LABEL_SIZE * CHAR_W;
    const spots: (CityLabel & { box: Box })[] = [
      { x: c.x + r + 1, y: c.y + h * 0.35, anchor: 'start', box: { x0: c.x + r + 1, y0: c.y - h * 0.65, x1: c.x + r + 1 + w, y1: c.y + h * 0.35 } },
      { x: c.x - r - 1, y: c.y + h * 0.35, anchor: 'end', box: { x0: c.x - r - 1 - w, y0: c.y - h * 0.65, x1: c.x - r - 1, y1: c.y + h * 0.35 } },
      { x: c.x, y: c.y - r - 1, anchor: 'middle', box: { x0: c.x - w / 2, y0: c.y - r - 1 - h, x1: c.x + w / 2, y1: c.y - r - 1 } },
      { x: c.x, y: c.y + r + h, anchor: 'middle', box: { x0: c.x - w / 2, y0: c.y + r, x1: c.x + w / 2, y1: c.y + r + h } },
    ];
    let pick = spots[0];
    let least = Infinity;
    for (const s of spots) {
      const off =
        Math.max(0, -s.box.x0) + Math.max(0, s.box.x1 - map.width) +
        Math.max(0, -s.box.y0) + Math.max(0, s.box.y1 - map.height);
      const cost = boxes.reduce((sum, b, k) => sum + (k === i ? 0 : overlap(s.box, b)), 0) + off * 100;
      if (cost < least) {
        least = cost;
        pick = s;
        if (cost === 0) break;
      }
    }
    boxes.push(pick.box);
    return { x: pick.x, y: pick.y, anchor: pick.anchor };
  });
}

/** City name in the player's language, English otherwise. */
export function splitCityName(city: SplitCity, lang: Language): string {
  return city.names?.[lang] ?? city.name;
}
