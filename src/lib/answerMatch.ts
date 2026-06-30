/**
 * Shared free-text answer matching for typed country / capital answers.
 *
 * Extracted from VersusCapitals so the normalisation + fuzzy logic is reusable
 * and unit-tested, and extended with a per-country alias table so common
 * alternate spellings (e.g. "république démocratique du congo", "RDC") match the
 * stored display name ("Congo (Rép. dém.)"), which they otherwise never would.
 *
 * To accept a new spelling: add it (lowercase, accents optional) to
 * COUNTRY_ALIASES under the country's cca3. This file is the single place to do so.
 */

/** Lowercase, strip accents, drop spaces/punctuation. "Congo (Rép. dém.)" → "congorepdem". */
export const normalizeAnswer = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les accents
    .replace(/[^a-z0-9]/g, '') // retire espaces, tirets, apostrophes…
    .trim();

/** Levenshtein edit distance between two strings. */
export const levenshtein = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
};

/** One-against-one closeness: equal after normalisation, or within Levenshtein tolerance. */
const closeToOne = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  if (a === b) return true;
  // La réponse doit avoir une longueur comparable (évite qu'une lettre valide tout)
  if (Math.abs(a.length - b.length) > 2) return false;
  const tolerance = b.length <= 8 ? 1 : 2;
  return levenshtein(a, b) <= tolerance;
};

/**
 * Whether the typed input is close enough to the expected answer OR to any of the
 * supplied aliases. Tolerance is proportional to length: 1 typo up to 8 letters, 2 beyond.
 */
export const isAnswerClose = (input: string, answer: string, aliases?: string[]): boolean => {
  const a = normalizeAnswer(input);
  if (!a) return false;
  if (closeToOne(a, normalizeAnswer(answer))) return true;
  if (aliases) {
    for (const alias of aliases) {
      if (closeToOne(a, normalizeAnswer(alias))) return true;
    }
  }
  return false;
};

/**
 * Accepted alternate spellings keyed by ISO cca3. Used for country-name answers
 * (FLAG questions, guess mode) — NOT capitals. Add new spellings here.
 */
export const COUNTRY_ALIASES: Record<string, string[]> = {
  // The two Congos: stored names are ambiguous; accept the full official forms.
  COD: [
    'republique democratique du congo',
    'rd congo',
    'rdc',
    'congo kinshasa',
    'congo rdc',
    'dr congo',
    'drc',
    'democratic republic of the congo',
    'congo democratique',
  ],
  COG: [
    'republique du congo',
    'congo brazzaville',
    'republic of the congo',
    'congo republique',
  ],
  // Common alternate names players type.
  USA: ['usa', 'etats unis', 'amerique', 'united states', 'united states of america', 'us'],
  GBR: ['uk', 'angleterre', 'royaume uni', 'united kingdom', 'great britain', 'grande bretagne'],
  KOR: ['coree du sud', 'south korea', 'coree sud'],
  PRK: ['coree du nord', 'north korea', 'coree nord'],
  CZE: ['republique tcheque', 'tchequie', 'czech republic', 'czechia'],
  ARE: ['emirats arabes unis', 'eau', 'united arab emirates', 'uae', 'emirats'],
  NLD: ['pays bas', 'hollande', 'netherlands', 'holland'],
  CIV: ['cote divoire', 'ivory coast'],
  MMR: ['birmanie', 'myanmar', 'burma'],
  CPV: ['cap vert', 'cape verde'],
  SWZ: ['eswatini', 'swaziland'],
  TLS: ['timor oriental', 'timor leste', 'east timor'],
  MKD: ['macedoine', 'macedoine du nord', 'north macedonia'],
};

/** Minimal country shape needed for name matching. */
export interface MatchableCountry {
  cca3: string;
  name: string;
  name_en?: string | null;
}

/** Whether the typed input matches a country's French name, English name, or any alias. */
export const matchesCountry = (input: string, country: MatchableCountry): boolean => {
  const aliases = COUNTRY_ALIASES[country.cca3] ?? [];
  const names = [country.name, country.name_en].filter(Boolean) as string[];
  return isAnswerClose(input, names[0] ?? '', [...names.slice(1), ...aliases]);
};
