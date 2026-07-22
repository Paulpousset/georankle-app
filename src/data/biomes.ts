/**
 * Story-map biomes — a themed region every 10 levels (palier), cycling.
 *
 * The winding route on the map IS a river; each biome recolours the banks +
 * river + level medallions and brings its own scattered decoration and a big
 * background "feature" silhouette (mountains, a volcano, an iceberg…). StoryMap
 * paints one biome band per tier, varies it a little per tier (decoration seed +
 * feature placement) so repeats never look identical, and places the level
 * medallions on the river.
 */
export type BiomeDecor =
  | 'grass' | 'flower' | 'tree' | 'pine' | 'palm' | 'acacia' | 'cactus'
  | 'rock' | 'ember' | 'snow' | 'crystal' | 'wave' | 'cloud' | 'star' | 'comet' | 'fern';

export type BiomeFeature = 'hills' | 'mountains' | 'volcano' | 'iceberg' | 'island' | 'dunes' | 'canopy' | 'starfield';

export interface Biome {
  key: string;
  nameFr: string;
  nameEn: string;
  /** Terrain banks gradient [top, bottom]. */
  bank: [string, string];
  /** River body gradient [top, bottom] — the path colour. */
  river: [string, string];
  /** Level medallion fill / rim accent. */
  rim: string;
  /** Node number/icon colour on the medallion. */
  onRim: string;
  /** Scattered small decoration kinds (picked at random per placement). */
  decor: BiomeDecor[];
  /** Large background silhouette for depth. */
  feature: BiomeFeature;
  /** Colour of the far background feature silhouette. */
  featureColor: string;
  /** Whether the biome reads as a night/space sky (affects cloud/star choice). */
  night?: boolean;
}

export const BIOMES: Biome[] = [
  { key: 'prairie',  nameFr: 'Prairie',  nameEn: 'Meadow',      bank: ['#7cb04a', '#4a7c3a'], river: ['#6fb8e0', '#2f7ca5'], rim: '#c04a1a', onRim: '#fff',     decor: ['grass', 'flower', 'tree', 'cloud', 'rock'], feature: 'hills',     featureColor: '#3c6a30' },
  { key: 'desert',   nameFr: 'Désert',   nameEn: 'Desert',      bank: ['#eccb86', '#c4872a'], river: ['#7fd6e6', '#2e8ac0'], rim: '#a8541a', onRim: '#fff',     decor: ['cactus', 'rock', 'grass', 'cloud'],         feature: 'dunes',     featureColor: '#b07a28' },
  { key: 'volcan',   nameFr: 'Volcan',   nameEn: 'Volcano',     bank: ['#43302f', '#1a1010'], river: ['#ffc24a', '#d0341a'], rim: '#ffce7a', onRim: '#2a1414', decor: ['ember', 'rock', 'ember', 'crystal'],        feature: 'volcano',   featureColor: '#1a0f0d', night: true },
  { key: 'glace',    nameFr: 'Toundra',  nameEn: 'Tundra',      bank: ['#e3edf4', '#a9c9df'], river: ['#d0f0ff', '#7fb6dd'], rim: '#1a4a7a', onRim: '#fff',     decor: ['snow', 'pine', 'crystal', 'rock'],          feature: 'iceberg',   featureColor: '#c3dced' },
  { key: 'jungle',   nameFr: 'Jungle',   nameEn: 'Jungle',      bank: ['#3f7c34', '#173d18'], river: ['#5fc0ac', '#238a78'], rim: '#e0b040', onRim: '#173d18', decor: ['tree', 'fern', 'palm', 'flower'],           feature: 'canopy',    featureColor: '#123012' },
  { key: 'archipel', nameFr: 'Archipel', nameEn: 'Archipelago', bank: ['#39a0d0', '#1a4a7a'], river: ['#9ee8f4', '#3aa8d8'], rim: '#e0b060', onRim: '#123a5a', decor: ['wave', 'palm', 'rock', 'cloud'],            feature: 'island',    featureColor: '#d9c48a' },
  { key: 'savane',   nameFr: 'Savane',   nameEn: 'Savanna',     bank: ['#dcb85e', '#a8772a'], river: ['#7fd6e6', '#2e8ac0'], rim: '#7a3f14', onRim: '#fff',     decor: ['acacia', 'grass', 'rock', 'cloud'],         feature: 'hills',     featureColor: '#9a6a24' },
  { key: 'cosmos',   nameFr: 'Cosmos',   nameEn: 'Cosmos',      bank: ['#141c40', '#070a1c'], river: ['#7f8cff', '#2a2a8a'], rim: '#9a7cff', onRim: '#fff',     decor: ['star', 'star', 'comet', 'crystal'],         feature: 'starfield', featureColor: '#20265a', night: true },
];

/** Biome for a 1-based tier (group of 10 levels), cycling through the list. */
export function biomeForTier(tier: number): Biome {
  const i = ((tier - 1) % BIOMES.length + BIOMES.length) % BIOMES.length;
  return BIOMES[i];
}
