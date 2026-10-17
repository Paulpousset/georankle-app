/**
 * Pure auto-framing math for the "Régions Géo" map (src/screens/FindRegionGame.tsx).
 * No React, no assets — kept here so it can be unit-tested.
 */

export interface LatLng { lat: number; lng: number; }

/** A region as the framing sees it: its label point, and optionally its id and rings. */
export interface FramedPoint extends LatLng {
  id?: string;
  /** Rings of [lng, lat] — used to measure how far the region's shape reaches. */
  r?: number[][][];
}

/** Great-circle angular distance between two lon/lat points, in degrees. */
export function angDistDeg(la1: number, lo1: number, la2: number, lo2: number): number {
  const r = Math.PI / 180;
  const s = Math.sin(((la2 - la1) * r) / 2);
  const t = Math.sin(((lo2 - lo1) * r) / 2);
  return (2 * Math.asin(Math.min(1, Math.sqrt(s * s + Math.cos(la1 * r) * Math.cos(la2 * r) * t * t))) * 180) / Math.PI;
}

export interface RegionView {
  clng: number;
  clat: number;
  maxAng: number;
  /** Ids of the far-flung regions left out of the framing (see coreRegions). */
  outliers?: string[];
}

/** Angular radius (degrees) of a region's largest ring around its label point. */
function shapeSpanDeg(p: FramedPoint): number {
  if (!p.r || p.r.length === 0) return 0;
  let main = p.r[0];
  for (const ring of p.r) if (ring.length > main.length) main = ring;
  let max = 0;
  const step = Math.max(1, Math.floor(main.length / 120));
  for (let k = 0; k < main.length; k += step) {
    max = Math.max(max, angDistDeg(p.lat, p.lng, main[k][1], main[k][0]));
  }
  return max;
}

/** Sea gap (degrees) beyond which a group of regions is detached from the rest. */
const DETACHED_GAP_DEG = 4;

/**
 * The regions the default view should frame: the main body of the country,
 * without the far-flung territories that would shrink it to a speck (Paul,
 * 17/10/2026: Norway opened on half the planet because of Bouvet Island, in the
 * South Atlantic). Regions are grouped when the gap between their shapes —
 * label distance minus both shapes' reach — is under DETACHED_GAP_DEG; the
 * largest group is the core (any group holding a quarter of the regions too).
 * Drops Bouvet and Svalbard, Bonaire, the Canaries, the Azores and Madeira,
 * Alaska and Hawaii; leaves long countries like Chile or Russia whole. When no
 * group holds half the regions there is no core to speak of, and all is kept.
 */
export function coreRegions<T extends FramedPoint>(points: T[]): T[] {
  const n = points.length;
  if (n < 4) return points;
  const spans = points.map(shapeSpanDeg);
  const group = new Array<number>(n).fill(-1);
  let groups = 0;
  for (let i = 0; i < n; i++) {
    if (group[i] >= 0) continue;
    group[i] = groups;
    const stack = [i];
    while (stack.length) {
      const k = stack.pop()!;
      for (let j = 0; j < n; j++) {
        if (group[j] >= 0) continue;
        const gap = angDistDeg(points[k].lat, points[k].lng, points[j].lat, points[j].lng) - spans[k] - spans[j];
        if (gap <= DETACHED_GAP_DEG) { group[j] = groups; stack.push(j); }
      }
    }
    groups++;
  }
  const size = new Array<number>(groups).fill(0);
  for (const g of group) size[g]++;
  const biggest = Math.max(...size);
  if (biggest < n / 2) return points;
  return points.filter((_, i) => size[group[i]] === biggest || size[group[i]] >= n / 4);
}

/**
 * Auto-frame a set of region label points: the spherical 3D mean gives a centre
 * robust to the antimeridian (USA/Russia), and the max angular spread sizes the
 * view so every region of the core (see coreRegions) fits.
 */
export function computeView(points: FramedPoint[]): RegionView {
  if (points.length === 0) return { clng: 0, clat: 0, maxAng: 30 };
  const core = coreRegions(points);
  let x = 0, y = 0, z = 0;
  for (const p of core) {
    const la = (p.lat * Math.PI) / 180;
    const lo = (p.lng * Math.PI) / 180;
    x += Math.cos(la) * Math.cos(lo);
    y += Math.cos(la) * Math.sin(lo);
    z += Math.sin(la);
  }
  const n = core.length;
  x /= n; y /= n; z /= n;
  const clat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
  const clng = (Math.atan2(y, x) * 180) / Math.PI;
  let maxAng = 0.5;
  for (const p of core) maxAng = Math.max(maxAng, angDistDeg(clat, clng, p.lat, p.lng));
  const view: RegionView = { clng, clat, maxAng };
  if (core.length < points.length) {
    const kept = new Set(core);
    view.outliers = points.filter((p) => !kept.has(p) && p.id != null).map((p) => p.id!);
  }
  return view;
}
