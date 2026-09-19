// Mock AsyncStorage so the pure skin logic can be tested without a native module.
// (The prefs themselves are covered through resolveSkinKey, which is pure.)
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => (k in store ? store[k] : null)),
      setItem: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
      removeItem: jest.fn(async (k: string) => {
        delete store[k];
      }),
      multiGet: jest.fn(async (keys: string[]) => keys.map((k) => [k, store[k] ?? null])),
    },
  };
});

// Only the equipped-cache refresh talks to Supabase; the skin logic under test
// never does, so a bare mock keeps the real client's env requirements out.
jest.mock('../supabase', () => {
  const { makeSupabaseMock } = require('../../../test-utils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

import { GLOBE_STYLES } from '../../components/WorldAvatar';
import { GLOBE_TEXTURES } from '../../data/cosmeticModels.gen';
import { DEFAULT_AVATAR_CONFIG } from '../../data/cosmetics';
import { getMapPalette } from '../../theme/mapPalette';
import type { AvatarConfig } from '../../types';
import {
  DEFAULT_GAME_GLOBE_PREF,
  GLOBE_PARTS,
  buildGameGlobeSkin,
  globeStyleKey,
  isSkinnable,
  partStyleKey,
  resolveSkinKey,
  skinMapPalette,
} from '../globeSkin';

const cfg = (globeId: string): AvatarConfig => ({
  ...DEFAULT_AVATAR_CONFIG,
  layers: { ...DEFAULT_AVATAR_CONFIG.layers, globe: { id: globeId, tint: null } },
});

describe('globeStyleKey', () => {
  it('reads the equipped globe cosmetic', () => {
    expect(globeStyleKey(cfg('globe_lava'))).toBe('lava');
    expect(globeStyleKey(cfg('globe_st_galaxy'))).toBe('st_galaxy');
  });

  it('falls back to classic on a missing/unknown/legacy globe', () => {
    expect(globeStyleKey(null)).toBe('classic');
    expect(globeStyleKey(undefined)).toBe('classic');
    expect(globeStyleKey(cfg('globe_from_a_future_version'))).toBe('classic');
    expect(globeStyleKey({ v: 4, useCustom: true, layers: {} } as unknown as AvatarConfig)).toBe('classic');
  });
});

describe('catalog coverage', () => {
  // A globe with no style table or no texture would render as a bare sphere in
  // game — the whole feature silently degrades, so pin it.
  it('every shop globe has both a style table and an equirect texture', () => {
    expect(GLOBE_PARTS.length).toBeGreaterThan(0);
    for (const part of GLOBE_PARTS) {
      const key = partStyleKey(part);
      expect(GLOBE_STYLES[key]).toBeDefined();
      expect(GLOBE_TEXTURES[key]).toBeDefined();
      expect(isSkinnable(key)).toBe(true);
    }
  });
});

describe('resolveSkinKey', () => {
  const base = DEFAULT_GAME_GLOBE_PREF;

  it('wears the equipped globe', () => {
    expect(resolveSkinKey({ ...base, equipped: 'gaia' })).toBe('gaia');
  });

  it('lets the local test override win over the equipped globe', () => {
    expect(resolveSkinKey({ ...base, equipped: 'gaia', override: 'mars' })).toBe('mars');
  });

  it('never returns null: the free classic Earth is the floor', () => {
    expect(resolveSkinKey(base)).toBe('classic');
  });
});

describe('buildGameGlobeSkin', () => {
  it('picks a light outline on a dark planet and a dark one on a bright planet', () => {
    // night: ocean mid #070d22 (dark) — hologram/lava too.
    expect(buildGameGlobeSkin('night', 'x').line).toBe('rgba(255,255,255,0.62)');
    // vintage: ocean mid #cdb37e (bright parchment).
    expect(buildGameGlobeSkin('vintage', 'x').line).toBe('rgba(24,22,32,0.55)');
  });

  it('leaves the pack art alone except where it is unplayable', () => {
    // The texture already draws the borders on 18 of 20 skins.
    for (const key of ['classic', 'hologram', 'night', 'st_galaxy', 'blueprint']) {
      expect(buildGameGlobeSkin(key, 'x').coat).toBe('none');
    }
    // Eclipse is black on black; Mars has no landmasses at all.
    expect(buildGameGlobeSkin('eclipse', 'x').coat).toBe('outline');
    expect(buildGameGlobeSkin('eclipse', 'x').landCoat).toBeNull();
    expect(buildGameGlobeSkin('mars', 'x').coat).toBe('fill');
    expect(buildGameGlobeSkin('mars', 'x').landCoat).not.toBeNull();
  });

  it('carries the Blender rig, minus the styles with no continents to raise', () => {
    const rig = { landModel: 'land.glb', propsModel: 'props.glb' };
    expect(buildGameGlobeSkin('classic', 'x', rig).landModel).toBe('land.glb');
    expect(buildGameGlobeSkin('classic', 'x', rig).propsModel).toBe('props.glb');
    for (const key of ['mars', 'st_galaxy']) {
      expect(buildGameGlobeSkin(key, 'x', rig).landModel).toBeNull();
    }
    // Borders resolves without the rig at all.
    expect(buildGameGlobeSkin('classic', 'x').landModel).toBeNull();
  });

  it('marks the self-lit styles unlit, like the rig does', () => {
    for (const key of ['night', 'lava', 'hologram', 'cyber', 'biolum', 'eclipse', 'st_galaxy']) {
      expect(buildGameGlobeSkin(key, 'x').unlit).toBe(true);
    }
    for (const key of ['classic', 'vintage', 'gold', 'ice']) {
      expect(buildGameGlobeSkin(key, 'x').unlit).toBe(false);
    }
  });

  it('drops the atmosphere for the skins that have none', () => {
    // vintage/political/blueprint/eclipse carry no `atmo` in GLOBE_STYLES.
    expect(buildGameGlobeSkin('vintage', 'x').atmo).toBeNull();
    expect(buildGameGlobeSkin('vintage', 'x').atmoStrength).toBe(0);
    expect(buildGameGlobeSkin('classic', 'x').atmo).toBe('#6fc0ff');
  });

  it('is defined for every shop globe', () => {
    for (const part of GLOBE_PARTS) {
      const skin = buildGameGlobeSkin(partStyleKey(part), 'uri');
      expect(skin.landInk).toMatch(/^#/);
      expect(skin.ocean).toMatch(/^#/);
      expect(skin.line).toMatch(/^rgba\(/);
      expect(skin.halo).toMatch(/^rgba\(/);
      // Borders draws only the graticule, so every skin must carry one.
      expect(skin.grat).toMatch(/^rgba\(/);
      expect(skin.texture).toBe('uri');
    }
  });
});

describe('skinMapPalette', () => {
  const dark = getMapPalette(true);
  const light = getMapPalette(false);

  it('is a no-op without a skin', () => {
    expect(skinMapPalette(dark, null)).toBe(dark);
    expect(skinMapPalette(light, null)).toBe(light);
  });

  it('never touches the gameplay state colours', () => {
    for (const part of GLOBE_PARTS) {
      for (const pal of [dark, light]) {
        const skinned = skinMapPalette(pal, partStyleKey(part));
        expect(skinned.hovF).toBe(pal.hovF);
        expect(skinned.hovS).toBe(pal.hovS);
        expect(skinned.selF).toBe(pal.selF);
        expect(skinned.selS).toBe(pal.selS);
        expect(skinned.okF).toBe(pal.okF);
        expect(skinned.okS).toBe(pal.okS);
        expect(skinned.badF).toBe(pal.badF);
        expect(skinned.badS).toBe(pal.badS);
      }
    }
  });

  it('repaints the scenery from the skin', () => {
    const p = skinMapPalette(light, 'lava');
    const [lit, , deep] = GLOBE_STYLES.lava.ocean;
    expect(p.ocean0).toBe(lit);
    expect(p.ocean1).toBe(deep);
    expect(p.bg).toBe(deep);
    expect(p.atm).toContain('rgba(');
  });

  it('keeps `dot` an rgba prefix the canvas builders can append an alpha to', () => {
    for (const part of GLOBE_PARTS) {
      const p = skinMapPalette(dark, partStyleKey(part));
      expect(p.dot.endsWith(',')).toBe(true);
      expect(`${p.dot}0.5)`).toMatch(/^rgba\(\d+,\d+,\d+,0\.5\)$/);
    }
  });

  it('gives the wireframe skins a translucent land instead of "none"', () => {
    // GLOBE_STYLES.hologram has land: 'none' — a literal 'none' fill would throw
    // off the canvas builders.
    const p = skinMapPalette(dark, 'hologram');
    expect(p.landF).toMatch(/^rgba\(/);
  });
});
