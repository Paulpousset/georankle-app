/**
 * « Langues » — pure, seeded question generation.
 *
 * A question shows one phrase and asks which language it is. Everything here is
 * a pure function of the seed, so a daily puzzle, both sides of an online match
 * and a story level all produce the exact same questions and the exact same
 * option grids for everyone who shares the seed.
 *
 * The interesting part is the distractors. Picking three random languages makes
 * the game trivial (nobody confuses Japanese with Swahili), so wrong answers are
 * drawn from three tiers of confusability — and, crucially, DUO and CARRÉ pull
 * from opposite ends of them. See pickLanguageDistractors.
 */

import {
  LANGUAGES, languagePool, languageAcceptedAnswers,
  type LanguageDef, type LanguagePhrase,
  type LanguageTier, type LanguageVariant,
} from '../data/languages';
import { normalizeAnswer, levenshtein } from './answerMatch';
import { createSeededRng, seededShuffle } from './rng';

/** Questions in a solo / daily run. The league SQL is coupled to this: a
 *  perfect run is 10 × 5 = 50 raw points, and league_norm_score scales by 20. */
export const LANGUAGES_QUESTIONS_SOLO = 10;
/** Questions in one round of an online match. */
export const LANGUAGES_QUESTIONS_ONLINE = 5;

/**
 * Whether a typed (CASH) answer names `code`.
 *
 * Deliberately stricter than the shared isAnswerClose: that one allows two edits
 * past eight letters, which is fine for country names but not here — language
 * names are short and crowd each other. "Bulgarian"/"Hungarian" and
 * "islandais"/"finlandais" are both two edits apart, so the generous rule would
 * accept the wrong language outright. One typo is forgiven, two is a different
 * language.
 */
export function matchesLanguageAnswer(input: string, code: string): boolean {
  const a = normalizeAnswer(input);
  if (!a) return false;
  const accepted = languageAcceptedAnswers(code).map(normalizeAnswer).filter(Boolean);
  if (accepted.includes(a)) return true;
  // Une saisie qui nomme EXACTEMENT une autre langue n'est jamais une faute de
  // frappe sur celle-ci : en vietnamien « Tiếng Ba Lan » (polonais) et « Tiếng
  // Hà Lan » (néerlandais) ne sont qu'à une lettre l'une de l'autre, et la
  // tolérance seule les confondrait.
  if (namesAnotherLanguage(a, code)) return false;
  return accepted.some((b) => {
    // Short names get no slack at all: "thai" vs "tha" must not pass.
    if (b.length <= 5) return false;
    return Math.abs(a.length - b.length) <= 1 && levenshtein(a, b) <= 1;
  });
}

/** Index normalisé « orthographe → langues qui l'acceptent », construit à la demande. */
let SPELLING_INDEX: Map<string, Set<string>> | null = null;

/** `true` si la saisie normalisée est l'orthographe exacte d'une AUTRE langue. */
function namesAnotherLanguage(normalized: string, code: string): boolean {
  if (!SPELLING_INDEX) {
    SPELLING_INDEX = new Map();
    for (const language of LANGUAGES) {
      for (const spelling of languageAcceptedAnswers(language.code)) {
        const key = normalizeAnswer(spelling);
        if (!key) continue;
        const owners = SPELLING_INDEX.get(key) ?? new Set<string>();
        owners.add(language.code);
        SPELLING_INDEX.set(key, owners);
      }
    }
  }
  const owners = SPELLING_INDEX.get(normalized);
  return !!owners && !owners.has(code);
}

export interface LanguageQuestion {
  phrase: LanguagePhrase;
  /** The correct language code. */
  answer: string;
  /** 2 language codes in display order (contains the answer). */
  duo: string[];
  /** 4 language codes in display order (contains the answer). */
  carre: string[];
}

export interface LanguageRunOptions {
  /** Hide obscure languages (story mode ramps this with the level). */
  maxTier?: LanguageTier;
  /** Always use the maximum number of hard distractors (ranked, late story). */
  hard?: boolean;
}

/**
 * Which variant a seed plays. Used where nobody gets to choose — the daily
 * challenge and story levels — so the whole player base gets the same one.
 */
export function variantForSeed(seed: number): LanguageVariant {
  // Bit 3 rather than the low bit: consecutive daily seeds come from a hash, but
  // consecutive story seeds are derived from the level number and their low bits
  // alternate too regularly, which would make the variant predictable.
  return (seed >>> 3) % 2 === 0 ? 'text' : 'audio';
}

/**
 * The three confusability tiers around `correct`, in a stable order.
 *
 * Each tier is sorted by code BEFORE any shuffling. That is what makes the
 * result independent of the order languages happen to be declared in the JSON:
 * reordering the corpus can never change a past draw. (The league mode pool is
 * the cautionary tale — its order is frozen forever precisely because it lacks
 * this property.)
 */
function confusabilityTiers(
  pool: LanguageDef[],
  correct: LanguageDef,
  variant: LanguageVariant,
): { t0: LanguageDef[]; t1: LanguageDef[]; t2: LanguageDef[] } {
  const others = pool.filter((l) => l.code !== correct.code).sort((a, b) => (a.code < b.code ? -1 : 1));
  const phonetic = new Set(correct.phoneticNeighbors ?? []);

  const t0: LanguageDef[] = [];
  const t1: LanguageDef[] = [];
  const t2: LanguageDef[] = [];

  for (const l of others) {
    // Hardest: reads almost the same (same branch AND same script), or — in the
    // audio variant, where spelling is invisible — sounds almost the same.
    const sameBranchAndScript = l.branch === correct.branch && l.script === correct.script;
    if (sameBranchAndScript || (variant === 'audio' && phonetic.has(l.code))) {
      t0.push(l);
      continue;
    }
    // Middle: related, or written the same way. Sharing a script is a real clue
    // on screen (fa vs ar, uk vs ru) but tells you nothing through a speaker, so
    // the audio variant drops that half of the rule.
    const sameFamily = l.family === correct.family;
    const sameScript = variant === 'text' && l.script === correct.script;
    if (sameFamily || sameScript) {
      t1.push(l);
      continue;
    }
    t2.push(l);
  }
  return { t0, t1, t2 };
}

/**
 * `count` wrong answers for `correct`, hardest-tier quota driven by `rng`.
 *
 * The quotas are deliberately INVERTED between the two option counts:
 *
 * - CARRÉ (3 wrong, 3 pts) takes one or two hard neighbours — never three.
 *   Three would let the player solve it by elimination and feel unfair; zero
 *   would make the 3-point tier free.
 * - DUO (1 wrong, 1 pt) takes the FURTHEST language it can find. If DUO drew the
 *   hard neighbour, "es or pt?" would be a coin flip — harder than CARRÉ — and
 *   the whole DUO < CARRÉ < CASH risk ladder that defines the format would
 *   invert.
 *
 * Degrades on its own: languages with no close relative (Korean, Greek, Swahili)
 * simply fall through to the next tier, so no special-casing is needed.
 */
export function pickLanguageDistractors(
  pool: LanguageDef[],
  correct: LanguageDef,
  count: number,
  rng: () => number,
  opts: { variant: LanguageVariant; hard?: boolean },
): LanguageDef[] {
  const { t0, t1, t2 } = confusabilityTiers(pool, correct, opts.variant);

  if (count <= 1) {
    // Easy tier: walk away from the answer, not towards it.
    const ordered = [...seededShuffle(t2, rng), ...seededShuffle(t1, rng), ...seededShuffle(t0, rng)];
    return ordered.slice(0, count);
  }

  // Consume the rng even when t0 is empty, so the number of draws — and
  // therefore every later shuffle — depends only on the seed, never on which
  // language came up.
  const roll = rng();
  const wanted = opts.hard ? 2 : 1 + Math.floor(roll * 2);
  const hardCount = Math.min(wanted, t0.length, count - 1);

  const hard = seededShuffle(t0, rng).slice(0, hardCount);
  const hardCodes = new Set(hard.map((l) => l.code));
  const rest = [...seededShuffle(t1, rng), ...seededShuffle(t2, rng), ...seededShuffle(t0, rng)]
    .filter((l) => !hardCodes.has(l.code));

  return [...hard, ...rest].slice(0, count);
}

function buildQuestion(
  pool: LanguageDef[],
  def: LanguageDef,
  phrase: LanguagePhrase,
  rng: () => number,
  variant: LanguageVariant,
  hard: boolean,
): LanguageQuestion {
  // Both grids are computed up front rather than when the player taps DUO or
  // CARRÉ: two clients of the same match must see identical options even if they
  // pick difficulties in a different order.
  const duoWrong = pickLanguageDistractors(pool, def, 1, rng, { variant, hard });
  const carreWrong = pickLanguageDistractors(pool, def, 3, rng, { variant, hard });
  return {
    phrase,
    answer: def.code,
    duo: seededShuffle([def.code, ...duoWrong.map((l) => l.code)], rng),
    carre: seededShuffle([def.code, ...carreWrong.map((l) => l.code)], rng),
  };
}

/**
 * A seeded session of `count` questions. Neither a language nor a phrase repeats
 * within a run.
 */
export function buildLanguageRun(
  seed: number,
  count = LANGUAGES_QUESTIONS_SOLO,
  variant: LanguageVariant = 'text',
  opts: LanguageRunOptions = {},
): LanguageQuestion[] {
  return buildLanguageSeries(seed, [count], variant, opts)[0];
}

/**
 * `counts.length` consecutive runs sharing one pool, with no language repeating
 * across the whole series.
 *
 * This exists for best-of-5 matches: 5 rounds of 5 questions is 25 draws from 31
 * languages, so per-round seeding would repeat answers constantly. Computing the
 * series in one pass from the match seed keeps both clients in sync without
 * storing anything extra in game_data — the screen just takes
 * buildLanguageSeries(seed, counts)[current_round - 1].
 */
export function buildLanguageSeries(
  seed: number,
  counts: number[],
  variant: LanguageVariant = 'text',
  opts: LanguageRunOptions = {},
): LanguageQuestion[][] {
  const rng = createSeededRng(seed);
  let pool = languagePool(variant, opts.maxTier);
  // A tier filter can leave too few languages to fill a 4-option grid; widening
  // beats shipping a question with duplicate options.
  if (pool.length < 4) pool = languagePool(variant);
  if (pool.length < 4) pool = LANGUAGES;

  const total = counts.reduce((n, c) => n + c, 0);
  // Draw whole shuffled passes over the pool until the series is covered. A
  // best-of-9 of 5 questions wants 45 answers from ~31 languages, so a plain
  // slice would leave the last rounds EMPTY — and an empty round hangs the
  // match. Recycling repeats a language late in a long series, which is a much
  // smaller price than a stuck game.
  // One spare pass covers the answers skipped by the intra-round dedup below.
  const answers: LanguageDef[] = [];
  while (answers.length < total + pool.length) answers.push(...seededShuffle(pool, rng));

  const out: LanguageQuestion[][] = [];
  let at = 0;
  for (const count of counts) {
    const round: LanguageQuestion[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < count; i++) {
      // A round straddling two passes could otherwise draw the same language
      // twice — rare (~1% of best-of-9 rounds) but glaring when it happens.
      while (at < answers.length && seen.has(answers[at].code)) at++;
      if (at >= answers.length) break;
      const def = answers[at++];
      seen.add(def.code);
      // Phrase index is drawn from the rng like everything else, so the same seed
      // always surfaces the same phrase for the same language.
      const phrase = def.phrases[Math.floor(rng() * def.phrases.length)];
      round.push(buildQuestion(pool, def, phrase, rng, variant, opts.hard ?? false));
    }
    out.push(round);
  }
  return out;
}
