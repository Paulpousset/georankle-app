/**
 * "Atlas Vintage" palette for the orthographic globe / region canvas.
 * Light mode = aged parchment atlas (sand land, sepia coastlines, vermilion stamp).
 * Dark mode  = old night chart (warm tan land on deep navy, brass/sand highlights).
 *
 * Slots map 1:1 onto the canvas draw code in FindCountryGame / FindRegionGame.
 * `dot` is an rgba() prefix — the caller appends "<alpha>)".
 * `atm` is the inner atmosphere glow; null disables the halo entirely (light mode).
 */
import { PALETTE } from './colors';

export interface MapPalette {
  bg: string;
  ocean0: string;
  ocean1: string;
  grat: string;
  landF: string;
  landS: string;
  hovF: string;
  hovS: string;
  selF: string;
  selS: string;
  okF: string;
  okS: string;
  badF: string;
  badS: string;
  dot: string;
  rim: string;
  atm: string | null;
  atmEnd: string | null;
}

const DARK_MAP: MapPalette = {
  bg: PALETTE.nightDeep,
  ocean0: '#13243f',
  ocean1: PALETTE.nightDeep,
  grat: 'rgba(196,168,122,0.12)',
  landF: 'rgba(196,168,122,0.18)',
  landS: 'rgba(196,168,122,0.55)',
  hovF: 'rgba(196,135,42,0.24)',
  hovS: PALETTE.sand,
  selF: 'rgba(196,135,42,0.42)',
  selS: PALETTE.sand,
  okF: 'rgba(42,110,63,0.55)',
  okS: PALETTE.forestGreen,
  badF: 'rgba(139,26,26,0.5)',
  badS: PALETTE.dangerRed,
  dot: 'rgba(196,168,122,',
  rim: 'rgba(196,168,122,0.45)',
  atm: 'rgba(196,168,122,0.07)',
  atmEnd: 'rgba(196,168,122,0)',
};

const LIGHT_MAP: MapPalette = {
  bg: PALETTE.parchment,
  ocean0: '#efe3c8',
  ocean1: '#d8c49a',
  grat: 'rgba(122,92,56,0.20)',
  landF: 'rgba(196,168,122,0.55)',
  landS: 'rgba(44,24,16,0.45)',
  hovF: 'rgba(192,74,26,0.18)',
  hovS: PALETTE.vermilion,
  selF: 'rgba(192,74,26,0.35)',
  selS: PALETTE.vermilion,
  okF: 'rgba(42,110,63,0.45)',
  okS: PALETTE.forestGreen,
  badF: 'rgba(139,26,26,0.4)',
  badS: PALETTE.dangerRed,
  dot: 'rgba(122,92,56,',
  rim: 'rgba(122,92,56,0.6)',
  atm: null,
  atmEnd: null,
};

export function getMapPalette(isDark: boolean): MapPalette {
  return isDark ? DARK_MAP : LIGHT_MAP;
}
