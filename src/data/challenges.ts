/**
 * Country challenges — the data behind "Défis Pays" (Country Challenges).
 *
 * A challenge is a country-specific quiz played with the same CARRÉ / DUO / CASH
 * scoring as the country↔capital game: each question shows a prompt (a text label
 * or a flag image) and the player either picks from generated options (DUO = 2,
 * CARRÉ = 4) or types the answer (CASH). The set is fully data-driven so new
 * challenges (other départements, US state capitals, German Länder, …) are just
 * new entries here — no new screen needed.
 *
 * Examples shipped: France · département number (name → number) and
 * USA · state flags (flag → state name).
 */

import { getSubdivisionFlagUrl } from '../lib/flags';

/** What the question shows. */
export type ChallengePromptKind = 'text' | 'flag';
/** How a typed (CASH) answer is checked: numbers exactly, names fuzzily. */
export type ChallengeAnswerKind = 'number' | 'name';

export interface ChallengeEntity {
  id: string;
  /** The correct answer, per language (also the label on option buttons). */
  answerFr: string;
  answerEn: string;
  /** Prompt text when promptKind = 'text' (e.g. the département name). */
  promptFr?: string;
  promptEn?: string;
  /** flagcdn subdivision slug when promptKind = 'flag' (e.g. 'us-ca'). */
  flagSlug?: string;
  /** Extra accepted spellings for CASH (e.g. the other language's name). */
  aliases?: string[];
}

export interface Challenge {
  id: string;
  /** Owning country (cca3) — used to group the hub by country. */
  country: string;
  /** Country flag emoji for the hub card. */
  emoji: string;
  titleFr: string;
  titleEn: string;
  subtitleFr: string;
  subtitleEn: string;
  /** The per-question instruction, e.g. "Quel est le numéro de ce département ?". */
  questionFr: string;
  questionEn: string;
  promptKind: ChallengePromptKind;
  answerKind: ChallengeAnswerKind;
  entities: ChallengeEntity[];
}

// ── France — départements (name → number) ────────────────────────────────────
// [code, name]; English name is identical (proper nouns). 101 départements
// (Corsica split 2A/2B, no "20"; overseas 971–976).
const FR_DEPARTMENTS: [string, string][] = [
  ['01', 'Ain'], ['02', 'Aisne'], ['03', 'Allier'], ['04', 'Alpes-de-Haute-Provence'],
  ['05', 'Hautes-Alpes'], ['06', 'Alpes-Maritimes'], ['07', 'Ardèche'], ['08', 'Ardennes'],
  ['09', 'Ariège'], ['10', 'Aube'], ['11', 'Aude'], ['12', 'Aveyron'], ['13', 'Bouches-du-Rhône'],
  ['14', 'Calvados'], ['15', 'Cantal'], ['16', 'Charente'], ['17', 'Charente-Maritime'],
  ['18', 'Cher'], ['19', 'Corrèze'], ['2A', 'Corse-du-Sud'], ['2B', 'Haute-Corse'],
  ['21', "Côte-d'Or"], ["22", "Côtes-d'Armor"], ['23', 'Creuse'], ['24', 'Dordogne'],
  ['25', 'Doubs'], ['26', 'Drôme'], ['27', 'Eure'], ['28', 'Eure-et-Loir'], ['29', 'Finistère'],
  ['30', 'Gard'], ['31', 'Haute-Garonne'], ['32', 'Gers'], ['33', 'Gironde'], ['34', 'Hérault'],
  ['35', 'Ille-et-Vilaine'], ['36', 'Indre'], ['37', 'Indre-et-Loire'], ['38', 'Isère'],
  ['39', 'Jura'], ['40', 'Landes'], ['41', 'Loir-et-Cher'], ['42', 'Loire'], ['43', 'Haute-Loire'],
  ['44', 'Loire-Atlantique'], ['45', 'Loiret'], ['46', 'Lot'], ['47', 'Lot-et-Garonne'],
  ['48', 'Lozère'], ['49', 'Maine-et-Loire'], ['50', 'Manche'], ['51', 'Marne'], ['52', 'Haute-Marne'],
  ['53', 'Mayenne'], ['54', 'Meurthe-et-Moselle'], ['55', 'Meuse'], ['56', 'Morbihan'], ['57', 'Moselle'],
  ['58', 'Nièvre'], ['59', 'Nord'], ['60', 'Oise'], ['61', 'Orne'], ['62', 'Pas-de-Calais'],
  ['63', 'Puy-de-Dôme'], ['64', 'Pyrénées-Atlantiques'], ['65', 'Hautes-Pyrénées'],
  ['66', 'Pyrénées-Orientales'], ['67', 'Bas-Rhin'], ['68', 'Haut-Rhin'], ['69', 'Rhône'],
  ['70', 'Haute-Saône'], ['71', 'Saône-et-Loire'], ['72', 'Sarthe'], ['73', 'Savoie'],
  ['74', 'Haute-Savoie'], ['75', 'Paris'], ['76', 'Seine-Maritime'], ['77', 'Seine-et-Marne'],
  ['78', 'Yvelines'], ['79', 'Deux-Sèvres'], ['80', 'Somme'], ['81', 'Tarn'], ['82', 'Tarn-et-Garonne'],
  ['83', 'Var'], ['84', 'Vaucluse'], ['85', 'Vendée'], ['86', 'Vienne'], ['87', 'Haute-Vienne'],
  ['88', 'Vosges'], ['89', 'Yonne'], ['90', 'Territoire de Belfort'], ['91', 'Essonne'],
  ['92', 'Hauts-de-Seine'], ['93', 'Seine-Saint-Denis'], ['94', 'Val-de-Marne'], ['95', "Val-d'Oise"],
  ['971', 'Guadeloupe'], ['972', 'Martinique'], ['973', 'Guyane'], ['974', 'La Réunion'], ['976', 'Mayotte'],
];

// ── USA — states (flag → name) ───────────────────────────────────────────────
// [postal, name_en, name_fr]; flagcdn slug is `us-<postal>`.
const US_STATES: [string, string, string][] = [
  ['AL', 'Alabama', 'Alabama'], ['AK', 'Alaska', 'Alaska'], ['AZ', 'Arizona', 'Arizona'],
  ['AR', 'Arkansas', 'Arkansas'], ['CA', 'California', 'Californie'], ['CO', 'Colorado', 'Colorado'],
  ['CT', 'Connecticut', 'Connecticut'], ['DE', 'Delaware', 'Delaware'], ['FL', 'Florida', 'Floride'],
  ['GA', 'Georgia', 'Géorgie'], ['HI', 'Hawaii', 'Hawaï'], ['ID', 'Idaho', 'Idaho'],
  ['IL', 'Illinois', 'Illinois'], ['IN', 'Indiana', 'Indiana'], ['IA', 'Iowa', 'Iowa'],
  ['KS', 'Kansas', 'Kansas'], ['KY', 'Kentucky', 'Kentucky'], ['LA', 'Louisiana', 'Louisiane'],
  ['ME', 'Maine', 'Maine'], ['MD', 'Maryland', 'Maryland'], ['MA', 'Massachusetts', 'Massachusetts'],
  ['MI', 'Michigan', 'Michigan'], ['MN', 'Minnesota', 'Minnesota'], ['MS', 'Mississippi', 'Mississippi'],
  ['MO', 'Missouri', 'Missouri'], ['MT', 'Montana', 'Montana'], ['NE', 'Nebraska', 'Nebraska'],
  ['NV', 'Nevada', 'Nevada'], ['NH', 'New Hampshire', 'New Hampshire'], ['NJ', 'New Jersey', 'New Jersey'],
  ['NM', 'New Mexico', 'Nouveau-Mexique'], ['NY', 'New York', 'New York'],
  ['NC', 'North Carolina', 'Caroline du Nord'], ['ND', 'North Dakota', 'Dakota du Nord'],
  ['OH', 'Ohio', 'Ohio'], ['OK', 'Oklahoma', 'Oklahoma'], ['OR', 'Oregon', 'Oregon'],
  ['PA', 'Pennsylvania', 'Pennsylvanie'], ['RI', 'Rhode Island', 'Rhode Island'],
  ['SC', 'South Carolina', 'Caroline du Sud'], ['SD', 'South Dakota', 'Dakota du Sud'],
  ['TN', 'Tennessee', 'Tennessee'], ['TX', 'Texas', 'Texas'], ['UT', 'Utah', 'Utah'],
  ['VT', 'Vermont', 'Vermont'], ['VA', 'Virginia', 'Virginie'], ['WA', 'Washington', 'Washington'],
  ['WV', 'West Virginia', 'Virginie-Occidentale'], ['WI', 'Wisconsin', 'Wisconsin'], ['WY', 'Wyoming', 'Wyoming'],
];

const frDeptEntities: ChallengeEntity[] = FR_DEPARTMENTS.map(([code, name]) => ({
  id: `FR-D-${code}`,
  answerFr: code,
  answerEn: code,
  promptFr: name,
  promptEn: name,
}));

const usStateEntities: ChallengeEntity[] = US_STATES.map(([postal, nameEn, nameFr]) => ({
  id: `US-${postal}`,
  answerFr: nameFr,
  answerEn: nameEn,
  flagSlug: `us-${postal.toLowerCase()}`,
  // Accept either language's spelling when typed.
  aliases: nameEn === nameFr ? [postal] : [nameEn, nameFr, postal],
}));

export const CHALLENGES: Challenge[] = [
  {
    id: 'fr-dept-number',
    country: 'FRA',
    emoji: '🇫🇷',
    titleFr: 'Numéro de département',
    titleEn: 'Department number',
    subtitleFr: 'Trouve le numéro à partir du nom',
    subtitleEn: 'Find the number from the name',
    questionFr: 'Quel est le numéro de ce département ?',
    questionEn: 'What is this department’s number?',
    promptKind: 'text',
    answerKind: 'number',
    entities: frDeptEntities,
  },
  {
    id: 'us-state-flag',
    country: 'USA',
    emoji: '🇺🇸',
    titleFr: 'Drapeaux des États',
    titleEn: 'State flags',
    subtitleFr: "Trouve l'État à partir de son drapeau",
    subtitleEn: 'Find the state from its flag',
    questionFr: 'Quel est cet État ?',
    questionEn: 'Which state is this?',
    promptKind: 'flag',
    answerKind: 'name',
    entities: usStateEntities,
  },
];

/** Display names for the countries that own challenges. */
const COUNTRY_LABELS: Record<string, [string, string]> = {
  FRA: ['France', 'France'],
  USA: ['États-Unis', 'United States'],
};

export function countryLabel(cca3: string, lang: 'fr' | 'en'): string {
  const l = COUNTRY_LABELS[cca3];
  return l ? (lang === 'fr' ? l[0] : l[1]) : cca3;
}

export function getChallenge(id: string): Challenge | undefined {
  return CHALLENGES.find((c) => c.id === id);
}

/** The challenges available for a given country (cca3) — empty for most. */
export function challengesForCountry(cca3: string): Challenge[] {
  return CHALLENGES.filter((c) => c.country === cca3);
}

/** Challenges grouped by country, preserving declaration order. */
export function challengesByCountry(): { country: string; emoji: string; items: Challenge[] }[] {
  const out: { country: string; emoji: string; items: Challenge[] }[] = [];
  for (const ch of CHALLENGES) {
    let group = out.find((g) => g.country === ch.country);
    if (!group) {
      group = { country: ch.country, emoji: ch.emoji, items: [] };
      out.push(group);
    }
    group.items.push(ch);
  }
  return out;
}

// ── Per-entity accessors (language-aware) ────────────────────────────────────

export function entityAnswer(e: ChallengeEntity, lang: 'fr' | 'en'): string {
  return lang === 'fr' ? e.answerFr : e.answerEn;
}

export function entityPrompt(e: ChallengeEntity, lang: 'fr' | 'en'): string {
  return (lang === 'fr' ? e.promptFr : e.promptEn) ?? '';
}

export function entityFlagUrl(e: ChallengeEntity): string | null {
  return e.flagSlug ? getSubdivisionFlagUrl(e.flagSlug) : null;
}

/** Every accepted spelling for a CASH answer (both languages + aliases). */
export function entityAcceptedAnswers(e: ChallengeEntity): string[] {
  return Array.from(new Set([e.answerFr, e.answerEn, ...(e.aliases ?? [])].filter(Boolean)));
}

/**
 * `count` distinct wrong answers (in `lang`) drawn from the other entities, for
 * the DUO/CARRÉ option grids. Deterministic when `rng` is seeded. Pure.
 */
export function pickDistractors(
  entities: ChallengeEntity[],
  correct: ChallengeEntity,
  count: number,
  lang: 'fr' | 'en',
  rng: () => number,
): string[] {
  const correctAns = entityAnswer(correct, lang);
  const pool = entities.filter((e) => e.id !== correct.id);
  // Fisher–Yates partial shuffle, collecting distinct answers.
  const picked: string[] = [];
  const seen = new Set<string>([correctAns]);
  const idxs = pool.map((_, i) => i);
  for (let i = idxs.length - 1; i > 0 && picked.length < count; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    const ans = entityAnswer(pool[idxs[i]], lang);
    if (!seen.has(ans)) {
      seen.add(ans);
      picked.push(ans);
    }
  }
  return picked;
}
