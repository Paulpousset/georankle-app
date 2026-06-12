/**
 * Shared domain types for GeoRankle.
 *
 * These describe the shape of `assets/game_data.json` (themes + countries) and
 * the Supabase records the app reads/writes. They are intentionally permissive
 * where the source data is loose (e.g. the JSON-backed maps keyed by theme id).
 */

export type Language = 'fr' | 'en';

/** A localized string pair as stored in the game data. */
export interface LocalizedLabel {
  fr: string;
  en: string;
}

/** A ranking category (e.g. GDP, population). */
export interface Theme {
  id: string;
  emoji: string;
  label: LocalizedLabel;
  api_source?: string;
  format?: string;
}

/** A per-theme statistic value with pre-formatted display strings. */
export interface CountryDatum {
  value: number;
  display_fr: string;
  display_en: string;
}

/** A country with its rank (1 = best) and raw data per theme. */
export interface Country {
  name: string;
  name_en?: string;
  cca3: string;
  /** Map of theme id -> rank (1 is the top/highest value for that theme). */
  ranks: Record<string, number>;
  /** Map of theme id -> formatted datum. */
  data: Record<string, CountryDatum>;
}

/** Top-level shape of `assets/game_data.json`. */
export interface GameData {
  themes: Record<string, Omit<Theme, 'id'>>;
  countries: Country[];
}

/** A player's pick for a given theme during a classic game. */
export interface Selection {
  countryName: string;
  rank: number;
  cca3: string;
}

/** Map of theme id -> selection. */
export type SelectionMap = Record<string, Selection>;

export type GameMode = 'menu' | 'classic' | 'streak' | 'versus' | 'guess' | 'globe' | 'quiz-capital' | 'quiz-flag' | 'quiz-mix' | 'local-builder';
export type MatchMode = 'classic' | 'streak' | 'versus' | 'globe' | 'guess';
export type MatchStatus = 'waiting' | 'in_progress' | 'completed' | 'cancelled';

/** A multiplayer match row from the `matches` table. */
export interface Match {
  id: string;
  player1_id: string;
  player2_id: string | null;
  game_mode: MatchMode;
  status: MatchStatus;
  is_public: boolean;
  is_ranked: boolean;
  best_of: number;
  p1_rounds_won: number;
  p2_rounds_won: number;
  p1_current_score: number;
  p2_current_score: number;
  current_round: number;
  p1_finished_round: boolean;
  p2_finished_round: boolean;
  game_data: {
    seed: number;
    is_ranked?: boolean;
    ranked_modes?: MatchMode[];
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

/** A player's ranked rating row from `player_ratings`. */
export interface PlayerRating {
  user_id: string;
  elo: number;
  wins: number;
  losses: number;
}

// ── Avatar customization ─────────────────────────────────────────────────────

/**
 * Customization slots. The character itself is a professional 3D hero model
 * (KayKit, CC0) unlocked in the shop; weapon/offhand are gear attached to the
 * hero's hand slots; background is the 3D environment; frame is a 2D ring
 * shown around list thumbnails.
 */
export type CosmeticCategory = 'background' | 'hero' | 'weapon' | 'offhand' | 'frame';

/** A purchasable/equippable cosmetic, defined in src/data/cosmetics.ts. */
export interface CosmeticPart {
  id: string;
  category: CosmeticCategory;
  price: number;
  isDefault: boolean;
  nameFr: string;
  nameEn: string;
  /** Whether this part exposes a tint color the user can pick (backgrounds). */
  tintable: boolean;
  /** Default tint applied when none is chosen (for tintable parts). */
  defaultTint?: string;
  /** GLB/GLTF model URL (heroes and gear). */
  modelUrl?: string;
  /** Skeleton node the gear attaches to (handslotr / handslotl). */
  attachBone?: string;
  /** 2D portrait/thumbnail image URL (heroes). */
  thumbUrl?: string;
  /** Representative colour for simple swatch tiles (backgrounds, frames). */
  swatch?: string;
}

/** One equipped layer: which part id and its chosen tint (null = part default). */
export interface AvatarLayer {
  id: string;
  tint: string | null;
}

/** The equipped avatar configuration stored in profiles.avatar_config (JSONB). */
export interface AvatarConfig {
  v: number;
  /** When false, fall back to photo/initials instead of the 3D hero. */
  useCustom: boolean;
  layers: Record<CosmeticCategory, AvatarLayer>;
}

/** A coin balance row from `coin_wallets`. */
export interface CoinWallet {
  user_id: string;
  balance: number;
}
