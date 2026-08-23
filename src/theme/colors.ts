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
  /** Gris ardoise pour les petites surfaces portant du texte blanc (6,4:1). */
  slateMuted: '#556070',
  /**
   * Variante foncée de chartBlue, pour les SURFACES portant du texte blanc.
   *
   * chartBlue tient très bien comme couleur de TEXTE sur fond nuit (6,6:1 sur
   * nightDeep) mais échoue comme FOND sous du blanc (2,75:1) — deux rôles aux
   * exigences opposées. Assombrir chartBlue lui-même serait un recul net : à
   * #006ff0 les 50 usages en texte tomberaient à 3,5-3,9:1. D'où ce second
   * token, réservé aux boutons pleins. Blanc dessus : 4,63:1.
   */
  chartBlueStrong: '#006ff0',
  // Emerald "correct/success" accent (used for right answers in the guess games).
  success: '#10B981',
  // Parchment tones
  parchment: '#f2e8d0',
  parchmentDark: '#e8d9b8',
  sepia: '#2c1810',
  tan: '#c4a87a',
  // Légèrement assombri (était #7a5c38) : en `textMuted` sur cardLight il
  // plafonnait à 4,41:1, juste sous le seuil AA. Ici 4,79:1 sur cardLight et
  // 5,48:1 sur parchment, à teinte et saturation constantes.
  brown: '#735735',
  // Assombri (était #a08060) : en texte secondaire sur parchemin il plafonnait
  // à 3,0:1, sous le seuil WCAG AA de 4,5:1 — et il est utilisé 159 fois, très
  // souvent à 10-12 px. Ici : 5,39:1 sur parchment, 4,70:1 sur parchmentDark.
  brownLight: '#705943',
  // Night map tones
  nightDeep: '#0a1628',
  nightNavy: '#132040',
  nightSurface: '#1a2d50',
  nightBorder: '#2d4a70',
  nightText: '#d8e8f4',
  nightMuted: '#7aa0c4',
  // Éclairci (était #4a6a88) : 2,83:1 sur nightNavy, très en dessous du seuil
  // AA. Ici : 5,21:1 sur nightDeep, 4,61:1 sur nightNavy.
  nightFaint: '#6a8dae',
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
  /**
   * À utiliser en `backgroundColor` quand le contenu est du texte blanc.
   * `accent` reste la couleur de premier plan (texte, icônes, bordures).
   */
  accentStrong: string;
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
  accentStrong: PALETTE.chartBlueStrong,
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
  // Le vermillon tient déjà sous du blanc (4,96:1) : pas de variante nécessaire.
  accentStrong: PALETTE.vermilion,
};

export function getColors(isDarkMode: boolean): ThemeColors {
  return isDarkMode ? DARK : LIGHT;
}
