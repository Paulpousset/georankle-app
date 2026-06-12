/**
 * Cartographic Atlas color system.
 * Light mode = aged parchment / vintage atlas.
 * Dark mode = nautical chart / night map.
 */

export const PALETTE = {
  // Cartographic accents
  vermilion: '#c04a1a',
  forestGreen: '#2a6e3f',
  oceanBlue: '#1a4a7a',
  sand: '#c4872a',
  dangerRed: '#8b1a1a',
  chartBlue: '#4a9eff',
  // Parchment tones
  parchment: '#f2e8d0',
  parchmentDark: '#e8d9b8',
  sepia: '#2c1810',
  tan: '#c4a87a',
  brown: '#7a5c38',
  brownLight: '#a08060',
  // Night map tones
  nightDeep: '#0a1628',
  nightNavy: '#132040',
  nightSurface: '#1a2d50',
  nightBorder: '#2d4a70',
  nightText: '#d8e8f4',
  nightMuted: '#7aa0c4',
  nightFaint: '#4a6a88',
  // Legacy (kept for rank backward compat)
  white: '#ffffff',
  black: '#000000',
} as const;

export const RANK_COLORS = {
  excellent: PALETTE.forestGreen,
  good: PALETTE.oceanBlue,
  average: PALETTE.sand,
  poor: PALETTE.dangerRed,
} as const;

export interface ThemeColors {
  background: string;
  card: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
}

const DARK: ThemeColors = {
  background: PALETTE.nightDeep,
  card: PALETTE.nightNavy,
  surface: PALETTE.nightSurface,
  border: PALETTE.nightBorder,
  text: PALETTE.nightText,
  textMuted: PALETTE.nightMuted,
  textFaint: PALETTE.nightFaint,
  accent: PALETTE.chartBlue,
};

const LIGHT: ThemeColors = {
  background: PALETTE.parchment,
  card: PALETTE.parchmentDark,
  surface: '#f8f2e3',
  border: PALETTE.tan,
  text: PALETTE.sepia,
  textMuted: PALETTE.brown,
  textFaint: PALETTE.brownLight,
  accent: PALETTE.vermilion,
};

export function getColors(isDarkMode: boolean): ThemeColors {
  return isDarkMode ? DARK : LIGHT;
}
