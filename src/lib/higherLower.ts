/**
 * « Plus ou Moins » (Higher/Lower) — pure run generation.
 *
 * A run is a fixed, seeded chain of pairwise questions: "on theme T, which of
 * these two countries is higher?" The challenger of question i becomes the
 * reference of question i+1 (classic higher/lower carry-over), so the whole
 * chain is deterministic from the seed alone — the same seed yields the same
 * questions for both players of an online round and for everyone's daily.
 *
 * Values come from game_data.json (`country.data[theme].value`), so "higher"
 * is always the plain numeric comparison; localized reveal strings ship with
 * the data (display_fr / display_en).
 */
import { gameData } from '../data/gameData';
import { createSeededRng, seededShuffle } from './rng';

/** Themes too grim for a quick-fire quiz — never asked. */
const EXCLUDED_THEMES = new Set(['suicide_rate', 'homicide_rate']);

export interface HLEntry {
  cca3: string;
  name: string;
  name_en: string;
  /** Numeric value for the pair's theme (comparison basis). */
  value: number;
  /** Localized reveal strings for the value (from the data pipeline). */
  display_fr: string;
  display_en: string;
}

export interface HLPair {
  themeId: string;
  /** Reference country (carried over from the previous question). */
  a: HLEntry;
  /** Challenger (becomes the next question's reference). */
  b: HLEntry;
}

interface RawCountry {
  cca3: string;
  name: string;
  name_en?: string;
  data?: Record<string, { value?: number; display_fr?: string; display_en?: string }>;
}

function toEntry(c: RawCountry, themeId: string): HLEntry {
  const d = c.data?.[themeId];
  return {
    cca3: c.cca3,
    name: c.name,
    name_en: c.name_en ?? c.name,
    value: d?.value ?? 0,
    display_fr: d?.display_fr ?? '',
    display_en: d?.display_en ?? '',
  };
}

/** Theme ids eligible for Plus ou Moins (numeric data, not excluded). */
export function higherLowerThemeIds(): string[] {
  return Object.keys(gameData.themes).filter((t) => !EXCLUDED_THEMES.has(t));
}

/**
 * Builds the full deterministic question chain for a seed. Countries appear at
 * most once per run; a challenger sharing no comparable theme with the current
 * reference is skipped. `maxQuestions` only bounds the precomputation — real
 * chains end at the first mistake long before the pool runs out.
 */
export function buildHigherLowerRun(seed: number, maxQuestions = 100): HLPair[] {
  const rng = createSeededRng(seed);
  const themeIds = higherLowerThemeIds();
  const countries = (gameData.countries as unknown as RawCountry[]).filter(
    (c) => c.data && Object.keys(c.data).length >= 5,
  );
  const order = seededShuffle(countries, rng);
  if (order.length < 2) return [];

  const pairs: HLPair[] = [];
  let ref = order[0];
  let idx = 1;
  while (pairs.length < maxQuestions && idx < order.length) {
    const challenger = order[idx];
    idx++;
    // Seeded theme pick: first shuffled theme where both sides have distinct
    // numeric values (equal values would make the question unanswerable).
    const themeId = seededShuffle(themeIds, rng).find((t) => {
      const av = ref.data?.[t]?.value;
      const bv = challenger.data?.[t]?.value;
      return typeof av === 'number' && typeof bv === 'number' && av !== bv;
    });
    if (!themeId) continue; // incomparable challenger — reference stays
    pairs.push({ themeId, a: toEntry(ref, themeId), b: toEntry(challenger, themeId) });
    ref = challenger;
  }
  return pairs;
}

/** Which side of the pair holds the higher value (the correct tap). */
export function higherSide(pair: HLPair): 'a' | 'b' {
  return pair.a.value > pair.b.value ? 'a' : 'b';
}
