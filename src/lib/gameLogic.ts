/**
 * Pure game logic shared across screens: the Classic optimal-assignment solver,
 * the Guess-the-Country scoring + comparison helpers. Extracting these from the
 * screen components keeps them deterministic and unit-testable.
 */
import type { Country, Language, SelectionMap, Theme } from '../types';
import { haversine, calcBearing, bearingToArrow } from './geo';
import { fmtCount, fmtArea, fmtMoney, fmtDist } from './format';

// ── Classic mode ──────────────────────────────────────────────────────────────

/** Number of countries (and themes) per Classic session. */
export const SESSION_SIZE = 8;
/** Default rank used when a country has no value for a theme. */
export const MISSING_RANK = 200;

/**
 * Brute-force search (with branch-and-bound pruning) for the country→theme
 * assignment that minimizes the total rank. Returns the optimal mapping, or `{}`
 * if there aren't enough themes/countries to fill a session.
 */
export function solveOptimal(
  currentThemes: Theme[],
  currentRounds: Country[],
  language: Language,
): SelectionMap {
  if (currentThemes.length < SESSION_SIZE || currentRounds.length < SESSION_SIZE) return {};

  let bestMapping: SelectionMap = {};
  let minTotal = Infinity;

  const themeIds = currentThemes.map((t) => t.id);
  const matrix = currentRounds.map((country) =>
    themeIds.map((themeId) => country.ranks[themeId] || MISSING_RANK),
  );

  const solve = (
    countryIdx: number,
    usedThemes: number,
    currentSum: number,
    currentMapping: SelectionMap,
  ) => {
    if (countryIdx === SESSION_SIZE) {
      if (currentSum < minTotal) {
        minTotal = currentSum;
        bestMapping = { ...currentMapping };
      }
      return;
    }

    for (let themeIdx = 0; themeIdx < SESSION_SIZE; themeIdx++) {
      if (usedThemes & (1 << themeIdx)) continue;
      const rank = matrix[countryIdx][themeIdx];
      if (currentSum + rank >= minTotal) continue;

      const country = currentRounds[countryIdx];
      const nextMapping: SelectionMap = {
        ...currentMapping,
        [themeIds[themeIdx]]: {
          countryName: language === 'fr' ? country.name : country.name_en || country.name,
          rank,
          cca3: country.cca3,
        },
      };
      solve(countryIdx + 1, usedThemes | (1 << themeIdx), currentSum + rank, nextMapping);
    }
  };

  solve(0, 0, 0, {});
  return bestMapping;
}

// ── Guess-the-Country mode ─────────────────────────────────────────────────────

/** Score for guessing the mystery country in `guessCount` tries: 1000, 900, …, 0. */
export function calcScore(guessCount: number): number {
  return Math.max(0, 1000 - (guessCount - 1) * 100);
}

export const CATEGORIES = [
  { id: 'continent',  emoji: '🌍', fr: 'Continent',   en: 'Continent'  },
  { id: 'direction',  emoji: '🧭', fr: 'Direction',   en: 'Direction'  },
  { id: 'distance',   emoji: '📏', fr: 'Distance',    en: 'Distance'   },
  { id: 'population', emoji: '👥', fr: 'Population',  en: 'Population' },
  { id: 'area',       emoji: '📐', fr: 'Superficie',  en: 'Area'       },
  { id: 'gdp',        emoji: '💰', fr: 'PIB/hab',     en: 'GDP/cap'    },
  { id: 'coastline',  emoji: '🏖️', fr: 'Côtes',       en: 'Coastline'  },
  { id: 'life_exp',   emoji: '❤️', fr: 'Espérance',   en: 'Life Exp.'  },
  { id: 'borders',    emoji: '🗺️', fr: 'Frontières',  en: 'Borders'    },
] as const;

export type CatId = (typeof CATEGORIES)[number]['id'];
// value = the guessed country's actual stat (shown on the tile)
// hint  = short directional clue about the mystery country ("▲ plus", "▼ moins", "✓"…)
export type CellResult = { value: string; hint?: string; color: string };

const REGION_LABEL: Record<string, { fr: string; en: string }> = {
  Africa:    { fr: 'Afrique',  en: 'Africa'   },
  Europe:    { fr: 'Europe',   en: 'Europe'   },
  Asia:      { fr: 'Asie',     en: 'Asia'     },
  Americas:  { fr: 'Amériques',en: 'Americas' },
  Oceania:   { fr: 'Océanie',  en: 'Oceania'  },
  Antarctic: { fr: 'Antarct.', en: 'Antarctic'},
};

export const UNKNOWN: CellResult = { value: '?', color: '#64748B' };

// Compares the guessed stat to the mystery one and returns a colored cell:
// the value shown is ALWAYS the guessed country's stat; the hint tells the
// player whether the mystery country is higher (▲) or lower (▼).
export function compareNum(guess: number, target: number, value: string, lang: Language): CellResult {
  if (guess === target) return { value, hint: '✓', color: '#10B981' };
  const ratio = guess / target;
  const color = ratio >= 0.6 && ratio <= 1.67 ? '#F59E0B' : '#EF4444';
  const targetIsMore = guess < target;
  const hint = targetIsMore
    ? (lang === 'fr' ? '▲ plus' : '▲ more')
    : (lang === 'fr' ? '▼ moins' : '▼ less');
  return { value, hint, color };
}

export function buildComparison(
  guessedC: any,
  targetC: any,
  guessedS: any,
  targetS: any,
  lang: Language,
): Record<CatId, CellResult> {
  const r = {} as Record<CatId, CellResult>;

  // Continent — the guessed country's region name; green if it matches.
  const sameRegion = guessedS?.region === targetS?.region;
  const regionLabel = REGION_LABEL[guessedS?.region];
  r.continent = {
    value: (lang === 'fr' ? regionLabel?.fr : regionLabel?.en) ?? guessedS?.region ?? '?',
    hint: sameRegion ? '✓' : (lang === 'fr' ? '✗ autre' : '✗ other'),
    color: sameRegion ? '#10B981' : '#EF4444',
  };

  // Direction + distance toward the mystery country.
  if (guessedS?.lat != null && targetS?.lat != null) {
    const dist = haversine(guessedS.lat, guessedS.lng, targetS.lat, targetS.lng);
    if (guessedC.cca3 === targetC.cca3) {
      r.direction = { value: '🎯', color: '#10B981' };
      r.distance  = { value: '0 km', color: '#10B981' };
    } else {
      const b = calcBearing(guessedS.lat, guessedS.lng, targetS.lat, targetS.lng);
      r.direction = {
        value: bearingToArrow(b),
        hint: lang === 'fr' ? 'vers la cible' : 'to target',
        color: dist < 2000 ? '#F59E0B' : '#EF4444',
      };
      r.distance = {
        value: fmtDist(dist),
        color: dist < 500 ? '#10B981' : dist < 2000 ? '#F59E0B' : '#EF4444',
      };
    }
  } else {
    r.direction = UNKNOWN;
    r.distance  = UNKNOWN;
  }

  // Population
  const gPop = guessedS?.population, tPop = targetS?.population;
  r.population = gPop && tPop
    ? compareNum(gPop, tPop, `${fmtCount(gPop, lang)}${lang === 'fr' ? ' hab.' : ''}`, lang)
    : UNKNOWN;

  // Area
  const gArea = guessedS?.area, tArea = targetS?.area;
  r.area = gArea && tArea ? compareNum(gArea, tArea, fmtArea(gArea, lang), lang) : UNKNOWN;

  // GDP per capita (the "PIB/hab" label was wrongly using total GDP before)
  const gGdp = guessedC?.data?.gdp_per_capita?.value, tGdp = targetC?.data?.gdp_per_capita?.value;
  r.gdp = gGdp && tGdp ? compareNum(gGdp, tGdp, fmtMoney(gGdp), lang) : UNKNOWN;

  // Coastline — coastal vs landlocked.
  const sameCoast = guessedS?.coastline === targetS?.coastline;
  r.coastline = {
    value: guessedS?.coastline
      ? (lang === 'fr' ? 'Côtier' : 'Coastal')
      : (lang === 'fr' ? 'Enclavé' : 'Landlocked'),
    hint: sameCoast ? '✓' : (lang === 'fr' ? '✗ autre' : '✗ other'),
    color: sameCoast ? '#10B981' : '#EF4444',
  };

  // Life expectancy
  const gLife = guessedC?.data?.life_expectancy?.value;
  const tLife = targetC?.data?.life_expectancy?.value;
  r.life_exp = gLife && tLife
    ? compareNum(gLife, tLife, `${Math.round(gLife)}${lang === 'fr' ? ' ans' : ' yr'}`, lang)
    : UNKNOWN;

  // Borders count
  const gB = guessedS?.borders_count, tB = targetS?.borders_count;
  if (gB != null && tB != null) {
    const label = `${gB}${lang === 'fr' ? ' pays' : ''}`;
    r.borders = compareNum(gB, tB, label, lang);
  } else {
    r.borders = UNKNOWN;
  }

  return r;
}
