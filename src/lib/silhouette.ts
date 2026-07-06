/**
 * « Silhouette » — pure question generation + SVG shape building.
 *
 * Shapes come from assets/world_polygons.json (the simplified country rings
 * already bundled for the 3D globe). A question shows one country's filled
 * outline and four name options; distractors are drawn from the same region
 * when possible so the answer can't be guessed from the continent alone.
 * Everything is seeded, so daily and online rounds are identical for everyone
 * sharing the seed.
 */
import rawWorldPolygons from '../../assets/world_polygons.json';
import rawCountriesStats from '../../assets/countries_stats.json';
import { createSeededRng, seededShuffle } from './rng';

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
}

const POLYGONS = rawWorldPolygons as PolyEntry[];
const STATS = rawCountriesStats as StatEntry[];
const STATS_BY_ID = new Map(STATS.map((s) => [s.cca3, s]));
const POLY_BY_ID = new Map(POLYGONS.map((p) => [p.id, p]));

/** Below this many points the main outline reads as a blob, not a shape. */
const MIN_MAIN_RING_POINTS = 22;

/**
 * Rings whose centroid sits further than this (in degrees) from the main
 * ring's centroid are distant territories (French Guiana, Alaska, …) — they
 * would crush the recognizable homeland into a corner of the viewBox.
 */
const MAX_RING_DISTANCE_DEG = 25;

function centroid(ring: number[][]): [number, number] {
  let x = 0;
  let y = 0;
  for (const p of ring) {
    x += p[0];
    y += p[1];
  }
  return [x / ring.length, y / ring.length];
}

/**
 * Make one ring's longitudes continuous across the ±180° seam: each point is
 * pulled to within 180° of the previous one. Without this, a country straddling
 * the antimeridian (Russia, Fiji) has a point at +179 next to one at −179 and
 * the equirectangular projection smears it into a line across the whole viewBox.
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

/**
 * The rings actually drawn for a country (main landmass + nearby islands), with
 * longitudes unwrapped so the shape is continuous. Each ring is first made
 * internally continuous, then shifted by whole turns to sit beside the main
 * landmass; rings still too far away (distant territories) are culled.
 */
function drawableRings(entry: PolyEntry): number[][][] {
  const unwrapped = entry.r.map(unwrapRing);
  const main = unwrapped.reduce((a, b) => (b.length > a.length ? b : a), unwrapped[0]);
  const [mx, my] = centroid(main);
  return unwrapped
    .map((ring) => {
      // Align this ring to the main landmass's longitude window (±whole turns).
      const [cx] = centroid(ring);
      const shift = Math.round((mx - cx) / 360) * 360;
      return shift ? ring.map(([lng, lat]) => [lng + shift, lat]) : ring;
    })
    .filter((ring) => {
      const [cx, cy] = centroid(ring);
      return Math.hypot(cx - mx, cy - my) <= MAX_RING_DISTANCE_DEG;
    });
}

/** cca3s eligible for the game: a recognizable shape AND name/region data. */
export function silhouetteCountries(): string[] {
  return POLYGONS.filter((p) => {
    const main = Math.max(...p.r.map((ring) => ring.length));
    return main >= MIN_MAIN_RING_POINTS && STATS_BY_ID.has(p.id);
  }).map((p) => p.id);
}

export interface SilhouetteQuestion {
  /** The country drawn (cca3). */
  answer: string;
  /** 4 cca3 options in display order (contains the answer). */
  options: string[];
}

/**
 * A seeded session of `count` questions. Answers never repeat within a run;
 * the three distractors come from the answer's region when it has enough
 * neighbours, topped up from the rest of the world otherwise.
 */
export function buildSilhouetteRun(seed: number, count = 5): SilhouetteQuestion[] {
  const rng = createSeededRng(seed);
  const pool = silhouetteCountries();
  const answers = seededShuffle(pool, rng).slice(0, Math.min(count, pool.length));

  return answers.map((answer) => {
    const region = STATS_BY_ID.get(answer)?.region;
    const sameRegion = pool.filter(
      (c) => c !== answer && region && STATS_BY_ID.get(c)?.region === region,
    );
    const elsewhere = pool.filter(
      (c) => c !== answer && (!region || STATS_BY_ID.get(c)?.region !== region),
    );
    const distractors = [
      ...seededShuffle(sameRegion, rng),
      ...seededShuffle(elsewhere, rng),
    ].slice(0, 3);
    return { answer, options: seededShuffle([answer, ...distractors], rng) };
  });
}

/** Localized display name for an option (falls back to the cca3). */
export function silhouetteCountryName(cca3: string, lang: 'fr' | 'en'): string {
  const s = STATS_BY_ID.get(cca3);
  if (!s) return cca3;
  return lang === 'fr' ? s.name : s.name_en ?? s.name;
}

/**
 * Every accepted spelling for a typed (CASH) answer — both language names, so a
 * player can answer "Germany" or "Allemagne" whatever the UI language is.
 */
export function silhouetteAcceptedAnswers(cca3: string): string[] {
  const s = STATS_BY_ID.get(cca3);
  if (!s) return [cca3];
  return Array.from(new Set([s.name, s.name_en ?? s.name].filter(Boolean)));
}

/**
 * SVG path for a country's silhouette, fitted into a `size`×`size` viewBox
 * (centered, aspect preserved, latitude foreshortening corrected so the shape
 * matches the familiar map outline). Null when the country has no polygon.
 */
export function silhouettePath(cca3: string, size = 100): string | null {
  const entry = POLY_BY_ID.get(cca3);
  if (!entry || entry.r.length === 0) return null;
  const rings = drawableRings(entry);
  if (rings.length === 0) return null;

  // Equirectangular projection with the x-axis compressed by cos(midLat) —
  // without it high-latitude countries look horizontally stretched.
  const allLats = rings.flatMap((ring) => ring.map((p) => p[1]));
  const midLat = (Math.min(...allLats) + Math.max(...allLats)) / 2;
  const kx = Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
  const project = ([lng, lat]: number[]): [number, number] => [lng * kx, -lat];

  const projected = rings.map((ring) => ring.map(project));
  const xs = projected.flatMap((ring) => ring.map((p) => p[0]));
  const ys = projected.flatMap((ring) => ring.map((p) => p[1]));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = size * 0.06;
  const scale = (size - 2 * pad) / Math.max(maxX - minX, maxY - minY, 1e-9);
  // Center the fitted shape on both axes.
  const offX = pad + (size - 2 * pad - (maxX - minX) * scale) / 2;
  const offY = pad + (size - 2 * pad - (maxY - minY) * scale) / 2;

  return projected
    .map(
      (ring) =>
        ring
          .map(([x, y], i) => {
            const px = (offX + (x - minX) * scale).toFixed(2);
            const py = (offY + (y - minY) * scale).toFixed(2);
            return `${i === 0 ? 'M' : 'L'}${px} ${py}`;
          })
          .join('') + 'Z',
    )
    .join('');
}
