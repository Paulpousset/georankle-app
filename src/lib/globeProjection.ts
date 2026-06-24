/**
 * Orthographic globe projection helpers, shared by <RankGlobe> (rank screen) and
 * <WorldAvatar> (cosmetic avatar). Pure math — no React, no assets. Project
 * lon/lat onto a sphere face centred at [cLon, cLat] and emit SVG path strings.
 */

/** Project [lon, lat] to screen [x, y, visible] for a globe of radius r at (cx, cy). */
export function project(
  lon: number, lat: number,
  cLon: number, cLat: number,
  r: number, cx: number, cy: number,
): [number, number, boolean] {
  const λ  = (lon  * Math.PI) / 180;
  const φ  = (lat  * Math.PI) / 180;
  const λ0 = (cLon * Math.PI) / 180;
  const φ0 = (cLat * Math.PI) / 180;
  const cosc =
    Math.sin(φ0) * Math.sin(φ) +
    Math.cos(φ0) * Math.cos(φ) * Math.cos(λ - λ0);
  const x = cx + r * Math.cos(φ) * Math.sin(λ - λ0);
  const y = cy - r * (Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * Math.cos(φ) * Math.cos(λ - λ0));
  return [x, y, cosc >= 0];
}

/** Build an SVG path for one polygon ring, with an optional pixel offset (relief). */
export function ringToPath(
  ring: [number, number][],
  cLon: number, cLat: number,
  r: number, cx: number, cy: number,
  dx = 0, dy = 0,
): string {
  const d: string[] = [];
  let pen = false;
  for (const [lon, lat] of ring) {
    const [x, y, vis] = project(lon, lat, cLon, cLat, r, cx, cy);
    if (vis) {
      d.push(`${pen ? 'L' : 'M'}${(x + dx).toFixed(1)},${(y + dy).toFixed(1)}`);
      pen = true;
    } else {
      if (pen && d.length > 1) d.push('Z');
      pen = false;
    }
  }
  if (d.length > 1) d.push('Z');
  return d.join(' ');
}

/** Build a graticule line (parallel if isLat, else meridian) as an SVG path. */
export function graticule(
  isLat: boolean, value: number,
  cLon: number, cLat: number,
  r: number, cx: number, cy: number,
): string {
  const d: string[] = [];
  let pen = false;
  const steps = isLat ? 72 : 36; // longitude steps for parallels, lat steps for meridians
  for (let i = 0; i <= steps; i++) {
    const lon = isLat ? -180 + (i * 360) / steps : value;
    const lat = isLat ? value : -90 + (i * 180) / steps;
    const [x, y, vis] = project(lon, lat, cLon, cLat, r, cx, cy);
    if (vis) {
      d.push(`${pen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
      pen = true;
    } else {
      if (pen && d.length > 1) d.push('Z');
      pen = false;
    }
  }
  return d.join(' ');
}
