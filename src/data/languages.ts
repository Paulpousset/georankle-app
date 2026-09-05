/**
 * « Langues » — the catalogue behind the language-detection mode.
 *
 * A question shows one phrase (written, or spoken by a generated voice) and the
 * player names the language, with the same CARRÉ / DUO / CASH scoring as the
 * country challenges. The corpus lives in assets/languages.json rather than in
 * this file for one reason: scripts/gen_language_audio.mjs must read the exact
 * same phrases to generate the clips, and a Node ESM script cannot import a .ts.
 * Keep the JSON the single source of truth — never duplicate a phrase here.
 *
 * This module only types and indexes the corpus. The seeded game logic (runs,
 * series, distractors) lives in src/lib/languages.ts, the same way
 * src/lib/silhouette.ts sits next to src/data/challenges.ts.
 */

import type { Language } from '../types';
import { tr } from '../i18n';
import { allTranslations } from '../i18n/catalog';
import rawLanguages from '../../assets/languages.json';

/** Writing system. Drives the "same script" distractor tier in Text mode. */
export type LanguageScript =
  | 'latin' | 'cyrillic' | 'greek' | 'arabic' | 'hebrew'
  | 'devanagari' | 'bengali' | 'tamil' | 'telugu' | 'malayalam'
  | 'georgian' | 'armenian' | 'ethiopic'
  | 'thai' | 'myanmar' | 'hangul' | 'kana-kanji' | 'han';

export type LanguageFamily =
  | 'romance' | 'germanic' | 'slavic' | 'hellenic' | 'indo-iranian'
  | 'celtic' | 'baltic' | 'albanian' | 'armenian' | 'kartvelian'
  | 'dravidian' | 'semitic' | 'turkic' | 'uralic' | 'sino-tibetan'
  | 'mongolic' | 'japonic' | 'koreanic' | 'austronesian' | 'austroasiatic'
  | 'tai-kadai' | 'niger-congo';

/**
 * How obscure the language is: 1 = everyone has heard it, 2 = general
 * knowledge, 3 = trap. Story mode ramps this up with the level number.
 */
export type LanguageTier = 1 | 2 | 3;

/** Which of the two variants is being played. */
export type LanguageVariant = 'text' | 'audio';

export interface LanguagePhrase {
  /** Stable id `${code}-NN`. NEVER reassigned — it names the audio file. */
  id: string;
  /** The phrase in its native script, diacritics included. */
  text: string;
}

export interface LanguageDef {
  /** ISO 639-1 where it exists, else 639-3 ('fil'). Primary key. */
  code: string;
  nameFr: string;
  nameEn: string;
  /** The language's name in itself — shown on the reveal card. */
  endonym: string;
  family: LanguageFamily;
  /**
   * Finer branch inside the family ('ibero-romance', 'west-slavic'). This — not
   * `family` — is what makes es/pt and pl/cs genuinely hard to tell apart, so
   * it drives the toughest distractor tier.
   */
  branch: string;
  script: LanguageScript;
  tier: LanguageTier;
  /**
   * Extra spellings accepted when typed (CASH). MUST be latinised: normalizeAnswer
   * strips everything outside [a-z0-9], so an alias in a native script normalises
   * to the empty string and can never match.
   */
  aliases?: string[];
  /**
   * Languages confused with this one BY EAR, curated by hand. Family and script
   * say nothing about how a language sounds (Portuguese reads Romance but sounds
   * Slavic), so the audio variant treats these as its hardest distractors.
   */
  phoneticNeighbors?: string[];
  /** Illustrative flag on the reveal card (cca3, resolved via lib/flags). */
  flagCca3?: string;
  /** false removes the language from the audio variant only (poor TTS). */
  audio: boolean;
  ttsModel: 'eleven_multilingual_v2' | 'eleven_v3';
  /** Exactly 10. */
  phrases: LanguagePhrase[];
}

interface RawCorpus {
  version: number;
  languages: LanguageDef[];
}

const CORPUS = rawLanguages as unknown as RawCorpus;

/** Every language in the catalogue, in declaration order. */
export const LANGUAGES: LanguageDef[] = CORPUS.languages;

/** Bumped when phrases change; also the audio path segment (`languages/v1/…`). */
export const LANGUAGES_CORPUS_VERSION = CORPUS.version;

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export function getLanguageDef(code: string): LanguageDef | undefined {
  return BY_CODE.get(code);
}

/** Localized display name (falls back to the code for an unknown language). */
export function languageName(code: string, lang: Language): string {
  const def = BY_CODE.get(code);
  if (!def) return code;
  return tr(lang, def.nameFr, def.nameEn);
}

/**
 * Every accepted spelling for a typed (CASH) answer: both language names plus
 * the curated aliases, so a player can answer "Dutch" or "hollandais" whatever
 * the UI language is. The endonym is deliberately NOT included — in a native
 * script it normalises to nothing, and in Latin script it is already an alias
 * where it matters (Magyar, Kiswahili).
 */
export function languageAcceptedAnswers(code: string): string[] {
  const def = BY_CODE.get(code);
  if (!def) return [code];
  // `allTranslations` ajoute le nom de la langue dans les quatorze langues du
  // catalogue : « Néerlandais », « Dutch », « Nederlands », « Голландский »…
  return Array.from(
    new Set(
      [def.nameFr, def.nameEn, ...allTranslations(def.nameEn), ...(def.aliases ?? [])].filter(Boolean),
    ),
  );
}

/**
 * The playable pool for a variant. Audio drops languages whose clips are not
 * validated yet (`audio: false`), which is why the mode keeps working while the
 * voice generation is still rolling out language by language.
 */
export function languagePool(variant: LanguageVariant, maxTier?: LanguageTier): LanguageDef[] {
  return LANGUAGES.filter(
    (l) => (variant === 'text' || l.audio) && (maxTier === undefined || l.tier <= maxTier),
  );
}

/**
 * Scripts written without spaces between words. Anything measuring phrase
 * length (the corpus integrity test, layout heuristics) has to count characters
 * for these and words for the rest.
 */
const UNSPACED_SCRIPTS: ReadonlySet<LanguageScript> = new Set<LanguageScript>([
  'han', 'kana-kanji', 'thai', 'myanmar',
]);

export function isSpacedScript(script: LanguageScript): boolean {
  return !UNSPACED_SCRIPTS.has(script);
}
