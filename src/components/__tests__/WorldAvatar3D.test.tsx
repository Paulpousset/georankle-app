/**
 * WorldAvatar3D nets:
 *  1. Data: the generated layer manifest must stay coherent with cosmetics.ts —
 *     no orphan entries, complete back/front ring pairs, and (once the pack is
 *     rendered) full coverage of every renderable item. Catches "added to the
 *     catalog, forgot the Blender render" at test time, before check_assets.mjs
 *     blocks the ship.
 *  2. Smoke: every catalog part mounts inside <WorldAvatar3D> without throwing,
 *     whichever path it takes (composited layers or whole-avatar SVG fallback).
 */
import { render } from '@testing-library/react-native';

import { WorldAvatar3D, worldAvatar3dReady } from '../WorldAvatar3D';
import { COSMETIC_LAYERS } from '../../data/cosmeticLayers.gen';
import { ALL_PARTS, DEFAULT_AVATAR_CONFIG } from '../../data/cosmetics';
import type { AvatarConfig, CosmeticPart } from '../../types';

function configWith(part: CosmeticPart): AvatarConfig {
  return {
    v: 4,
    useCustom: true,
    layers: {
      ...DEFAULT_AVATAR_CONFIG.layers,
      [part.category]: { id: part.id, tint: part.defaultTint ?? null },
    },
  };
}

const RENDERABLE = ALL_PARTS.filter((p) => !p.id.endsWith('_none') && p.id !== 'cosmos_bluenight');
const packRendered = Object.keys(COSMETIC_LAYERS).length > 0;

describe('cosmeticLayers.gen.ts manifest coherence', () => {
  it('has no entries for unknown catalog ids', () => {
    const known = new Set(ALL_PARTS.map((p) => p.id));
    const orphans = Object.keys(COSMETIC_LAYERS).filter((id) => !known.has(id));
    expect(orphans).toEqual([]);
  });

  it('every ring entry has a complete back/front pair or a single main', () => {
    const broken = Object.entries(COSMETIC_LAYERS)
      .filter(([, src]) => (src.back || src.front) && !(src.back && src.front))
      .map(([id]) => id);
    expect(broken).toEqual([]);
  });

  (packRendered ? it : it.skip)('covers every renderable catalog item once the pack exists', () => {
    const missing = RENDERABLE.filter((p) => {
      const src = COSMETIC_LAYERS[p.id];
      return !src || (!src.main && !(src.back && src.front));
    }).map((p) => p.id);
    expect(missing).toEqual([]);
  });
});

describe('WorldAvatar3D smoke render', () => {
  it.each(ALL_PARTS.map((p) => [p.id, p] as const))('renders with %s equipped', (_id, part) => {
    expect(() => render(<WorldAvatar3D config={configWith(part)} size={100} />)).not.toThrow();
  });

  it('falls back to SVG coherently while the pack is missing layers', () => {
    const cfg = configWith(RENDERABLE[0]);
    // With an empty manifest the config cannot be ready; with a full pack it must be.
    expect(worldAvatar3dReady(cfg)).toBe(packRendered ? true : false);
    expect(() => render(<WorldAvatar3D config={cfg} size={64} round animate />)).not.toThrow();
  });

  it('renders the default config (bluenight cosmos stays procedural)', () => {
    expect(() =>
      render(<WorldAvatar3D config={DEFAULT_AVATAR_CONFIG} size={168} animate />),
    ).not.toThrow();
  });
});
