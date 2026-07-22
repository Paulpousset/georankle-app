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

export type GameMode = 'menu' | 'classic' | 'streak' | 'versus' | 'guess' | 'globe' | 'regions' | 'challenge' | 'quiz-capital' | 'quiz-flag' | 'higherlower' | 'silhouette' | 'borders' | 'local-builder';
export type MatchMode = 'classic' | 'streak' | 'versus' | 'globe' | 'guess' | 'regions' | 'challenge' | 'higherlower' | 'silhouette' | 'borders';
export type MatchStatus = 'waiting' | 'in_progress' | 'completed' | 'cancelled';

/**
 * The `game_data` JSONB payload carried by a match. It seeds both clients
 * identically and stores the per-round config. Known fields are typed; the
 * index signature keeps mode-specific extras (e.g. region picks, challenge id,
 * bot profile) accessible without an `any` cast at every call site. Import this
 * type instead of re-declaring inline `as { ... }` shapes in screens.
 */
export interface MatchGameData {
  seed: number;
  is_ranked?: boolean;
  ranked_modes?: MatchMode[];
  /** Custom matches: a user-built mode sequence (length === best_of). */
  is_custom?: boolean;
  modes?: MatchMode[];
  /** Per-round config for custom matches (rounds[i] = round i+1). */
  rounds?: { mode: MatchMode; questionType?: 'CAPITAL' | 'FLAG'; count?: number }[];
  /**
   * Deduplicated answer countries per round (1-based round number → ordered
   * cca3 list, length = that round's question count). Precomputed at match
   * creation so no country repeats across modes. Absent for daily/solo.
   */
  roundCountries?: Record<number, string[]>;
  [key: string]: unknown;
}

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
  /** Free-for-all seat count (2 = classic 1v1). */
  max_players?: number;
  /** Bumped on round progress; drives the reconnect/forfeit window. */
  last_activity_at?: string;
  p1_rounds_won: number;
  p2_rounds_won: number;
  p1_current_score: number;
  p2_current_score: number;
  /** Cumulative normalized points across the match (server-authoritative tiebreaker). */
  p1_total_score?: number;
  p2_total_score?: number;
  current_round: number;
  p1_finished_round: boolean;
  p2_finished_round: boolean;
  game_data: MatchGameData | null;
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
 * Customization slots — a "World" identity rendered entirely in SVG/Text:
 *  - `globe`     the planet/map skin (procedural globe, see WorldAvatar),
 *  - `cosmos`    the backdrop behind the globe (gradient + stars),
 *  - `orbit`     a ring drawn around the globe (meridian, compass, neon…),
 *  - `emblem`    a landmark glyph floating beside the globe (monuments),
 *  - `satellite` a small element in orbit (moon, plane, comet…).
 */
export type CosmeticCategory = 'cosmos' | 'globe' | 'orbit' | 'emblem' | 'satellite';

/** Rarity tier — drives badge colour and base price. */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** A purchasable/equippable cosmetic, defined in src/data/cosmetics.ts. */
export interface CosmeticPart {
  id: string;
  category: CosmeticCategory;
  price: number;
  isDefault: boolean;
  rarity: Rarity;
  nameFr: string;
  nameEn: string;
  /** Whether this part exposes a tint color the user can pick (cosmos). */
  tintable: boolean;
  /** Default tint applied when none is chosen (for tintable parts). */
  defaultTint?: string;
  /** Globe rendering style key (globe slot) — interpreted by WorldAvatar. */
  globeStyle?: string;
  /** Cosmos backdrop style key (cosmos slot). */
  cosmosStyle?: string;
  /** Orbit ring style key (orbit slot). */
  orbitStyle?: string;
  /** Emoji glyph rendered for emblem/satellite slots. */
  glyph?: string;
  /** Representative colour for simple swatch tiles (cosmos, orbit). */
  swatch?: string;
  /** ISO date the item was added to the catalog — drives the "NEW" badge. */
  addedAt?: string;
  /**
   * Story-mode reward: not sold in the shop and never seeded into
   * `cosmetic_prices` (so it can't be bought or featured). Granted for free by
   * `complete_story_level` when a milestone is first cleared, then equippable
   * like any owned item.
   */
  exclusive?: boolean;
}

/** A discounted multi-item pack sold in the shop (mirrored in cosmetic_bundles). */
export interface CosmeticBundle {
  id: string;
  nameFr: string;
  nameEn: string;
  /** Item ids granted by the bundle (must exist in the catalog). */
  itemIds: string[];
  /** Discounted total price (below the sum of item prices). */
  price: number;
}

/** One equipped layer: which part id and its chosen tint (null = part default). */
export interface AvatarLayer {
  id: string;
  tint: string | null;
}

/** The equipped avatar configuration stored in profiles.avatar_config (JSONB). */
export interface AvatarConfig {
  v: number;
  /** When false, fall back to photo/initials instead of the world avatar. */
  useCustom: boolean;
  layers: Record<CosmeticCategory, AvatarLayer>;
}

/** A coin balance row from `coin_wallets`. */
export interface CoinWallet {
  user_id: string;
  balance: number;
}
