/**
 * The five continents, as a solo-play scope.
 *
 * ⚠️ Naming: in this codebase "region" already means a *sub-national* division
 * (Défis Pays: French départements, US states…) — see `RegionPick`, the
 * `regions` GameMode, `game_data.regionRounds`. `countries_stats.json`
 * unfortunately also calls the continent `region`, so everything continent-side
 * is named `continent` here and never `region`, to keep the two apart.
 *
 * The data comes straight from `assets/countries_stats.json`: all 195 countries
 * in the pool carry a `region`, so no enrichment is needed. Counts are
 * Africa 54, Asia 47, Europe 45, Americas 35, Oceania 14 — the Oceania pool is
 * small enough that some modes can't honour it (see `src/lib/soloScope.ts`).
 */
import rawCountriesStats from '../../assets/countries_stats.json';
import type { CountryStat, Language, LocalizedLabel } from '../types';
import { tr } from '../i18n';

export type ContinentId = 'Africa' | 'Americas' | 'Asia' | 'Europe' | 'Oceania';

export interface Continent {
  id: ContinentId;
  fr: string;
  en: string;
}

/**
 * Display order: alphabetical in French, which is also how the picker reads.
 * No emoji here on purpose — the zone picker draws each continent's real
 * silhouette (see components/ContinentIcon), which is on-brand and tells the
 * player which countries the zone actually covers.
 */
export const CONTINENTS: readonly Continent[] = [
  { id: 'Africa',   fr: 'Afrique',   en: 'Africa'   },
  { id: 'Americas', fr: 'Amériques', en: 'Americas' },
  { id: 'Asia',     fr: 'Asie',      en: 'Asia'     },
  { id: 'Europe',   fr: 'Europe',    en: 'Europe'   },
  { id: 'Oceania',  fr: 'Océanie',   en: 'Oceania'  },
] as const;

/**
 * Localized continent names, keyed by the raw `region` string found in the
 * stats. Includes `Antarctic`, which no playable country uses but which the
 * Guess-the-Country clue tile can still surface for a stray entry.
 */
export const CONTINENT_LABEL: Record<string, LocalizedLabel> = {
  Africa:    { fr: 'Afrique',   en: 'Africa'    },
  Americas:  { fr: 'Amériques', en: 'Americas'  },
  Asia:      { fr: 'Asie',      en: 'Asia'      },
  Europe:    { fr: 'Europe',    en: 'Europe'    },
  Oceania:   { fr: 'Océanie',   en: 'Oceania'   },
  Antarctic: { fr: 'Antarct.',  en: 'Antarctic' },
};

const STATS = rawCountriesStats as unknown as CountryStat[];

const BY_ID = new Map<string, ContinentId>(
  STATS.map((s) => [s.cca3, s.region as ContinentId]),
);

const IDS_BY_CONTINENT = (() => {
  const m = new Map<ContinentId, string[]>();
  for (const c of CONTINENTS) m.set(c.id, []);
  for (const s of STATS) m.get(s.region as ContinentId)?.push(s.cca3);
  return m;
})();

/** Localized continent name for a raw `region` string (falls back to itself). */
export function continentLabel(region: string | undefined, language: Language): string {
  if (!region) return '?';
  const label = CONTINENT_LABEL[region];
  return label ? (tr(language, label.fr, label.en)) : region;
}

/** The continent a country belongs to, or null when it isn't in the pool. */
export function continentOf(cca3: string): ContinentId | null {
  return BY_ID.get(cca3) ?? null;
}

/** True when the country is in scope. A null scope means "the whole world". */
export function inContinent(cca3: string, continent: ContinentId | null): boolean {
  return continent === null || BY_ID.get(cca3) === continent;
}

/**
 * Narrows any cca3-carrying list to one continent. A null scope returns the
 * list untouched (same reference), so callers can filter unconditionally.
 */
export function filterByContinent<T extends { cca3: string }>(
  list: T[],
  continent: ContinentId | null,
): T[] {
  if (continent === null) return list;
  return list.filter((item) => BY_ID.get(item.cca3) === continent);
}

/** Same as `filterByContinent` for a bare cca3 list. */
export function filterCca3sByContinent(ids: string[], continent: ContinentId | null): string[] {
  if (continent === null) return ids;
  return ids.filter((id) => BY_ID.get(id) === continent);
}

/** Every cca3 of a continent, in the stats file's order. */
export function continentCca3s(continent: ContinentId): string[] {
  return IDS_BY_CONTINENT.get(continent) ?? [];
}

/** How many countries a continent holds (used by the picker's subtitles). */
export function continentCount(continent: ContinentId): number {
  return continentCca3s(continent).length;
}
