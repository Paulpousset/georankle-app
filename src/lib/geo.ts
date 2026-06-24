/**
 * Geographic helpers used by the country-guessing games: great-circle distance,
 * compass bearing, and an 8-way arrow for the bearing. All pure.
 */

/** Great-circle distance in whole kilometres between two lat/lng points. */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(lat2 - lat1);
  const dLng = r(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.asin(Math.sqrt(a)));
}

/** Initial compass bearing in degrees (0–360, 0 = north) from point 1 to point 2. */
export function calcBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLng = r(lng2 - lng1);
  const x = Math.sin(dLng) * Math.cos(r(lat2));
  const y =
    Math.cos(r(lat1)) * Math.sin(r(lat2)) -
    Math.sin(r(lat1)) * Math.cos(r(lat2)) * Math.cos(dLng);
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

/** Maps a bearing in degrees to one of 8 directional arrows. */
export function bearingToArrow(b: number): string {
  return ARROWS[Math.round(b / 45) % 8];
}
