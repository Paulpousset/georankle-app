import {
  ALL_PARTS,
  RARITY_META,
  LAYER_ORDER,
  DEFAULT_AVATAR_CONFIG,
  getPart,
  getCategoryParts,
  deriveDefaultConfigFromSeed,
  normalizeConfig,
  buildCosmeticPriceRows,
} from '../cosmetics';
import type { AvatarConfig } from '../../types';

describe('catalog lookups', () => {
  it('getCategoryParts returns the parts for a category', () => {
    const globes = getCategoryParts('globe');
    expect(globes.length).toBeGreaterThan(0);
    expect(globes.every((p) => p.category === 'globe')).toBe(true);
  });

  it('getPart finds a known id and returns undefined otherwise', () => {
    expect(getPart('globe', 'globe_classic')?.id).toBe('globe_classic');
    expect(getPart('globe', 'does_not_exist')).toBeUndefined();
  });

  it('every category has exactly one default part', () => {
    for (const cat of LAYER_ORDER) {
      const defaults = getCategoryParts(cat).filter((p) => p.isDefault);
      expect(defaults).toHaveLength(1);
    }
  });
});

describe('deriveDefaultConfigFromSeed', () => {
  it('is deterministic for a given seed', () => {
    expect(deriveDefaultConfigFromSeed('alice')).toEqual(deriveDefaultConfigFromSeed('alice'));
  });

  it('only uses free items (classic earth + a tinted blue cosmos)', () => {
    const cfg = deriveDefaultConfigFromSeed('bob');
    expect(cfg.v).toBe(4);
    expect(cfg.layers.cosmos.id).toBe('cosmos_bluenight');
    expect(cfg.layers.cosmos.tint).toBeTruthy();
    // every chosen layer must reference a real, free part
    for (const cat of LAYER_ORDER) {
      const part = getPart(cat, cfg.layers[cat].id);
      expect(part).toBeDefined();
      expect(part!.price).toBe(0);
    }
  });

  it('handles an empty seed without throwing', () => {
    expect(() => deriveDefaultConfigFromSeed('')).not.toThrow();
  });
});

describe('normalizeConfig', () => {
  it('fills missing slots with defaults', () => {
    const partial = { v: 4, useCustom: true, layers: {} } as unknown as AvatarConfig;
    const result = normalizeConfig(partial);
    for (const cat of LAYER_ORDER) {
      expect(result.layers[cat]).toEqual(DEFAULT_AVATAR_CONFIG.layers[cat]);
    }
  });

  it('drops unknown item ids back to the default', () => {
    const bad = {
      v: 4,
      useCustom: true,
      layers: { ...DEFAULT_AVATAR_CONFIG.layers, globe: { id: 'globe_imaginary', tint: null } },
    } as AvatarConfig;
    expect(normalizeConfig(bad).layers.globe).toEqual(DEFAULT_AVATAR_CONFIG.layers.globe);
  });

  it('keeps valid custom selections and forces v:4', () => {
    const cfg = {
      v: 1,
      useCustom: true,
      layers: { ...DEFAULT_AVATAR_CONFIG.layers, globe: { id: 'globe_gold', tint: null } },
    } as AvatarConfig;
    const result = normalizeConfig(cfg);
    expect(result.v).toBe(4);
    expect(result.layers.globe.id).toBe('globe_gold');
  });

  it('preserves useCustom=false', () => {
    const cfg = { ...DEFAULT_AVATAR_CONFIG, useCustom: false };
    expect(normalizeConfig(cfg).useCustom).toBe(false);
  });
});

describe('buildCosmeticPriceRows (economy source of truth)', () => {
  it('mirrors every catalog part', () => {
    expect(buildCosmeticPriceRows()).toHaveLength(ALL_PARTS.length);
  });

  it('keeps each non-default price aligned with its rarity tier', () => {
    for (const row of buildCosmeticPriceRows()) {
      if (row.is_default) {
        expect(row.price).toBe(0);
      } else {
        expect(row.price).toBe(RARITY_META[row.rarity as keyof typeof RARITY_META].price);
      }
    }
  });
});
