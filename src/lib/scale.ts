/**
 * « À l'échelle » — pure question generation, geometry and scoring.
 *
 * Two country silhouettes side by side: the left one is drawn at a fixed
 * reference scale, the right one carries a zoom slider. The player resizes the
 * right country until both are at the same real-world scale (same km per
 * pixel). Shapes come from the same projection as Silhouette
 * (`projectedRings`), where one unit ≈ one degree of latitude on both axes, so
 * the true ratio between two countries is just the ratio of their extents.
 *
 * Everything is seeded: same seed, same pairs, same slider range and start.
 */
import type { Language } from '../types';
import rawCountriesStats from '../../assets/countries_stats.json';
import { createSeededRng, seededShuffle } from './rng';
import { projectLngLatRings, projectedRings, silhouetteCountries, silhouetteCountryName } from './silhouette';
import { ghostArea, ghostLngLatRings, ghostName, isGhostId } from './ghostCountries';
import { GHOST_COUNTRIES } from '../data/ghostCountries';

interface StatEntry {
  cca3: string;
  area?: number;
}
const AREA_BY_ID = new Map((rawCountriesStats as StatEntry[]).map((s) => [s.cca3, s.area]));

/**
 * Board in SVG viewBox units: the left (reference) column is narrower than the
 * right one, which has to hold its country up to the slider's maximum zoom.
 */
export const BOARD_W = 200;
export const BOARD_H = 140;
export const LEFT_W = 80;
export const RIGHT_W = BOARD_W - LEFT_W;
/** Margin kept inside each column so a shape never touches its edge. */
const LEFT_FILL = 0.9;
const RIGHT_FILL = 0.94;

/**
 * Pair bounds on the linear size ratio (right ÷ left). Past 2.5× the smaller
 * shape shrinks to a few pixels; under 1.25× there is nothing to judge.
 */
const MAX_RATIO = 2.5;
const MIN_RATIO = 1.25;

/** The starting zoom is at least this far (×) from the answer, either way. */
const MIN_START_OFFSET = 1.45;

/** Points for a perfect answer; a 5-pair run therefore scores 0..1000. */
export const SCALE_MAX_POINTS = 200;
/** A guess this many times too big (or too small) scores zero. */
const ZERO_POINTS_FACTOR = 2.5;

export interface ShapeGeometry {
  rings: [number, number][][];
  minX: number;
  minY: number;
  width: number;
  height: number;
}

const geometryCache = new Map<string, ShapeGeometry | null>();

/**
 * Projected rings + bounding box of a country, or null with no polygon. Also
 * takes a Halloween ghost id (« Fantômes à l'échelle »): same projection.
 */
export function shapeGeometry(cca3: string): ShapeGeometry | null {
  if (geometryCache.has(cca3)) return geometryCache.get(cca3)!;
  const ghostRings = isGhostId(cca3) ? ghostLngLatRings(cca3) : null;
  const rings = ghostRings ? (ghostRings.length ? projectLngLatRings(ghostRings) : null) : projectedRings(cca3);
  let geo: ShapeGeometry | null = null;
  if (rings) {
    const xs = rings.flatMap((ring) => ring.map((p) => p[0]));
    const ys = rings.flatMap((ring) => ring.map((p) => p[1]));
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    geo = { rings, minX, minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
  }
  geometryCache.set(cca3, geo);
  return geo;
}

/** Largest side of the country's bounding box, in projected units. */
function extent(cca3: string): number {
  const g = shapeGeometry(cca3);
  return g ? Math.max(g.width, g.height) : 0;
}

export interface ScaleQuestion {
  /** Reference country, drawn at the true scale (cca3). */
  left: string;
  /** Country the player resizes (cca3). */
  right: string;
  /** Slider range, as zoom factors relative to the TRUE scale (answer = 1). */
  minZoom: number;
  maxZoom: number;
  /** Zoom the right country starts at. */
  startZoom: number;
}

/**
 * A seeded run of `count` pairs. A country appears at most once per run; the
 * slider range is randomized per pair so the answer never sits at the same spot
 * on the track (otherwise "drag to the middle" would win).
 */
export function buildScaleRun(seed: number, count = 5, opts: { ghost?: boolean } = {}): ScaleQuestion[] {
  const rng = createSeededRng(seed);
  // Halloween: every pair puts a vanished country on the left, against a
  // country of today (or another ghost) on the right.
  const ghostIds = opts.ghost ? GHOST_COUNTRIES.map((g) => g.id) : [];
  const pool = seededShuffle([...silhouetteCountries(), ...ghostIds], rng);
  const lefts = opts.ghost ? seededShuffle(ghostIds, rng) : pool;
  const used = new Set<string>();
  const run: ScaleQuestion[] = [];

  for (const left of lefts) {
    if (run.length >= count) break;
    if (used.has(left)) continue;
    const el = extent(left);
    if (el <= 0) continue;
    const right = pool.find((c) => {
      if (c === left || used.has(c)) return false;
      const r = extent(c) / el;
      const lin = r >= 1 ? r : 1 / r;
      return lin >= MIN_RATIO && lin <= MAX_RATIO;
    });
    if (!right) continue;
    used.add(left);
    used.add(right);

    // log-space range with the answer (1) somewhere in its middle third.
    const below = 1.8 + rng() * 1.7;
    // Kept lower than `below`: the right column must fit the country at max zoom.
    const above = 1.7 + rng() * 0.7;
    const minZoom = 1 / below;
    const maxZoom = above;
    // Start on a random side, far enough from the answer to have to work.
    const bigger = rng() < 0.5;
    const lo = Math.log(MIN_START_OFFSET);
    const hi = Math.log(bigger ? maxZoom : 1 / minZoom);
    const off = lo + rng() * Math.max(0, hi - lo);
    const startZoom = bigger ? Math.exp(off) : Math.exp(-off);
    run.push({ left, right, minZoom, maxZoom, startZoom });
  }
  return run;
}

/** Slider position (0..1) ↔ zoom factor, log-scaled so ×2 and ÷2 feel symmetric. */
export function zoomAt(q: ScaleQuestion, t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return q.minZoom * Math.pow(q.maxZoom / q.minZoom, c);
}
export function sliderPosOf(q: ScaleQuestion, zoom: number): number {
  return Math.log(zoom / q.minZoom) / Math.log(q.maxZoom / q.minZoom);
}

/** Points for a guess: 200 when exact, falling to 0 at 2.5× off (log error). */
export function scalePoints(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 0;
  const err = Math.abs(Math.log(zoom)) / Math.log(ZERO_POINTS_FACTOR);
  return Math.round(SCALE_MAX_POINTS * Math.max(0, 1 - err));
}

/**
 * SVG path of a country drawn at `unitPx` viewBox units per projected unit,
 * centered on (cx, cy).
 */
export function scaledPath(cca3: string, unitPx: number, cx: number, cy: number): string | null {
  const g = shapeGeometry(cca3);
  if (!g) return null;
  const offX = cx - (g.width * unitPx) / 2;
  const offY = cy - (g.height * unitPx) / 2;
  return g.rings
    .map(
      (ring) =>
        ring
          .map(([x, y], i) => {
            const px = (offX + (x - g.minX) * unitPx).toFixed(2);
            const py = (offY + (y - g.minY) * unitPx).toFixed(2);
            return `${i === 0 ? 'M' : 'L'}${px} ${py}`;
          })
          .join('') + 'Z',
    )
    .join('');
}

/** Largest scale at which a country fits a w×h box. */
function fitUnit(cca3: string, w: number, h: number): number {
  const g = shapeGeometry(cca3);
  if (!g) return Infinity;
  return Math.min(w / Math.max(g.width, 1e-9), h / Math.max(g.height, 1e-9));
}

/**
 * viewBox units per projected unit at the TRUE scale for a pair: as large as
 * possible while the left country fits its column AND the right one still fits
 * its own column at the slider's maximum zoom (no shape ever leaves the frame).
 */
export function trueUnitPx(q: ScaleQuestion): number {
  const u = Math.min(
    fitUnit(q.left, LEFT_W, BOARD_H) * LEFT_FILL,
    (fitUnit(q.right, RIGHT_W, BOARD_H) * RIGHT_FILL) / q.maxZoom,
  );
  return Number.isFinite(u) ? u : 1;
}

/** Localized name (shared with Silhouette; a ghost id gives its old name). */
export function scaleCountryName(cca3: string, lang: Language): string {
  return isGhostId(cca3) ? ghostName(cca3, lang) : silhouetteCountryName(cca3, lang);
}

/** Official surface area in km², when known (a ghost: its members' sum). */
export function countryArea(cca3: string): number | null {
  if (isGhostId(cca3)) return ghostArea(cca3);
  const a = AREA_BY_ID.get(cca3);
  return typeof a === 'number' && a > 0 ? a : null;
}
