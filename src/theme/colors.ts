/**
 * Central color palette and semantic theme tokens.
 *
 * `getColors(isDarkMode)` returns the resolved tokens for the active theme so
 * screens never hard-code `isDarkMode ? '#xxx' : '#yyy'` pairs inline.
 */

/** Raw brand/accent colors, theme-independent. */
export const PALETTE = {
  green: '#10b981',
  blue: '#3b82f6',
  sky: '#38bdf8',
  amber: '#f59e0b',
  amberLight: '#fbbf24',
  amberDark: '#d97706',
  red: '#ef4444',
  pink: '#ec4899',
  purple: '#8b5cf6',
  white: '#ffffff',
  black: '#000000',
} as const;

/** Rank/efficiency accent colors. */
export const RANK_COLORS = {
  excellent: PALETTE.green,
  good: PALETTE.blue,
  average: PALETTE.amber,
  poor: PALETTE.red,
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
  background: '#0f172a',
  card: '#1e293b',
  surface: '#0f172a',
  border: '#334155',
  text: '#f8fafc',
  textMuted: '#94a3b8',
  textFaint: '#64748b',
  accent: PALETTE.green,
};

const LIGHT: ThemeColors = {
  background: '#f8fafc',
  card: '#ffffff',
  surface: '#f1f5f9',
  border: '#e2e8f0',
  text: '#1e293b',
  textMuted: '#64748b',
  textFaint: '#94a3b8',
  accent: PALETTE.green,
};

export function getColors(isDarkMode: boolean): ThemeColors {
  return isDarkMode ? DARK : LIGHT;
}
