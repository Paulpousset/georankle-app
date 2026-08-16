import {
  LANGUAGES, getLanguageDef, languageName, languageAcceptedAnswers, languagePool,
  isSpacedScript, type LanguageDef,
} from '../../data/languages';
import {
  buildLanguageRun, buildLanguageSeries, pickLanguageDistractors, variantForSeed,
  matchesLanguageAnswer, LANGUAGES_QUESTIONS_SOLO,
} from '../languages';
import { createSeededRng } from '../rng';
import { normalizeAnswer } from '../answerMatch';

const SCRIPTS = new Set([
  'latin', 'cyrillic', 'greek', 'arabic', 'hebrew',
  'devanagari', 'bengali', 'tamil', 'telugu', 'malayalam',
  'georgian', 'armenian', 'ethiopic',
  'thai', 'myanmar', 'hangul', 'kana-kanji', 'han',
]);
const FAMILIES = new Set([
  'romance', 'germanic', 'slavic', 'hellenic', 'indo-iranian',
  'celtic', 'baltic', 'albanian', 'armenian', 'kartvelian',
  'dravidian', 'semitic', 'turkic', 'uralic', 'sino-tibetan',
  'mongolic', 'japonic', 'koreanic', 'austronesian', 'austroasiatic',
  'tai-kadai', 'niger-congo',
]);

const byCode = (code: string): LanguageDef => {
  const def = getLanguageDef(code);
  if (!def) throw new Error(`missing language ${code}`);
  return def;
};

// ── Corpus integrity ─────────────────────────────────────────────────────────
// The corpus is hand-written in 31 languages, so this is where most defects will
// surface. Every rule stated in the assets/languages.json header is enforced here.
describe('corpus integrity', () => {
  it('covers enough languages, scripts and families to be a real game', () => {
    expect(LANGUAGES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(LANGUAGES.map((l) => l.script)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(LANGUAGES.map((l) => l.family)).size).toBeGreaterThanOrEqual(10);
  });

  it('has unique codes and well-formed metadata', () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const l of LANGUAGES) {
      expect(l.code).toMatch(/^[a-z]{2,3}$/);
      expect(l.nameFr).toBeTruthy();
      expect(l.nameEn).toBeTruthy();
      expect(l.endonym).toBeTruthy();
      expect(l.branch).toBeTruthy();
      expect(SCRIPTS.has(l.script)).toBe(true);
      expect(FAMILIES.has(l.family)).toBe(true);
      expect([1, 2, 3]).toContain(l.tier);
      // Missing this would silently break the audio pipeline for the language.
      expect(['eleven_multilingual_v2', 'eleven_v3']).toContain(l.ttsModel);
    }
  });

  it('gives every language exactly 10 phrases with globally unique ids', () => {
    const ids: string[] = [];
    for (const l of LANGUAGES) {
      expect(l.phrases).toHaveLength(10);
      for (const p of l.phrases) {
        expect(p.id).toMatch(/^[a-z]{2,3}-\d{2}$/);
        // The id prefixes the audio path — a mismatch would upload the clip
        // under another language's folder.
        expect(p.id.startsWith(`${l.code}-`)).toBe(true);
        ids.push(p.id);
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps phrases within playable length', () => {
    for (const l of LANGUAGES) {
      for (const p of l.phrases) {
        if (isSpacedScript(l.script)) {
          const words = p.text.trim().split(/\s+/).length;
          expect({ id: p.id, words }).toEqual({ id: p.id, words: expect.any(Number) });
          expect(words).toBeGreaterThanOrEqual(5);
          expect(words).toBeLessThanOrEqual(12);
        } else {
          // No spaces between words: count characters instead.
          expect(p.text.length).toBeGreaterThanOrEqual(8);
          expect(p.text.length).toBeLessThanOrEqual(60);
        }
        expect(p.text.length).toBeLessThanOrEqual(120);
      }
    }
  });

  it('never reuses the same text across languages', () => {
    const texts = LANGUAGES.flatMap((l) => l.phrases.map((p) => p.text));
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('avoids proper nouns, which would give the answer away', () => {
    // Heuristic: a capitalised word mid-sentence is usually a place or a person.
    // German capitalises every common noun, so it is exempt; single letters are
    // skipped for the English pronoun "I"; and the first word of each clause is
    // skipped, since a capital after "?" or "." just opens a new sentence.
    const offenders: string[] = [];
    for (const l of LANGUAGES) {
      if (l.code === 'de' || !isSpacedScript(l.script)) continue;
      for (const p of l.phrases) {
        for (const clause of p.text.split(/[.!?;:…]+/)) {
          const words = clause.trim().split(/\s+/).slice(1);
          for (const w of words) {
            const clean = w.replace(/^[¿¡("'«]+/, '');
            if (clean.length > 1 && /^\p{Lu}/u.test(clean)) offenders.push(`${p.id}: ${clean}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('carries the shibboleths that make the close pairs fair', () => {
    // Without a marker excluding the twin language, the question is a coin flip.
    const rules: [string, RegExp][] = [
      ['pt', /[ãõçâê]|nh|lh|você/i],        // excludes Spanish
      ['cs', /[řůě]/],                        // excludes Polish
      ['uk', /[іїєґ]/],                       // excludes Russian
      // \b is ASCII-only in JS, so a Cyrillic article needs an explicit
      // "not followed by a letter" guard instead.
      ['bg', /ъ|(?:та|ът|то|те)(?![\p{L}])/u], // vocalic ъ / postposed article — excludes Russian
      ['mn', /[өү]/],                         // excludes Russian, same alphabet otherwise
    ];
    for (const [code, marker] of rules) {
      for (const p of byCode(code).phrases) {
        expect({ id: p.id, ok: marker.test(p.text) }).toEqual({ id: p.id, ok: true });
      }
    }
  });

  it('declares only known, non-self phonetic neighbours', () => {
    const codes = new Set(LANGUAGES.map((l) => l.code));
    for (const l of LANGUAGES) {
      for (const n of l.phoneticNeighbors ?? []) {
        expect(codes.has(n)).toBe(true);
        expect(n).not.toBe(l.code);
      }
    }
  });
});

// ── Typed (CASH) answers ─────────────────────────────────────────────────────
describe('languageAcceptedAnswers', () => {
  it('accepts both language names and the curated aliases', () => {
    expect(languageAcceptedAnswers('nl')).toEqual(
      expect.arrayContaining(['Néerlandais', 'Dutch', 'hollandais']),
    );
    expect(languageAcceptedAnswers('fa')).toEqual(expect.arrayContaining(['farsi']));
    expect(languageAcceptedAnswers('zh')).toEqual(expect.arrayContaining(['mandarin']));
  });

  it('only lists aliases that survive normalisation', () => {
    // normalizeAnswer strips everything outside [a-z0-9]: an alias in a native
    // script normalises to "" and could never match anything.
    for (const l of LANGUAGES) {
      for (const alias of l.aliases ?? []) {
        expect({ code: l.code, alias, norm: normalizeAnswer(alias) })
          .not.toEqual({ code: l.code, alias, norm: '' });
      }
    }
  });

  it('has no cross-language collision (bulgare/hongrois, islandais/finlandais…)', () => {
    // Every accepted spelling of a language must name THAT language and no
    // other. Checked through the real CASH matcher, so the test fails if the
    // tolerance is ever loosened back to the generic two-edit rule.
    const collisions: string[] = [];
    for (const a of LANGUAGES) {
      for (const b of LANGUAGES) {
        if (a.code === b.code) continue;
        for (const spelling of languageAcceptedAnswers(a.code)) {
          if (matchesLanguageAnswer(spelling, b.code)) {
            collisions.push(`${a.code}:${spelling} → accepté pour ${b.code}`);
          }
        }
      }
    }
    expect(collisions).toEqual([]);
  });

  it('still forgives a single typo', () => {
    expect(matchesLanguageAnswer('portuguais', 'pt')).toBe(true);   // 1 faute
    expect(matchesLanguageAnswer('néerlandais', 'nl')).toBe(true);  // accents
    expect(matchesLanguageAnswer('HOLLANDAIS', 'nl')).toBe(true);   // alias, casse
    expect(matchesLanguageAnswer('bulgarian', 'hu')).toBe(false);   // 2 fautes = autre langue
    expect(matchesLanguageAnswer('', 'fr')).toBe(false);
  });

  it('falls back to the code for an unknown language', () => {
    expect(languageName('zz', 'fr')).toBe('zz');
    expect(languageAcceptedAnswers('zz')).toEqual(['zz']);
  });
});

describe('languagePool', () => {
  it('drops unvalidated languages from the audio variant only', () => {
    expect(languagePool('text').length).toBe(LANGUAGES.length);
    expect(languagePool('audio').every((l) => l.audio)).toBe(true);
  });

  it('honours the story-mode tier ramp', () => {
    expect(languagePool('text', 1).every((l) => l.tier === 1)).toBe(true);
    expect(languagePool('text', 2).every((l) => l.tier <= 2)).toBe(true);
    expect(languagePool('text', 1).length).toBeGreaterThan(4);
  });
});

// ── Run generation ───────────────────────────────────────────────────────────
describe('buildLanguageRun', () => {
  it('is deterministic for a given seed and varies across seeds', () => {
    expect(buildLanguageRun(42)).toEqual(buildLanguageRun(42));
    expect(JSON.stringify(buildLanguageRun(1))).not.toBe(JSON.stringify(buildLanguageRun(2)));
  });

  it('builds distinct option grids that contain the answer', () => {
    const run = buildLanguageRun(7, 10);
    expect(run).toHaveLength(10);
    for (const q of run) {
      expect(q.duo).toHaveLength(2);
      expect(new Set(q.duo).size).toBe(2);
      expect(q.duo).toContain(q.answer);
      expect(q.carre).toHaveLength(4);
      expect(new Set(q.carre).size).toBe(4);
      expect(q.carre).toContain(q.answer);
      // The DUO option must also be one of the CARRÉ options' peers, i.e. every
      // displayed code has to be a real language.
      for (const code of [...q.duo, ...q.carre]) expect(getLanguageDef(code)).toBeTruthy();
    }
  });

  it('never repeats a language or a phrase within a run', () => {
    const run = buildLanguageRun(99, 15);
    const answers = run.map((q) => q.answer);
    const phrases = run.map((q) => q.phrase.id);
    expect(new Set(answers).size).toBe(answers.length);
    expect(new Set(phrases).size).toBe(phrases.length);
  });

  it('serves the phrase that belongs to the answer', () => {
    for (const q of buildLanguageRun(5, 10)) {
      expect(q.phrase.id.startsWith(`${q.answer}-`)).toBe(true);
    }
  });

  it('only draws audio-ready languages in the audio variant', () => {
    for (const q of buildLanguageRun(11, 10, 'audio')) {
      expect(byCode(q.answer).audio).toBe(true);
      for (const code of q.carre) expect(byCode(code).audio).toBe(true);
    }
  });

  it('respects maxTier, and widens rather than shipping duplicate options', () => {
    for (const q of buildLanguageRun(3, 5, 'text', { maxTier: 1 })) {
      expect(byCode(q.answer).tier).toBe(1);
    }
    // Even an impossible filter must still yield a full 4-option grid.
    const run = buildLanguageRun(3, 5, 'audio', { maxTier: 0 as 1 });
    for (const q of run) expect(new Set(q.carre).size).toBe(4);
  });

  it('is pure: it never touches Math.random or the clock', () => {
    // Either one would desync the two clients of an online match, silently and
    // only sometimes — so make them throw rather than trusting a review.
    const random = jest.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random() would desync online matches');
    });
    const now = jest.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Date.now() would desync online matches');
    });
    try {
      expect(() => buildLanguageRun(123, 10)).not.toThrow();
      expect(() => buildLanguageSeries(123, [5, 5, 5], 'audio')).not.toThrow();
    } finally {
      random.mockRestore();
      now.mockRestore();
    }
  });
});

describe('buildLanguageSeries', () => {
  it('never repeats a language across the rounds of one match', () => {
    const series = buildLanguageSeries(2024, [5, 5, 5, 5, 5]);
    expect(series).toHaveLength(5);
    const all = series.flat().map((q) => q.answer);
    expect(all).toHaveLength(25);
    expect(new Set(all).size).toBe(25);
  });

  it('is deterministic and matches a single run for its first round', () => {
    expect(buildLanguageSeries(77, [5, 5])).toEqual(buildLanguageSeries(77, [5, 5]));
    expect(buildLanguageSeries(77, [5])[0]).toEqual(buildLanguageRun(77, 5));
  });

  it('always fills every round, and never twice the same language inside one', () => {
    // Best-of-9 × 5 needs more answers than there are languages, so the pool is
    // recycled. Two failure modes to rule out across many seeds: a short round
    // (which would hang the match) and a duplicate answer inside one round.
    for (const counts of [[5, 5, 5, 5, 5], Array(9).fill(5), Array(7).fill(8)]) {
      for (let s = 0; s < 60; s++) {
        const series = buildLanguageSeries(s * 7919 + 3, counts);
        expect(series.map((r) => r.length)).toEqual(counts);
        for (const round of series) {
          expect(new Set(round.map((q) => q.answer)).size).toBe(round.length);
        }
      }
    }
  });

  it('still avoids repeats while the pool is large enough', () => {
    const all = buildLanguageSeries(1, [5, 5, 5, 5, 5]).flat();
    expect(new Set(all.map((q) => q.answer)).size).toBe(all.length);
  });
});

// ── Distractors ──────────────────────────────────────────────────────────────
describe('pickLanguageDistractors', () => {
  const pool = LANGUAGES;
  const seeds = Array.from({ length: 20 }, (_, i) => i * 977 + 13);

  const tiersOf = (correct: LanguageDef) => ({
    hard: pool.filter(
      (l) => l.code !== correct.code && l.branch === correct.branch && l.script === correct.script,
    ),
    related: pool.filter(
      (l) => l.code !== correct.code
        && (l.family === correct.family || l.script === correct.script)
        && !(l.branch === correct.branch && l.script === correct.script),
    ),
  });

  it('makes CARRÉ hard: a plausible neighbour is always present when one exists', () => {
    const misses: string[] = [];
    for (const correct of pool) {
      const { hard, related } = tiersOf(correct);
      if (hard.length === 0 && related.length === 0) continue;
      for (const seed of seeds) {
        const picked = pickLanguageDistractors(pool, correct, 3, createSeededRng(seed), { variant: 'text' });
        const plausible = picked.some(
          (l) => l.family === correct.family || l.script === correct.script,
        );
        if (!plausible) misses.push(`${correct.code}@${seed}`);
      }
    }
    expect(misses).toEqual([]);
  });

  it('never fills CARRÉ with three hard neighbours (that would be solvable by elimination)', () => {
    for (const correct of pool) {
      const { hard } = tiersOf(correct);
      if (hard.length < 3) continue;
      const hardCodes = new Set(hard.map((l) => l.code));
      for (const seed of seeds) {
        const picked = pickLanguageDistractors(pool, correct, 3, createSeededRng(seed), { variant: 'text' });
        expect(picked.filter((l) => hardCodes.has(l.code)).length).toBeLessThanOrEqual(2);
      }
    }
  });

  it('keeps DUO easier than CARRÉ by avoiding the hard neighbour', () => {
    // This is the invariant that protects the DUO < CARRÉ < CASH risk ladder.
    for (const correct of pool) {
      const { hard } = tiersOf(correct);
      if (hard.length === 0) continue;
      const hardCodes = new Set(hard.map((l) => l.code));
      for (const seed of seeds) {
        const picked = pickLanguageDistractors(pool, correct, 1, createSeededRng(seed), { variant: 'text' });
        expect(picked.some((l) => hardCodes.has(l.code))).toBe(false);
      }
    }
  });

  it('degrades for languages with no close relative', () => {
    for (const code of ['ko', 'el', 'sw', 'hu', 'tr']) {
      const correct = byCode(code);
      const picked = pickLanguageDistractors(pool, correct, 3, createSeededRng(42), { variant: 'text' });
      expect(picked).toHaveLength(3);
      expect(new Set(picked.map((l) => l.code)).size).toBe(3);
      expect(picked.map((l) => l.code)).not.toContain(code);
    }
  });

  it('uses phonetic neighbours as the hard tier in the audio variant', () => {
    // Portuguese reads Romance but sounds Slavic — family and script cannot know
    // that, so the audio variant must lean on the curated list.
    const pt = byCode('pt');
    const heard = new Set<string>();
    for (const seed of seeds) {
      for (const l of pickLanguageDistractors(pool, pt, 3, createSeededRng(seed), { variant: 'audio' })) {
        heard.add(l.code);
      }
    }
    expect([...(pt.phoneticNeighbors ?? [])].some((n) => heard.has(n))).toBe(true);
  });

  it('is deterministic for a given seed', () => {
    const correct = byCode('es');
    const a = pickLanguageDistractors(pool, correct, 3, createSeededRng(8), { variant: 'text' });
    const b = pickLanguageDistractors(pool, correct, 3, createSeededRng(8), { variant: 'text' });
    expect(a.map((l) => l.code)).toEqual(b.map((l) => l.code));
  });
});

describe('variantForSeed', () => {
  it('is deterministic and produces both variants', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => i * 7919);
    const variants = seeds.map(variantForSeed);
    expect(variants).toEqual(seeds.map(variantForSeed));
    expect(variants).toContain('text');
    expect(variants).toContain('audio');
  });
});

describe('league coupling', () => {
  it('keeps the solo run at 10 questions (league_norm_score scales the 50-point max by 20)', () => {
    expect(LANGUAGES_QUESTIONS_SOLO).toBe(10);
    expect(LANGUAGES_QUESTIONS_SOLO * 5 * 20).toBe(1000);
  });
});
