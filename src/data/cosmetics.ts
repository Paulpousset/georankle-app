/**
 * Cosmetic catalog: professional 3D heroes + gear (KayKit Adventurers, CC0)
 * unlocked through the coin shop, plus environment backgrounds and 2D frames.
 *
 * Models load at runtime from the jsdelivr GitHub CDN — no binary assets ship
 * with the app. Prices here are mirrored into the `cosmetic_prices` table (the
 * economic source of truth used by the purchase/equip RPCs); keep them in sync.
 */
import type { AvatarConfig, AvatarLayer, CosmeticCategory, CosmeticPart } from '../types';

const KAYKIT =
  'https://cdn.jsdelivr.net/gh/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures';

const heroUrl = (name: string) => `${KAYKIT}/Characters/gltf/${name}.glb`;
const gearUrl = (name: string) => `${KAYKIT}/Assets/gltf/${name}.gltf`;
const sampleUrl = (name: string) => `${KAYKIT}/Samples/${name}.png`;

/** Selection/order of the editor tabs and shop sections. */
export const LAYER_ORDER: CosmeticCategory[] = ['hero', 'weapon', 'offhand', 'background', 'frame'];

/** Tint swatch palettes offered in the editor (backgrounds only). */
export const TINT_PALETTES: Partial<Record<CosmeticCategory, string[]>> = {
  background: ['#e8d9b8', '#1a2a44', '#c04a1a', '#1a6e5a', '#5a3a7a', '#2a6e3f'],
};

const CATALOG: Record<CosmeticCategory, CosmeticPart[]> = {
  hero: [
    {
      id: 'hero_knight', category: 'hero', price: 0, isDefault: true,
      nameFr: 'Chevalier', nameEn: 'Knight', tintable: false,
      modelUrl: heroUrl('Knight'), thumbUrl: sampleUrl('knight'),
    },
    {
      id: 'hero_mage', category: 'hero', price: 400, isDefault: false,
      nameFr: 'Mage', nameEn: 'Mage', tintable: false,
      modelUrl: heroUrl('Mage'), thumbUrl: sampleUrl('mage'),
    },
    {
      id: 'hero_barbarian', category: 'hero', price: 400, isDefault: false,
      nameFr: 'Barbare', nameEn: 'Barbarian', tintable: false,
      modelUrl: heroUrl('Barbarian'), thumbUrl: sampleUrl('barbarian'),
    },
    {
      id: 'hero_rogue', category: 'hero', price: 400, isDefault: false,
      nameFr: 'Rôdeuse', nameEn: 'Rogue', tintable: false,
      modelUrl: heroUrl('Rogue'), thumbUrl: sampleUrl('rogue'),
    },
    {
      id: 'hero_rogue_hooded', category: 'hero', price: 550, isDefault: false,
      nameFr: 'Rôdeuse encapuchonnée', nameEn: 'Hooded Rogue', tintable: false,
      modelUrl: heroUrl('Rogue_Hooded'), thumbUrl: sampleUrl('rogue'),
    },
  ],

  weapon: [
    {
      id: 'weapon_none', category: 'weapon', price: 0, isDefault: true,
      nameFr: 'Aucune', nameEn: 'None', tintable: false,
    },
    {
      id: 'weapon_sword_1h', category: 'weapon', price: 120, isDefault: false,
      nameFr: 'Épée', nameEn: 'Sword', tintable: false,
      modelUrl: gearUrl('sword_1handed'), attachBone: 'handslotr',
    },
    {
      id: 'weapon_dagger', category: 'weapon', price: 100, isDefault: false,
      nameFr: 'Dague', nameEn: 'Dagger', tintable: false,
      modelUrl: gearUrl('dagger'), attachBone: 'handslotr',
    },
    {
      id: 'weapon_axe_1h', category: 'weapon', price: 140, isDefault: false,
      nameFr: 'Hache', nameEn: 'Axe', tintable: false,
      modelUrl: gearUrl('axe_1handed'), attachBone: 'handslotr',
    },
    {
      id: 'weapon_wand', category: 'weapon', price: 150, isDefault: false,
      nameFr: 'Baguette', nameEn: 'Wand', tintable: false,
      modelUrl: gearUrl('wand'), attachBone: 'handslotr',
    },
    {
      id: 'weapon_staff', category: 'weapon', price: 180, isDefault: false,
      nameFr: 'Bâton', nameEn: 'Staff', tintable: false,
      modelUrl: gearUrl('staff'), attachBone: 'handslotr',
    },
    {
      id: 'weapon_crossbow', category: 'weapon', price: 200, isDefault: false,
      nameFr: 'Arbalète', nameEn: 'Crossbow', tintable: false,
      modelUrl: gearUrl('crossbow_1handed'), attachBone: 'handslotr',
    },
    {
      id: 'weapon_sword_2h', category: 'weapon', price: 220, isDefault: false,
      nameFr: 'Épée à deux mains', nameEn: 'Greatsword', tintable: false,
      modelUrl: gearUrl('sword_2handed_color'), attachBone: 'handslotr',
    },
    {
      id: 'weapon_axe_2h', category: 'weapon', price: 240, isDefault: false,
      nameFr: 'Hache de guerre', nameEn: 'Battleaxe', tintable: false,
      modelUrl: gearUrl('axe_2handed'), attachBone: 'handslotr',
    },
    {
      id: 'weapon_mug', category: 'weapon', price: 80, isDefault: false,
      nameFr: 'Chope', nameEn: 'Mug', tintable: false,
      modelUrl: gearUrl('mug_full'), attachBone: 'handslotr',
    },
  ],

  offhand: [
    {
      id: 'offhand_none', category: 'offhand', price: 0, isDefault: true,
      nameFr: 'Aucun', nameEn: 'None', tintable: false,
    },
    {
      id: 'offhand_shield_round', category: 'offhand', price: 150, isDefault: false,
      nameFr: 'Bouclier rond', nameEn: 'Round shield', tintable: false,
      modelUrl: gearUrl('shield_round_color'), attachBone: 'handslotl',
    },
    {
      id: 'offhand_shield_square', category: 'offhand', price: 150, isDefault: false,
      nameFr: 'Bouclier carré', nameEn: 'Square shield', tintable: false,
      modelUrl: gearUrl('shield_square_color'), attachBone: 'handslotl',
    },
    {
      id: 'offhand_shield_badge', category: 'offhand', price: 180, isDefault: false,
      nameFr: 'Bouclier blason', nameEn: 'Badge shield', tintable: false,
      modelUrl: gearUrl('shield_badge_color'), attachBone: 'handslotl',
    },
    {
      id: 'offhand_shield_spikes', category: 'offhand', price: 220, isDefault: false,
      nameFr: 'Bouclier à pointes', nameEn: 'Spiked shield', tintable: false,
      modelUrl: gearUrl('shield_spikes_color'), attachBone: 'handslotl',
    },
    {
      id: 'offhand_spellbook', category: 'offhand', price: 180, isDefault: false,
      nameFr: 'Grimoire', nameEn: 'Spellbook', tintable: false,
      modelUrl: gearUrl('spellbook_open'), attachBone: 'handslotl',
    },
  ],

  background: [
    { id: 'bg_parchment', category: 'background', price: 0, isDefault: true, nameFr: 'Parchemin', nameEn: 'Parchment', tintable: true, defaultTint: '#e8d9b8', swatch: '#e8d9b8' },
    { id: 'bg_solid', category: 'background', price: 80, isDefault: false, nameFr: 'Uni', nameEn: 'Solid', tintable: true, defaultTint: '#2a6e3f', swatch: '#2a6e3f' },
    { id: 'bg_night', category: 'background', price: 120, isDefault: false, nameFr: 'Nuit étoilée', nameEn: 'Starry night', tintable: false, swatch: '#10203f' },
    { id: 'bg_sunset', category: 'background', price: 150, isDefault: false, nameFr: 'Coucher de soleil', nameEn: 'Sunset', tintable: false, swatch: '#f0894a' },
    { id: 'bg_ocean', category: 'background', price: 150, isDefault: false, nameFr: 'Océan', nameEn: 'Ocean', tintable: false, swatch: '#2a8fd0' },
    { id: 'bg_space', category: 'background', price: 200, isDefault: false, nameFr: 'Espace', nameEn: 'Space', tintable: false, swatch: '#0b0d22' },
    { id: 'bg_grid', category: 'background', price: 220, isDefault: false, nameFr: 'Grille néon', nameEn: 'Neon grid', tintable: false, swatch: '#50e0ff' },
  ],

  frame: [
    { id: 'frame_none', category: 'frame', price: 0, isDefault: true, nameFr: 'Aucun', nameEn: 'None', tintable: false },
    { id: 'frame_bronze', category: 'frame', price: 100, isDefault: false, nameFr: 'Bronze', nameEn: 'Bronze', tintable: false, swatch: '#cd7f32' },
    { id: 'frame_silver', category: 'frame', price: 180, isDefault: false, nameFr: 'Argent', nameEn: 'Silver', tintable: false, swatch: '#c8d0d8' },
    { id: 'frame_gold', category: 'frame', price: 250, isDefault: false, nameFr: 'Or', nameEn: 'Gold', tintable: false, swatch: '#ffd700' },
    { id: 'frame_emerald', category: 'frame', price: 320, isDefault: false, nameFr: 'Émeraude', nameEn: 'Emerald', tintable: false, swatch: '#1fae6b' },
    { id: 'frame_neon', category: 'frame', price: 400, isDefault: false, nameFr: 'Néon', nameEn: 'Neon', tintable: false, swatch: '#80f0ff' },
  ],
};

// ── Lookups ──────────────────────────────────────────────────────────────────

export const ALL_PARTS: CosmeticPart[] = LAYER_ORDER.flatMap((cat) => CATALOG[cat]);

export function getCategoryParts(category: CosmeticCategory): CosmeticPart[] {
  return CATALOG[category];
}

export function getPart(category: CosmeticCategory, id: string): CosmeticPart | undefined {
  return CATALOG[category].find((p) => p.id === id);
}

function defaultPartId(category: CosmeticCategory): string {
  return (CATALOG[category].find((p) => p.isDefault) ?? CATALOG[category][0]).id;
}

/** The free starter look — Knight, no gear, parchment environment. */
export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  v: 3,
  useCustom: true,
  layers: LAYER_ORDER.reduce((acc, cat) => {
    const part = getPart(cat, defaultPartId(cat));
    acc[cat] = { id: part!.id, tint: part!.defaultTint ?? null };
    return acc;
  }, {} as Record<CosmeticCategory, AvatarLayer>),
};

// ── Deterministic default from a seed (username/userId) ───────────────────────

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
}

/**
 * Legacy users without a saved config get the free Knight with a personal
 * background tint derived from their name (only free items are used).
 */
export function deriveDefaultConfigFromSeed(seed: string): AvatarConfig {
  const h = hashString(seed || '?');
  const palette = TINT_PALETTES.background!;
  const layers = { ...DEFAULT_AVATAR_CONFIG.layers } as Record<CosmeticCategory, AvatarLayer>;
  layers.background = { id: 'bg_parchment', tint: palette[h % palette.length] };
  return { v: 3, useCustom: true, layers };
}

/**
 * Ensure every slot exists and drop legacy (pre-hero) categories so configs
 * saved by older versions keep validating server-side.
 */
export function normalizeConfig(config: AvatarConfig): AvatarConfig {
  const layers = {} as Record<CosmeticCategory, AvatarLayer>;
  for (const cat of LAYER_ORDER) {
    const existing = config.layers?.[cat];
    layers[cat] = existing && getPart(cat, existing.id) ? existing : DEFAULT_AVATAR_CONFIG.layers[cat];
  }
  return { v: 3, useCustom: config.useCustom !== false, layers };
}

/** Seed rows for the cosmetic_prices table (economic source of truth). */
export function buildCosmeticPriceRows(): { item_id: string; category: string; price: number; is_default: boolean }[] {
  return ALL_PARTS.map((p) => ({
    item_id: p.id,
    category: p.category,
    price: p.price,
    is_default: p.isDefault,
  }));
}
