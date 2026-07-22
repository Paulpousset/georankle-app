/**
 * Country "notoriety" (fame) ranking — the difficulty axis for Story mode.
 *
 * There is no single "how famous is this country" field in the data, so a rank
 * is precomputed offline (assets/notoriety.json) by blending log-scaled
 * population, GDP and tourist arrivals with internet penetration, over the exact
 * 195 countries in the game pool. rank 1 = most famous (China, USA, France…),
 * rank 195 = most obscure (Tuvalu, Nauru, Palau…).
 *
 * Story levels slide a notoriety *band* from famous (level 1) to obscure
 * (level 300); the band filters each mode's candidate answer countries so the
 * game gets genuinely harder as you climb, not just longer.
 *
 * A tiny population-based fallback keeps any cca3 missing from the table ranked
 * (treated as fairly obscure) so nothing ever crashes on a lookup.
 */
import rawNotoriety from '../../assets/notoriety.json';
import rawCountriesStats from '../../assets/countries_stats.json';

interface NotorietyEntry {
  rank: number;
  /** 1 = most famous, 0 = most obscure (linear over rank). */
  score: number;
}

const TABLE = (rawNotoriety as { ranks: Record<string, NotorietyEntry> }).ranks;

/** Number of ranked countries (== the game pool size). */
export const NOTORIETY_COUNT = (rawNotoriety as { count: number }).count;

// Population fallback for any cca3 not in the table: order by population so an
// unranked country still gets a sensible (usually obscure) position.
const POP_ORDER: string[] = (() => {
  const stats = rawCountriesStats as { cca3: string; population?: number }[];
  return stats
    .filter((s) => !TABLE[s.cca3])
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
    .map((s) => s.cca3);
})();

/**
 * Notoriety rank of a country: 1 (most famous) … NOTORIETY_COUNT (most obscure).
 * Unknown cca3s fall back to a population-derived rank in the obscure tail, so
 * this never returns undefined.
 */
export function notorietyRank(cca3: string): number {
  const hit = TABLE[cca3];
  if (hit) return hit.rank;
  const idx = POP_ORDER.indexOf(cca3);
  // Missing entirely → worst rank; otherwise slot it just past the ranked set.
  return idx === -1 ? NOTORIETY_COUNT : NOTORIETY_COUNT + 1 + idx;
}

/** True when a country's notoriety rank sits within [minRank, maxRank]. */
export function inBand(cca3: string, band: { minRank: number; maxRank: number }): boolean {
  const r = notorietyRank(cca3);
  return r >= band.minRank && r <= band.maxRank;
}
