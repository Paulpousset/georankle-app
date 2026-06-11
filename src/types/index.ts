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

export type GameMode = 'menu' | 'classic' | 'streak' | 'versus' | 'guess';
export type MatchMode = 'classic' | 'streak' | 'versus';
export type MatchStatus = 'waiting' | 'in_progress' | 'cancelled' | 'finished';

/** A multiplayer match row from the `matches` table. */
export interface Match {
  id: string;
  player1_id: string;
  player2_id: string | null;
  game_mode: MatchMode;
  status: MatchStatus;
  is_public: boolean;
  [key: string]: unknown;
}
