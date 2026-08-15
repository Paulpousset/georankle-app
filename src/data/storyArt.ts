/**
 * Pre-rendered Blender art for the story map (flag `story_map_3d`).
 *
 * Bands are baked at a 390×1180-logical reference (one biome band = 10 levels,
 * @2x webp) with the river following the SHARED sinusoid: 2 full periods per
 * band (see riverX in StoryMap — phase 2π/5 per row), so a single image per
 * biome tiles the whole 300-level map and always matches the computed node
 * positions. Re-render via asset-pipeline/render_story_kit.py, then convert
 * with asset-pipeline/convert_story.mjs.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- static Metro asset
   requires, same pattern as the generated cosmeticLayers.gen.ts */

/** Logical size a band image maps to (stretched to the on-screen band width). */
export const BAND_ART_W = 390;
export const BAND_ART_H = 1180;

/** Band background per biome key (biomes.ts). */
export const STORY_BAND_ART: Record<string, number> = {
  prairie: require('../../assets/story/band_prairie.webp'),
  desert: require('../../assets/story/band_desert.webp'),
  volcan: require('../../assets/story/band_volcan.webp'),
  glace: require('../../assets/story/band_glace.webp'),
  jungle: require('../../assets/story/band_jungle.webp'),
  archipel: require('../../assets/story/band_archipel.webp'),
  savane: require('../../assets/story/band_savane.webp'),
  cosmos: require('../../assets/story/band_cosmos.webp'),
};

/** Level-medallion sprite per biome key (rim tinted like biome.rim). */
export const STORY_COIN_ART: Record<string, number> = {
  prairie: require('../../assets/story/coin_prairie.webp'),
  desert: require('../../assets/story/coin_desert.webp'),
  volcan: require('../../assets/story/coin_volcan.webp'),
  glace: require('../../assets/story/coin_glace.webp'),
  jungle: require('../../assets/story/coin_jungle.webp'),
  archipel: require('../../assets/story/coin_archipel.webp'),
  savane: require('../../assets/story/coin_savane.webp'),
  cosmos: require('../../assets/story/coin_cosmos.webp'),
};

/** Grey medallion with a baked 3D padlock, for locked levels. */
export const STORY_COIN_LOCKED: number = require('../../assets/story/coin_locked.webp');
