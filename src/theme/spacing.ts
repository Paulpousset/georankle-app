/**
 * Spacing & radius scale.
 *
 * Use these instead of scattering magic numbers in paddings/margins/gaps.
 * The steps follow a 4px base grid so layouts stay visually consistent.
 */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/** Common corner radii used across cards, buttons and pills. */
export const RADII = {
  sm: 8,
  md: 10,
  lg: 14,
  xl: 16,
  pill: 999,
} as const;
