/**
 * The facts behind a country, assembled for the post-answer "learn" card.
 *
 * Everything here already ships in the bundle — `countries_stats.json` for the
 * reference facts and `game_data.json` for the world rankings — so a fact card
 * costs no network call and works offline. The point is to turn "wrong, it was
 * Zambia" into something worth remembering.
 *
 * Ranks are the hook: "4th largest country in the world" sticks where a raw
 * area figure doesn't. We surface the *most remarkable* ones — a country's best
 * and worst placements — rather than a fixed set of themes, so every country
 * has something to say about itself.
 */
import rawCountriesStats from '../../assets/countries_stats.json';
import { gameData } from '../data/gameData';
import { continentLabel } from '../data/continents';
import { getThemeShortDescription } from '../i18n/themeDescriptions';
import { fmtArea, fmtCount } from './format';
import { pickLabel, tr } from '../i18n';
import type { CountryStat, Language } from '../types';
import { capitalName, countryName } from './geoNames';

/** Themes whose ranking would read as morbid trivia on a learning card. */
const EXCLUDED_THEMES = new Set(['suicide_rate', 'homicide_rate']);

/** A rank worth showing: near the top of the world, or near the bottom. */
const NOTABLE_TOP = 15;

/**
 * How many places a bottom-of-the-table rank is "worth less" than a top one
 * when choosing what to show. Being 2nd in the world is a headline; being 2nd
 * from last is a curiosity, so it only wins if it's much more extreme.
 */
const BOTTOM_PENALTY = 4;

const STATS_BY_ID = new Map<string, CountryStat>(
  (rawCountriesStats as unknown as CountryStat[]).map((s) => [s.cca3, s]),
);

const COUNTRY_BY_ID = new Map(gameData.countries.map((c) => [c.cca3, c]));

/** How many countries are ranked on a given theme (the "out of N"). */
const THEME_SIZE = new Map<string, number>(
  Object.keys(gameData.themes).map((themeId) => [
    themeId,
    gameData.countries.filter((c) => c.ranks?.[themeId] !== undefined).length,
  ]),
);

export interface CountryFactRank {
  themeId: string;
  /** Localized theme name. */
  label: string;
  rank: number;
  /** How many countries are ranked on this theme. */
  total: number;
  /** One-line explanation of what the theme measures. */
  hint: string;
  /** Which end of the table the country sits at. */
  position: 'top' | 'bottom';
  /** Places from that end — 1 = first (or last) in the world. */
  fromEnd: number;
}

export interface CountryFacts {
  cca3: string;
  name: string;
  capital: string;
  continent: string;
  /** Pre-formatted "label: value" reference rows. */
  rows: { label: string; value: string }[];
  /**
   * Every world ranking worth showing for this country, most striking first.
   * The card displays a single one, drawn at random (see `pickNotableRank`), so
   * re-opening a country teaches something new instead of repeating itself.
   */
  ranks: CountryFactRank[];
}

/** Localized country name, falling back to the French one. */
export function countryFactName(cca3: string, language: Language): string {
  const s = STATS_BY_ID.get(cca3);
  if (!s) return cca3;
  return countryName(s, language);
}

/** How many rankings are ever considered; the card picks one out of these. */
const MAX_CANDIDATE_RANKS = 8;

/**
 * Builds the fact sheet for a country, or null when the code is unknown.
 *
 * Pure and deterministic — the random choice of *which* ranking to show is the
 * caller's job (`pickNotableRank`), so this stays testable and so a re-render
 * can't shuffle the card under the player's eyes.
 */
export function countryFacts(
  cca3: string,
  language: Language,
  maxRanks = MAX_CANDIDATE_RANKS,
): CountryFacts | null {
  const s = STATS_BY_ID.get(cca3);
  if (!s) return null;

  const capital = capitalName(s, language);
  const rows: { label: string; value: string }[] = [];
  if (capital && capital !== 'N/A') {
    rows.push({ label: tr(language, 'Capitale', 'Capital'), value: capital });
  }
  rows.push({
    label: tr(language, 'Continent', 'Continent'),
    value: continentLabel(s.region, language),
  });
  if (s.population) {
    rows.push({
      label: tr(language, 'Population', 'Population'),
      value: fmtCount(s.population, language),
    });
  }
  if (s.area) {
    rows.push({ label: tr(language, 'Superficie', 'Area'), value: fmtArea(s.area, language) });
  }
  rows.push({
    label: tr(language, 'Pays frontaliers', 'Land neighbours'),
    value: s.borders_count ? String(s.borders_count) : tr(language, 'aucun (île)', 'none (island)'),
  });

  return {
    cca3,
    name: countryFactName(cca3, language),
    capital,
    continent: continentLabel(s.region, language),
    rows,
    ranks: notableRanks(cca3, language, maxRanks),
  };
}

/**
 * Picks the single ranking the card will show, uniformly at random among the
 * notable ones. Random rather than "always the most striking" on purpose: a
 * player who meets Iceland three times gets three different facts about it.
 *
 * `rng` is injectable so tests don't depend on Math.random.
 */
export function pickNotableRank(
  ranks: CountryFactRank[],
  rng: () => number = Math.random,
): CountryFactRank | null {
  if (!ranks.length) return null;
  return ranks[Math.min(ranks.length - 1, Math.floor(rng() * ranks.length))];
}

/**
 * The rankings that say something about this country: podium-ish placements
 * first, then the extremes at the other end of the table. Sorted so the most
 * striking fact leads.
 */
export function notableRanks(cca3: string, language: Language, max = 3): CountryFactRank[] {
  const country = COUNTRY_BY_ID.get(cca3);
  if (!country?.ranks) return [];

  const scored = Object.entries(country.ranks)
    .filter(([themeId]) => !EXCLUDED_THEMES.has(themeId) && gameData.themes[themeId])
    .map(([themeId, rank]) => {
      const total = THEME_SIZE.get(themeId) ?? 0;
      // Distance from whichever end of the table is closer — a last place is as
      // memorable as a first, and a mid-table rank is worth nothing.
      const fromEnd = Math.min(rank, total - rank + 1);
      return { themeId, rank, total, fromEnd };
    })
    .filter((r) => r.total > 0 && r.fromEnd <= NOTABLE_TOP)
    // Top placements lead: "3rd for tourism" lands harder than "5th from last",
    // so a bottom rank only shows when it's markedly more extreme.
    .sort(
      (a, b) =>
        a.fromEnd + (a.rank === a.fromEnd ? 0 : BOTTOM_PENALTY) -
          (b.fromEnd + (b.rank === b.fromEnd ? 0 : BOTTOM_PENALTY)) ||
        a.themeId.localeCompare(b.themeId),
    )
    .slice(0, max);

  return scored.map(({ themeId, rank, total, fromEnd }) => ({
    themeId,
    label: pickLabel(gameData.themes[themeId].label, language),
    rank,
    total,
    hint: getThemeShortDescription(themeId, language),
    position: rank === fromEnd ? ('top' as const) : ('bottom' as const),
    fromEnd,
  }));
}
