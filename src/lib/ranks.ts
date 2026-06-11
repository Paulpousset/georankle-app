import { RANK_COLORS } from '../theme/colors';

/**
 * Returns the accent color for a rank: lower (better) ranks are greener,
 * higher (worse) ranks trend toward red.
 */
export function getRankColor(rank: number): string {
  if (rank <= 5) return RANK_COLORS.excellent;
  if (rank <= 20) return RANK_COLORS.good;
  if (rank <= 50) return RANK_COLORS.average;
  return RANK_COLORS.poor;
}

/**
 * Returns the accent color for an efficiency percentage (0-100),
 * where higher is better.
 */
export function getEfficiencyColor(efficiency: number): string {
  if (efficiency >= 80) return RANK_COLORS.excellent;
  if (efficiency >= 50) return RANK_COLORS.good;
  return RANK_COLORS.poor;
}
