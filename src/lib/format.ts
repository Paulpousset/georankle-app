/**
 * Compact, localized number formatters shared by the game screens (population,
 * area, money, distance). All pure.
 */
import type { Language } from '../types';

/** Formats a count: 1.2 Md/B, 50 M, 12k, 800. Uses "Md" in French for billions. */
export function fmtCount(n: number, lang: Language): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}${lang === 'fr' ? ' Md' : 'B'}`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return `${Math.round(n)}`;
}

/** Formats an area in km²: 9.8 M km², 500k km², 240 km². */
export function fmtArea(km2: number, lang: Language): string {
  if (km2 >= 1e6) return `${(km2 / 1e6).toFixed(1)}${lang === 'fr' ? ' M' : 'M'} km²`;
  if (km2 >= 1e3) return `${Math.round(km2 / 1e3)}k km²`;
  return `${Math.round(km2)} km²`;
}

/** Formats a monetary amount: $1.5k, $50. */
export function fmtMoney(v: number): string {
  if (v >= 1e3) return `$${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}k`;
  return `$${Math.round(v)}`;
}

/** Formats a distance in km: "5.0k km" beyond 1000, "240 km" below. */
export function fmtDist(km: number): string {
  if (km < 1000) return `${km} km`;
  return `${(km / 1000).toFixed(1)}k km`;
}
