/**
 * Pure auto-framing math for the "Régions Géo" map (src/screens/FindRegionGame.tsx).
 * No React, no assets — kept here so it can be unit-tested.
 */

export interface LatLng { lat: number; lng: number; }

/** Great-circle angular distance between two lon/lat points, in degrees. */
export function angDistDeg(la1: number, lo1: number, la2: number, lo2: number): number {
  const r = Math.PI / 180;
  const s = Math.sin(((la2 - la1) * r) / 2);
  const t = Math.sin(((lo2 - lo1) * r) / 2);
  return (2 * Math.asin(Math.min(1, Math.sqrt(s * s + Math.cos(la1 * r) * Math.cos(la2 * r) * t * t))) * 180) / Math.PI;
}

export interface RegionView { clng: number; clat: number; maxAng: number; }

/**
 * Auto-frame a set of region label points: the spherical 3D mean gives a centre
 * robust to the antimeridian (USA/Russia), and the max angular spread sizes the
 * view so every region fits.
 */
export function computeView(points: LatLng[]): RegionView {
  if (points.length === 0) return { clng: 0, clat: 0, maxAng: 30 };
  let x = 0, y = 0, z = 0;
  for (const p of points) {
    const la = (p.lat * Math.PI) / 180;
    const lo = (p.lng * Math.PI) / 180;
    x += Math.cos(la) * Math.cos(lo);
    y += Math.cos(la) * Math.sin(lo);
    z += Math.sin(la);
  }
  const n = points.length;
  x /= n; y /= n; z /= n;
  const clat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
  const clng = (Math.atan2(y, x) * 180) / Math.PI;
  let maxAng = 0.5;
  for (const p of points) maxAng = Math.max(maxAng, angDistDeg(clat, clng, p.lat, p.lng));
  return { clng, clat, maxAng };
}
