/**
 * Converts an AvatarConfig into a 3D scene spec for <Avatar3D>: which hero GLB
 * to load, which gear models to attach to the hero's hand slots, and the
 * environment (sky + ground). The WebView page interprets this generically.
 */
import type { AvatarConfig, CosmeticCategory } from '../types';
import { getPart } from './cosmetics';

export interface BgSpec {
  kind: 'gradient' | 'stars' | 'grid';
  colors: string[];
  /** Ground disc colour — the character stands in an environment, not a card. */
  ground: string;
}

export interface AttachmentSpec {
  url: string;
  bone: string;
}

export interface AvatarSpec {
  bg: BgSpec;
  heroUrl: string;
  attachments: AttachmentSpec[];
}

/** Lighten (amt>0) or darken (amt<0) a hex colour. */
function shade(hex: string, amt: number): string {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
  const n = parseInt(full, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const target = amt < 0 ? 0 : 255;
  const t = Math.abs(amt);
  r = Math.round(r + (target - r) * t);
  g = Math.round(g + (target - g) * t);
  b = Math.round(b + (target - b) * t);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function tintOf(config: AvatarConfig, cat: CosmeticCategory, fallback: string): string {
  const layer = config.layers[cat];
  if (!layer) return fallback;
  if (layer.tint) return layer.tint;
  const part = getPart(cat, layer.id);
  return part?.defaultTint ?? fallback;
}

function background(config: AvatarConfig): BgSpec {
  const id = config.layers.background?.id ?? 'bg_parchment';
  switch (id) {
    case 'bg_parchment':
    case 'bg_solid': {
      const t = tintOf(config, 'background', '#e8d9b8');
      return { kind: 'gradient', colors: [shade(t, 0.14), shade(t, -0.2)], ground: shade(t, -0.32) };
    }
    case 'bg_night': return { kind: 'stars', colors: ['#0a1430', '#0d1b38'], ground: '#0e1c33' };
    case 'bg_space': return { kind: 'stars', colors: ['#04050e', '#0b0d22'], ground: '#11142a' };
    case 'bg_sunset': return { kind: 'gradient', colors: ['#f7a85a', '#b83b5e'], ground: '#84402f' };
    case 'bg_ocean': return { kind: 'gradient', colors: ['#2a8fd0', '#0a2a4a'], ground: '#0f3a5c' };
    case 'bg_grid': return { kind: 'grid', colors: ['#0a1430', '#13284a'], ground: '#0c1830' };
    default: return { kind: 'gradient', colors: ['#2a4a74', '#16263f'], ground: '#1c3050' };
  }
}

/** Build the full 3D scene spec from an avatar config. */
export function buildAvatarSpec(config: AvatarConfig): AvatarSpec {
  const hero = getPart('hero', config.layers.hero?.id ?? 'hero_knight') ?? getPart('hero', 'hero_knight')!;
  const attachments: AttachmentSpec[] = [];
  for (const cat of ['weapon', 'offhand'] as CosmeticCategory[]) {
    const part = getPart(cat, config.layers[cat]?.id ?? '');
    if (part?.modelUrl && part.attachBone) {
      attachments.push({ url: part.modelUrl, bone: part.attachBone });
    }
  }
  return { bg: background(config), heroUrl: hero.modelUrl!, attachments };
}
