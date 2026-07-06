/**
 * Cosmetic catalog: a fully geographic "World" identity — a procedural SVG globe
 * on a cosmos backdrop, ringed by an orbit, accompanied by a landmark emblem and
 * an orbiting satellite. Everything renders in SVG/Text via <WorldAvatar>; no 3D
 * models, no CDN, no binary assets.
 *
 * Prices derive from each item's rarity tier (see RARITY_META) and are mirrored
 * into the `cosmetic_prices` table (the economic source of truth used by the
 * purchase/equip RPCs). Keep them in sync.
 */
import type { AvatarConfig, AvatarLayer, CosmeticBundle, CosmeticCategory, CosmeticPart, Rarity } from '../types';

/** Rarity tiers: badge colour + base price (aspirational scale). */
export const RARITY_META: Record<Rarity, { color: string; price: number; labelFr: string; labelEn: string }> = {
  common:    { color: '#8b97a3', price: 50,   labelFr: 'Commun',     labelEn: 'Common' },
  uncommon:  { color: '#3fae5a', price: 150,  labelFr: 'Peu commun', labelEn: 'Uncommon' },
  rare:      { color: '#2f86ff', price: 400,  labelFr: 'Rare',       labelEn: 'Rare' },
  epic:      { color: '#a458ff', price: 800,  labelFr: 'Épique',     labelEn: 'Epic' },
  legendary: { color: '#ffb02e', price: 1500, labelFr: 'Légendaire', labelEn: 'Legendary' },
};

/** Sort key so shop sections list items by ascending rarity. */
export const RARITY_ORDER: Record<Rarity, number> = {
  common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4,
};

/** Selection/order of the editor tabs and shop sections (back → front render order). */
export const LAYER_ORDER: CosmeticCategory[] = ['cosmos', 'globe', 'orbit', 'emblem', 'satellite'];

/** Tint swatch palettes offered in the editor (cosmos only). */
export const TINT_PALETTES: Partial<Record<CosmeticCategory, string[]>> = {
  cosmos: ['#0b1230', '#101a3a', '#1a1030', '#0a2030', '#201020', '#10202a'],
};

const CATALOG: Record<CosmeticCategory, CosmeticPart[]> = {
  // ── COSMOS — the backdrop behind the globe ───────────────────────────────────
  cosmos: [
    { id: 'cosmos_bluenight', category: 'cosmos', price: 0, isDefault: true, rarity: 'common', nameFr: 'Bleu nuit', nameEn: 'Deep blue night', tintable: true, defaultTint: '#0b1230', cosmosStyle: 'gradient', swatch: '#0b1230' },
    { id: 'cosmos_starfield', category: 'cosmos', price: RARITY_META.common.price, isDefault: false, rarity: 'common', nameFr: "Champ d'étoiles", nameEn: 'Starfield', tintable: false, cosmosStyle: 'stars', swatch: '#070a1c' },
    { id: 'cosmos_sunrise', category: 'cosmos', price: RARITY_META.uncommon.price, isDefault: false, rarity: 'uncommon', nameFr: 'Lever de soleil orbital', nameEn: 'Orbital sunrise', tintable: false, cosmosStyle: 'sunrise', swatch: '#f0894a' },
    { id: 'cosmos_aurora', category: 'cosmos', price: RARITY_META.rare.price, isDefault: false, rarity: 'rare', nameFr: 'Aurore boréale', nameEn: 'Aurora borealis', tintable: false, cosmosStyle: 'aurora', swatch: '#1fae8b' },
    { id: 'cosmos_milkyway', category: 'cosmos', price: RARITY_META.epic.price, isDefault: false, rarity: 'epic', nameFr: 'Voie lactée', nameEn: 'Milky Way', tintable: false, cosmosStyle: 'milkyway', swatch: '#2a1a4a' },
    { id: 'cosmos_nebula', category: 'cosmos', price: RARITY_META.epic.price, isDefault: false, rarity: 'epic', nameFr: 'Nébuleuse', nameEn: 'Nebula', tintable: false, cosmosStyle: 'nebula', swatch: '#7a1a6a' },
    { id: 'cosmos_meteors', category: 'cosmos', price: RARITY_META.legendary.price, isDefault: false, rarity: 'legendary', nameFr: 'Pluie de météores', nameEn: 'Meteor shower', tintable: false, cosmosStyle: 'meteors', swatch: '#101030' },
    // ── Vague "Boutique 2.0" (2026-07) ──
    { id: 'cosmos_constellation', category: 'cosmos', price: RARITY_META.rare.price, isDefault: false, rarity: 'rare', nameFr: 'Constellations', nameEn: 'Constellations', tintable: false, cosmosStyle: 'constellation', swatch: '#0b1430', addedAt: '2026-07-02' },
    { id: 'cosmos_goldrain', category: 'cosmos', price: RARITY_META.rare.price, isDefault: false, rarity: 'rare', nameFr: 'Pluie dorée', nameEn: 'Golden rain', tintable: false, cosmosStyle: 'goldrain', swatch: '#141024', addedAt: '2026-07-02' },
    { id: 'cosmos_galaxy', category: 'cosmos', price: RARITY_META.epic.price, isDefault: false, rarity: 'epic', nameFr: 'Galaxie spirale', nameEn: 'Spiral galaxy', tintable: false, cosmosStyle: 'galaxy', swatch: '#140f2e', addedAt: '2026-07-02' },
    { id: 'cosmos_solareclipse', category: 'cosmos', price: RARITY_META.epic.price, isDefault: false, rarity: 'epic', nameFr: 'Éclipse solaire', nameEn: 'Solar eclipse', tintable: false, cosmosStyle: 'solareclipse', swatch: '#241436', addedAt: '2026-07-02' },
    { id: 'cosmos_supernova', category: 'cosmos', price: RARITY_META.legendary.price, isDefault: false, rarity: 'legendary', nameFr: 'Supernova', nameEn: 'Supernova', tintable: false, cosmosStyle: 'supernova', swatch: '#2a1030', addedAt: '2026-07-02' },
    { id: 'cosmos_blackhole', category: 'cosmos', price: RARITY_META.legendary.price, isDefault: false, rarity: 'legendary', nameFr: 'Trou noir', nameEn: 'Black hole', tintable: false, cosmosStyle: 'blackhole', swatch: '#0c0a14', addedAt: '2026-07-02' },
  ],

  // ── GLOBE — the planet/map skin ──────────────────────────────────────────────
  globe: [
    { id: 'globe_classic', category: 'globe', price: 0, isDefault: true, rarity: 'common', nameFr: 'Terre classique', nameEn: 'Classic Earth', tintable: false, globeStyle: 'classic' },
    { id: 'globe_political', category: 'globe', price: RARITY_META.uncommon.price, isDefault: false, rarity: 'uncommon', nameFr: 'Carte politique', nameEn: 'Political map', tintable: false, globeStyle: 'political' },
    { id: 'globe_relief', category: 'globe', price: RARITY_META.uncommon.price, isDefault: false, rarity: 'uncommon', nameFr: 'Relief topographique', nameEn: 'Topographic relief', tintable: false, globeStyle: 'relief' },
    { id: 'globe_vintage', category: 'globe', price: RARITY_META.rare.price, isDefault: false, rarity: 'rare', nameFr: 'Carte vintage', nameEn: 'Vintage map', tintable: false, globeStyle: 'vintage' },
    { id: 'globe_satellite', category: 'globe', price: RARITY_META.rare.price, isDefault: false, rarity: 'rare', nameFr: 'Blue Marble', nameEn: 'Blue Marble', tintable: false, globeStyle: 'satellite' },
    { id: 'globe_night', category: 'globe', price: RARITY_META.epic.price, isDefault: false, rarity: 'epic', nameFr: 'Lumières nocturnes', nameEn: 'Night lights', tintable: false, globeStyle: 'night' },
    { id: 'globe_hologram', category: 'globe', price: RARITY_META.epic.price, isDefault: false, rarity: 'epic', nameFr: 'Globe hologramme', nameEn: 'Hologram globe', tintable: false, globeStyle: 'hologram' },
    { id: 'globe_gold', category: 'globe', price: RARITY_META.legendary.price, isDefault: false, rarity: 'legendary', nameFr: "Planète d'or", nameEn: 'Golden planet', tintable: false, globeStyle: 'gold' },
    { id: 'globe_gaia', category: 'globe', price: RARITY_META.legendary.price, isDefault: false, rarity: 'legendary', nameFr: 'Terre Gaïa', nameEn: 'Gaia Earth', tintable: false, globeStyle: 'gaia' },
    // ── Vague "Boutique 2.0" (2026-07) ──
    { id: 'globe_pastel', category: 'globe', price: RARITY_META.uncommon.price, isDefault: false, rarity: 'uncommon', nameFr: 'Pastel', nameEn: 'Pastel', tintable: false, globeStyle: 'pastel', addedAt: '2026-07-02' },
    { id: 'globe_mars', category: 'globe', price: RARITY_META.rare.price, isDefault: false, rarity: 'rare', nameFr: 'Mars', nameEn: 'Mars', tintable: false, globeStyle: 'mars', addedAt: '2026-07-02' },
    { id: 'globe_ice', category: 'globe', price: RARITY_META.rare.price, isDefault: false, rarity: 'rare', nameFr: 'Planète glacée', nameEn: 'Ice planet', tintable: false, globeStyle: 'ice', addedAt: '2026-07-02' },
    { id: 'globe_blueprint', category: 'globe', price: RARITY_META.rare.price, isDefault: false, rarity: 'rare', nameFr: 'Blueprint', nameEn: 'Blueprint', tintable: false, globeStyle: 'blueprint', addedAt: '2026-07-02' },
    { id: 'globe_lava', category: 'globe', price: RARITY_META.epic.price, isDefault: false, rarity: 'epic', nameFr: 'Monde de lave', nameEn: 'Lava world', tintable: false, globeStyle: 'lava', addedAt: '2026-07-02' },
    { id: 'globe_cyber', category: 'globe', price: RARITY_META.epic.price, isDefault: false, rarity: 'epic', nameFr: 'Cyber-monde', nameEn: 'Cyber world', tintable: false, globeStyle: 'cyber', addedAt: '2026-07-02' },
    { id: 'globe_eclipse', category: 'globe', price: RARITY_META.legendary.price, isDefault: false, rarity: 'legendary', nameFr: 'Éclipse', nameEn: 'Eclipse', tintable: false, globeStyle: 'eclipse', addedAt: '2026-07-02' },
    { id: 'globe_biolum', category: 'globe', price: RARITY_META.legendary.price, isDefault: false, rarity: 'legendary', nameFr: 'Bioluminescente', nameEn: 'Bioluminescent', tintable: false, globeStyle: 'biolum', addedAt: '2026-07-02' },
  ],

  // ── ORBIT — the ring around the globe ────────────────────────────────────────
  orbit: [
    { id: 'orbit_none', category: 'orbit', price: 0, isDefault: true, rarity: 'common', nameFr: 'Aucun', nameEn: 'None', tintable: false, orbitStyle: 'none' },
    { id: 'orbit_meridian', category: 'orbit', price: RARITY_META.common.price, isDefault: false, rarity: 'common', nameFr: 'Méridien bronze', nameEn: 'Bronze meridian', tintable: false, orbitStyle: 'meridian', swatch: '#cd7f32' },
    { id: 'orbit_graticule', category: 'orbit', price: RARITY_META.uncommon.price, isDefault: false, rarity: 'uncommon', nameFr: 'Graticule argent', nameEn: 'Silver graticule', tintable: false, orbitStyle: 'graticule', swatch: '#c8d0d8' },
    { id: 'orbit_compass', category: 'orbit', price: RARITY_META.rare.price, isDefault: false, rarity: 'rare', nameFr: 'Rose des vents', nameEn: 'Compass rose', tintable: false, orbitStyle: 'compass', swatch: '#ffd700' },
    { id: 'orbit_neon', category: 'orbit', price: RARITY_META.epic.price, isDefault: false, rarity: 'epic', nameFr: 'Anneau néon', nameEn: 'Neon ring', tintable: false, orbitStyle: 'neon', swatch: '#80f0ff' },
    { id: 'orbit_asteroids', category: 'orbit', price: RARITY_META.legendary.price, isDefault: false, rarity: 'legendary', nameFr: "Ceinture d'astéroïdes", nameEn: 'Asteroid belt', tintable: false, orbitStyle: 'asteroids', swatch: '#9a8a6a' },
    // ── Vague "Boutique 2.0" (2026-07) ──
    { id: 'orbit_ice', category: 'orbit', price: RARITY_META.uncommon.price, isDefault: false, rarity: 'uncommon', nameFr: 'Anneau glacé', nameEn: 'Ice ring', tintable: false, orbitStyle: 'iceRing', swatch: '#bfe4f5', addedAt: '2026-07-02' },
    { id: 'orbit_double', category: 'orbit', price: RARITY_META.rare.price, isDefault: false, rarity: 'rare', nameFr: 'Double orbite', nameEn: 'Double orbit', tintable: false, orbitStyle: 'double', swatch: '#8fb8ff', addedAt: '2026-07-02' },
    { id: 'orbit_fireflies', category: 'orbit', price: RARITY_META.rare.price, isDefault: false, rarity: 'rare', nameFr: 'Lucioles', nameEn: 'Fireflies', tintable: false, orbitStyle: 'fireflies', swatch: '#d8ff5a', addedAt: '2026-07-02' },
    { id: 'orbit_saturn', category: 'orbit', price: RARITY_META.epic.price, isDefault: false, rarity: 'epic', nameFr: 'Anneaux de Saturne', nameEn: 'Saturn rings', tintable: false, orbitStyle: 'saturn', swatch: '#f0d8a8', addedAt: '2026-07-02' },
    { id: 'orbit_rainbow', category: 'orbit', price: RARITY_META.epic.price, isDefault: false, rarity: 'epic', nameFr: 'Arc-en-ciel', nameEn: 'Rainbow', tintable: false, orbitStyle: 'rainbow', swatch: '#ffb02e', addedAt: '2026-07-02' },
    { id: 'orbit_fire', category: 'orbit', price: RARITY_META.legendary.price, isDefault: false, rarity: 'legendary', nameFr: 'Anneau de feu', nameEn: 'Ring of fire', tintable: false, orbitStyle: 'fire', swatch: '#ff6a2a', addedAt: '2026-07-02' },
  ],

  // ── EMBLEM — a landmark glyph beside the globe ───────────────────────────────
  emblem: [
    { id: 'emblem_none', category: 'emblem', price: 0, isDefault: true, rarity: 'common', nameFr: 'Aucun', nameEn: 'None', tintable: false },
    { id: 'emblem_compass', category: 'emblem', price: RARITY_META.common.price, isDefault: false, rarity: 'common', nameFr: 'Boussole', nameEn: 'Compass', tintable: false, glyph: '🧭' },
    { id: 'emblem_eiffel', category: 'emblem', price: RARITY_META.uncommon.price, isDefault: false, rarity: 'uncommon', nameFr: 'Tour Eiffel', nameEn: 'Eiffel Tower', tintable: false, glyph: '🗼' },
    { id: 'emblem_pyramids', category: 'emblem', price: RARITY_META.uncommon.price, isDefault: false, rarity: 'uncommon', nameFr: 'Pyramides de Gizeh', nameEn: 'Pyramids of Giza', tintable: false, glyph: '🛕' },
    { id: 'emblem_liberty', category: 'emblem', price: RARITY_META.rare.price, isDefault: false, rarity: 'rare', nameFr: 'Statue de la Liberté', nameEn: 'Statue of Liberty', tintable: false, glyph: '🗽' },
    { id: 'emblem_bigben', category: 'emblem', price: RARITY_META.rare.price, isDefault: false, rarity: 'rare', nameFr: 'Big Ben', nameEn: 'Big Ben', tintable: false, glyph: '🕰️' },
    { id: 'emblem_fuji', category: 'emblem', price: RARITY_META.epic.price, isDefault: false, rarity: 'epic', nameFr: 'Mont Fuji', nameEn: 'Mount Fuji', tintable: false, glyph: '🗻' },
    { id: 'emblem_christ', category: 'emblem', price: RARITY_META.epic.price, isDefault: false, rarity: 'epic', nameFr: 'Christ Rédempteur', nameEn: 'Christ the Redeemer', tintable: false, glyph: '⛪' },
    { id: 'emblem_taj', category: 'emblem', price: RARITY_META.legendary.price, isDefault: false, rarity: 'legendary', nameFr: 'Taj Mahal', nameEn: 'Taj Mahal', tintable: false, glyph: '🕌' },
    { id: 'emblem_colosseum', category: 'emblem', price: RARITY_META.legendary.price, isDefault: false, rarity: 'legendary', nameFr: 'Colisée', nameEn: 'Colosseum', tintable: false, glyph: '🏛️' },
    // ── Vague "Boutique 2.0" (2026-07) ──
    { id: 'emblem_windmill', category: 'emblem', price: RARITY_META.uncommon.price, isDefault: false, rarity: 'uncommon', nameFr: 'Moulin hollandais', nameEn: 'Dutch windmill', tintable: false, addedAt: '2026-07-02' },
    { id: 'emblem_pisa', category: 'emblem', price: RARITY_META.rare.price, isDefault: false, rarity: 'rare', nameFr: 'Tour de Pise', nameEn: 'Leaning Tower of Pisa', tintable: false, addedAt: '2026-07-02' },
    { id: 'emblem_moai', category: 'emblem', price: RARITY_META.rare.price, isDefault: false, rarity: 'rare', nameFr: 'Moaï', nameEn: 'Moai', tintable: false, addedAt: '2026-07-02' },
    { id: 'emblem_goldengate', category: 'emblem', price: RARITY_META.epic.price, isDefault: false, rarity: 'epic', nameFr: 'Golden Gate', nameEn: 'Golden Gate', tintable: false, addedAt: '2026-07-02' },
    { id: 'emblem_sydney', category: 'emblem', price: RARITY_META.epic.price, isDefault: false, rarity: 'epic', nameFr: 'Opéra de Sydney', nameEn: 'Sydney Opera House', tintable: false, addedAt: '2026-07-02' },
    { id: 'emblem_greatwall', category: 'emblem', price: RARITY_META.legendary.price, isDefault: false, rarity: 'legendary', nameFr: 'Grande Muraille', nameEn: 'Great Wall', tintable: false, addedAt: '2026-07-02' },
  ],

  // ── SATELLITE — a small element in orbit ─────────────────────────────────────
  satellite: [
    { id: 'sat_none', category: 'satellite', price: 0, isDefault: true, rarity: 'common', nameFr: 'Aucun', nameEn: 'None', tintable: false },
    { id: 'sat_moon', category: 'satellite', price: RARITY_META.common.price, isDefault: false, rarity: 'common', nameFr: 'Lune', nameEn: 'Moon', tintable: false, glyph: '🌙' },
    { id: 'sat_plane', category: 'satellite', price: RARITY_META.uncommon.price, isDefault: false, rarity: 'uncommon', nameFr: 'Avion', nameEn: 'Airplane', tintable: false, glyph: '✈️' },
    { id: 'sat_balloon', category: 'satellite', price: RARITY_META.uncommon.price, isDefault: false, rarity: 'uncommon', nameFr: 'Montgolfière', nameEn: 'Hot-air balloon', tintable: false, glyph: '🎈' },
    { id: 'sat_satellite', category: 'satellite', price: RARITY_META.rare.price, isDefault: false, rarity: 'rare', nameFr: 'Satellite', nameEn: 'Satellite', tintable: false, glyph: '🛰️' },
    { id: 'sat_iss', category: 'satellite', price: RARITY_META.epic.price, isDefault: false, rarity: 'epic', nameFr: 'Station ISS', nameEn: 'Space station', tintable: false, glyph: '🛸' },
    { id: 'sat_comet', category: 'satellite', price: RARITY_META.legendary.price, isDefault: false, rarity: 'legendary', nameFr: 'Comète', nameEn: 'Comet', tintable: false, glyph: '☄️' },
    // ── Vague "Boutique 2.0" (2026-07) ──
    { id: 'sat_paperplane', category: 'satellite', price: RARITY_META.uncommon.price, isDefault: false, rarity: 'uncommon', nameFr: 'Avion en papier', nameEn: 'Paper plane', tintable: false, addedAt: '2026-07-02' },
    { id: 'sat_bird', category: 'satellite', price: RARITY_META.uncommon.price, isDefault: false, rarity: 'uncommon', nameFr: 'Oiseau migrateur', nameEn: 'Migrating bird', tintable: false, addedAt: '2026-07-02' },
    { id: 'sat_rocket', category: 'satellite', price: RARITY_META.rare.price, isDefault: false, rarity: 'rare', nameFr: 'Fusée', nameEn: 'Rocket', tintable: false, addedAt: '2026-07-02' },
    { id: 'sat_ufo', category: 'satellite', price: RARITY_META.epic.price, isDefault: false, rarity: 'epic', nameFr: 'OVNI', nameEn: 'UFO', tintable: false, addedAt: '2026-07-02' },
    { id: 'sat_shootingstar', category: 'satellite', price: RARITY_META.legendary.price, isDefault: false, rarity: 'legendary', nameFr: 'Étoile filante', nameEn: 'Shooting star', tintable: false, addedAt: '2026-07-02' },
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

/** The free starter look — classic Earth on a deep-blue cosmos, no ring/emblem/satellite. */
export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  v: 4,
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
 * Users without a saved config get the free classic Earth with a personal cosmos
 * tint derived from their name (only free items are used).
 */
export function deriveDefaultConfigFromSeed(seed: string): AvatarConfig {
  const h = hashString(seed || '?');
  const palette = TINT_PALETTES.cosmos!;
  const layers = { ...DEFAULT_AVATAR_CONFIG.layers } as Record<CosmeticCategory, AvatarLayer>;
  layers.cosmos = { id: 'cosmos_bluenight', tint: palette[h % palette.length] };
  return { v: 4, useCustom: true, layers };
}

/**
 * Ensure every slot exists and drop legacy categories so configs saved by older
 * versions keep validating server-side (legacy fantasy slots fall back to the
 * new World defaults).
 */
export function normalizeConfig(config: AvatarConfig): AvatarConfig {
  const layers = {} as Record<CosmeticCategory, AvatarLayer>;
  for (const cat of LAYER_ORDER) {
    const existing = config.layers?.[cat];
    layers[cat] = existing && getPart(cat, existing.id) ? existing : DEFAULT_AVATAR_CONFIG.layers[cat];
  }
  return { v: 4, useCustom: config.useCustom !== false, layers };
}

/** Seed rows for the cosmetic_prices table (economic source of truth). */
export function buildCosmeticPriceRows(): { item_id: string; category: string; price: number; is_default: boolean; rarity: string }[] {
  return ALL_PARTS.map((p) => ({
    item_id: p.id,
    category: p.category,
    price: p.price,
    is_default: p.isDefault,
    rarity: p.rarity,
  }));
}

// ── Boutique 2.0 : badge NEW, vitrine du jour, packs ──────────────────────────

/** Days an item keeps its "NEW" badge after being added to the catalog. */
export const NEW_BADGE_DAYS = 14;

export function isNewPart(part: CosmeticPart, now: Date = new Date()): boolean {
  if (!part.addedAt) return false;
  const age = now.getTime() - new Date(part.addedAt + 'T00:00:00Z').getTime();
  return age >= 0 && age < NEW_BADGE_DAYS * 24 * 3600 * 1000;
}

/** Featured-item discount, mirrored by get_featured_cosmetic() server-side. */
export const FEATURED_DISCOUNT = 0.3;

/**
 * Discounted packs sold in the shop. Mirrored into the `cosmetic_bundles` table
 * (the economic source of truth used by the purchase_bundle RPC) — keep in sync.
 * Prices are ~30% below the sum of the items' individual prices.
 */
export const BUNDLES: CosmeticBundle[] = [
  {
    id: 'bundle_solar',
    nameFr: 'Pack Système solaire',
    nameEn: 'Solar System pack',
    itemIds: ['globe_mars', 'orbit_saturn', 'cosmos_galaxy'],
    price: 1400, // 400 + 800 + 800 = 2000
  },
  {
    id: 'bundle_fireice',
    nameFr: 'Pack Feu & Glace',
    nameEn: 'Fire & Ice pack',
    itemIds: ['globe_lava', 'orbit_fire', 'globe_ice', 'orbit_ice'],
    price: 2000, // 800 + 1500 + 400 + 150 = 2850
  },
  {
    id: 'bundle_wonders',
    nameFr: 'Pack Merveilles du monde',
    nameEn: 'World Wonders pack',
    itemIds: ['emblem_moai', 'emblem_goldengate', 'emblem_sydney'],
    price: 1400, // 400 + 800 + 800 = 2000
  },
];

export function getBundle(id: string): CosmeticBundle | undefined {
  return BUNDLES.find((b) => b.id === id);
}

/** Seed rows for the cosmetic_bundles table. */
export function buildBundleRows(): { bundle_id: string; item_ids: string[]; price: number }[] {
  return BUNDLES.map((b) => ({ bundle_id: b.id, item_ids: b.itemIds, price: b.price }));
}
