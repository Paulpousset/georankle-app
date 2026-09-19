/**
 * « Point sur le Globe » — pure question generation.
 *
 * A question is a single point dropped on a borderless globe: the player must
 * say which country it lies in. The point is drawn INSIDE the country's own
 * polygon (assets/world_polygons.json, the rings the 3D globe draws), so the
 * globe and the answer key can never disagree. Among the candidate points the
 * one furthest from the country's edges wins, so a point never sits on a
 * border where the right answer would be a coin toss.
 *
 * The DUO / CARRÉ distractors are the countries CLOSEST to the point — the ones
 * a player would actually hesitate between — measured as the distance from the
 * point to each country's outline. Everything is seeded, so daily and online
 * rounds are identical for everyone sharing the seed.
 */
import type { Language } from '../types';
import rawWorldPolygons from '../../assets/world_polygons.json';
import rawCountriesStats from '../../assets/countries_stats.json';
import { filterCca3sByContinent, type ContinentId } from '../data/continents';
import { orderCca3sByReview } from './reviewOrder';
import { createSeededRng, seededShuffle } from './rng';
import { COUNTRY_ALIASES } from './answerMatch';
import { countryAnswerNames, countryName } from './geoNames';

interface PolyEntry {
  id: string;
  /** Rings of [lng, lat] points (main landmass + islands). */
  r: number[][][];
}
interface StatEntry {
  cca3: string;
  name: string;
  name_en?: string;
  region?: string;
  lat: number;
  lng: number;
}

const POLYGONS = rawWorldPolygons as PolyEntry[];
const STATS = rawCountriesStats as StatEntry[];
const STATS_BY_ID = new Map(STATS.map((s) => [s.cca3, s]));
const POLY_BY_ID = new Map(POLYGONS.map((p) => [p.id, p]));

/** Below this many points a ring is a sliver with no interior to land in. */
const MIN_MAIN_RING_POINTS = 6;

/** Candidate points drawn per question; the one with the widest margin wins. */
const CANDIDATES = 40;

/** Number of DUO/CARRÉ distractors (CARRÉ = answer + 3). */
const DISTRACTORS = 3;

const toRad = (d: number) => (d * Math.PI) / 180;

/**
 * Make a ring's longitudes continuous across the ±180° seam (Russia, Fiji):
 * each point is pulled to within 180° of the previous one.
 */
function unwrapRing(ring: number[][]): number[][] {
  if (ring.length === 0) return ring;
  const out: number[][] = [[ring[0][0], ring[0][1]]];
  let prev = ring[0][0];
  for (let i = 1; i < ring.length; i++) {
    let lng = ring[i][0];
    while (lng - prev > 180) lng -= 360;
    while (lng - prev < -180) lng += 360;
    out.push([lng, ring[i][1]]);
    prev = lng;
  }
  return out;
}

/** Planar shoelace area of a ring, in degrees² corrected for latitude. */
function ringArea(ring: number[][]): number {
  let a = 0;
  let latSum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    latSum += ring[i][1];
  }
  const midLat = latSum / Math.max(1, ring.length);
  return Math.abs(a / 2) * Math.max(0.05, Math.cos(toRad(midLat)));
}

/** The ring the point is dropped in: the largest by area (the homeland). */
function mainRing(entry: PolyEntry): number[][] | null {
  let best: number[][] | null = null;
  let bestArea = -1;
  for (const raw of entry.r) {
    if (raw.length < MIN_MAIN_RING_POINTS) continue;
    const ring = unwrapRing(raw);
    const a = ringArea(ring);
    if (a > bestArea) {
      bestArea = a;
      best = ring;
    }
  }
  return best;
}

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Squared distance from a point to a segment, in a local equirectangular
 * frame where longitudes are scaled by cos(lat) so a degree is a degree in
 * every direction. Good enough to rank neighbours and margins.
 */
function segDist2(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

/**
 * Distance (in scaled degrees) from a point to the nearest edge of a set of
 * rings. Longitudes are compared modulo 360 so the ±180° seam never inflates a
 * distance.
 */
function ringsDistance(lng: number, lat: number, rings: number[][][]): number {
  const kx = Math.max(0.05, Math.cos(toRad(lat)));
  let best = Infinity;
  for (const raw of rings) {
    const ring = unwrapRing(raw);
    for (const shift of [-360, 0, 360]) {
      const px = (lng + shift) * kx;
      const py = lat;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const d = segDist2(px, py, ring[j][0] * kx, ring[j][1], ring[i][0] * kx, ring[i][1]);
        if (d < best) best = d;
      }
    }
  }
  return Math.sqrt(best);
}

/** cca3s eligible for the game: a real polygon to land in AND name data. */
export function pinpointCountries(): string[] {
  return POLYGONS.filter((p) => STATS_BY_ID.has(p.id) && mainRing(p) !== null).map((p) => p.id);
}

export interface PinpointPoint {
  lat: number;
  lng: number;
}

/**
 * A seeded point inside a country's main landmass, as far from its edges as
 * the draw allows. Falls back to the country's reference coordinates when no
 * candidate lands inside (degenerate ring) — never null for an eligible id.
 */
export function samplePinpoint(cca3: string, rng: () => number): PinpointPoint | null {
  const entry = POLY_BY_ID.get(cca3);
  const stat = STATS_BY_ID.get(cca3);
  if (!entry || !stat) return null;
  const ring = mainRing(entry);
  if (!ring) return { lat: stat.lat, lng: stat.lng };

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  let best: PinpointPoint | null = null;
  let bestMargin = -1;
  let found = 0;
  // Rejection sampling in the bounding box; sparse shapes (Chile, Norway) need
  // more throws than fat ones, hence the generous cap.
  for (let tries = 0; tries < 400 && found < CANDIDATES; tries++) {
    const x = minX + rng() * (maxX - minX);
    const y = minY + rng() * (maxY - minY);
    if (!pointInRing(x, y, ring)) continue;
    found++;
    const margin = ringsDistance(x, y, [ring]);
    if (margin > bestMargin) {
      bestMargin = margin;
      best = { lat: y, lng: x };
    }
  }
  if (!best) return { lat: stat.lat, lng: stat.lng };
  // Back into [-180, 180] after the unwrap.
  let lng = best.lng;
  while (lng > 180) lng -= 360;
  while (lng < -180) lng += 360;
  return { lat: Math.round(best.lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
}

/**
 * The `n` countries whose outline is closest to a point, nearest first,
 * excluding `exclude`. This is what makes DUO/CARRÉ a real question: the
 * wrong options are the neighbours the point could plausibly belong to.
 */
export function nearestCountries(
  point: PinpointPoint,
  exclude: string,
  pool: string[],
  n = DISTRACTORS,
): string[] {
  const scored: { id: string; d: number }[] = [];
  for (const id of pool) {
    if (id === exclude) continue;
    const entry = POLY_BY_ID.get(id);
    if (!entry) continue;
    scored.push({ id, d: ringsDistance(point.lng, point.lat, entry.r) });
  }
  scored.sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1));
  return scored.slice(0, n).map((s) => s.id);
}

export interface PinpointQuestion {
  /** The country the point lies in (cca3). */
  answer: string;
  /** The point itself. */
  lat: number;
  lng: number;
  /** The 3 closest other countries, nearest first — the DUO/CARRÉ distractors. */
  distractors: string[];
  /** 4 cca3 options in a seeded display order (contains the answer). */
  options: string[];
}

export interface PinpointOpts {
  /** Solo continent scope; null (the default) plays the whole world. */
  continent?: ContinentId | null;
  /**
   * Review run: cca3s to draw the answers from first. Ones outside the scoped
   * pool are ignored, and the rest of the pool still fills the run out.
   */
  reviewIds?: string[] | null;
}

/**
 * A seeded session of `count` questions. Answers never repeat within a run.
 *
 * `opts.continent` narrows the *answers* for solo play. Distractors always come
 * from the worldwide pool: the neighbours of a point are its neighbours
 * whatever the player chose to revise — a point in Turkey must still offer
 * Syria, not only the rest of Europe.
 */
export function buildPinpointRun(
  seed: number,
  count = 5,
  opts: PinpointOpts = {},
): PinpointQuestion[] {
  const rng = createSeededRng(seed);
  const pool = pinpointCountries();
  const answerPool = filterCca3sByContinent(pool, opts.continent ?? null);
  // A review run keeps the due order (most-missed first) instead of shuffling;
  // everything else is seeded-random.
  const ordered = opts.reviewIds?.length
    ? orderCca3sByReview(answerPool, opts.reviewIds)
    : seededShuffle(answerPool, rng);
  const answers = ordered.slice(0, Math.min(count, answerPool.length));

  return answers.map((answer) => {
    const point = samplePinpoint(answer, rng) ?? { lat: 0, lng: 0 };
    const distractors = nearestCountries(point, answer, pool, DISTRACTORS);
    return {
      answer,
      lat: point.lat,
      lng: point.lng,
      distractors,
      options: seededShuffle([answer, ...distractors], rng),
    };
  });
}

/** Localized display name for an option (falls back to the cca3). */
export function pinpointCountryName(cca3: string, lang: Language): string {
  const s = STATS_BY_ID.get(cca3);
  if (!s) return cca3;
  return countryName(s, lang);
}

/**
 * Toutes les orthographes acceptées d'une réponse tapée (CASH) : les seize
 * langues du jeu plus les alias partagés — le clavier dont dispose le joueur ne
 * doit jamais coûter un point.
 */
export function pinpointAcceptedAnswers(cca3: string): string[] {
  const s = STATS_BY_ID.get(cca3);
  if (!s) return [cca3];
  const aliases = COUNTRY_ALIASES[cca3] ?? [];
  return Array.from(new Set([...countryAnswerNames(s), ...aliases].filter(Boolean)));
}
