import { normalizeRoundScore, ROUND_SCORE_MAX, STREAK_CAP } from '../score';

describe('normalizeRoundScore', () => {
  it('maps every mode to [0, ROUND_SCORE_MAX]', () => {
    const cases: Array<[Parameters<typeof normalizeRoundScore>[0], number, Parameters<typeof normalizeRoundScore>[2]?]> = [
      ['guess', 1000, undefined],
      ['guess', -50, undefined],
      ['guess', 99999, undefined],
      ['classic', 95, undefined],
      ['classic', 0, undefined],
      ['classic', 150, undefined],
      ['globe', 5000, { numQuestions: 5 }],
      ['regions', 0, { numQuestions: 5 }],
      ['versus', 25, { numQuestions: 5, maxPointsPerQuestion: 5 }],
      ['challenge', 50, { numQuestions: 10, maxPointsPerQuestion: 5 }],
      ['challenge', 0, { numQuestions: 10, maxPointsPerQuestion: 5 }],
      ['streak', 100, undefined],
      ['streak', 0, undefined],
    ];
    for (const [mode, raw, ctx] of cases) {
      const v = normalizeRoundScore(mode, raw, ctx);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(ROUND_SCORE_MAX);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('hits both endpoints per mode', () => {
    expect(normalizeRoundScore('guess', 0)).toBe(0);
    expect(normalizeRoundScore('guess', 1000)).toBe(1000);

    expect(normalizeRoundScore('classic', 0)).toBe(0);
    expect(normalizeRoundScore('classic', 100)).toBe(1000);

    expect(normalizeRoundScore('globe', 0, { numQuestions: 5 })).toBe(0);
    expect(normalizeRoundScore('globe', 5000, { numQuestions: 5 })).toBe(1000);

    expect(normalizeRoundScore('regions', 0, { numQuestions: 8 })).toBe(0);
    expect(normalizeRoundScore('regions', 8000, { numQuestions: 8 })).toBe(1000);

    expect(normalizeRoundScore('versus', 0, { numQuestions: 5, maxPointsPerQuestion: 5 })).toBe(0);
    expect(normalizeRoundScore('versus', 25, { numQuestions: 5, maxPointsPerQuestion: 5 })).toBe(1000);

    // challenge: points / (questions * 5) → 30 of 50 (10 Q) = 600.
    expect(normalizeRoundScore('challenge', 0, { numQuestions: 10, maxPointsPerQuestion: 5 })).toBe(0);
    expect(normalizeRoundScore('challenge', 50, { numQuestions: 10, maxPointsPerQuestion: 5 })).toBe(1000);
    expect(normalizeRoundScore('challenge', 30, { numQuestions: 10, maxPointsPerQuestion: 5 })).toBe(600);

    expect(normalizeRoundScore('streak', 0)).toBe(0);
    expect(normalizeRoundScore('streak', STREAK_CAP)).toBe(1000);
    expect(normalizeRoundScore('streak', STREAK_CAP * 3)).toBe(1000); // past cap clamps
  });

  it('is monotonic non-decreasing in the raw score', () => {
    const scenarios: Array<[Parameters<typeof normalizeRoundScore>[0], number, Parameters<typeof normalizeRoundScore>[2]?]> = [
      ['globe', 5000, { numQuestions: 5 }],
      ['regions', 8000, { numQuestions: 8 }],
      ['versus', 25, { numQuestions: 5, maxPointsPerQuestion: 5 }],
      ['streak', STREAK_CAP, undefined],
      ['classic', 100, undefined],
      ['guess', 1000, undefined],
    ];
    for (const [mode, max, ctx] of scenarios) {
      let prev = -1;
      for (let raw = 0; raw <= max; raw += Math.max(1, Math.floor(max / 50))) {
        const v = normalizeRoundScore(mode, raw, ctx);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });

  it('scales globe/regions by question count', () => {
    // 3 of 5 correct -> 600 ; 3 of 3 correct -> 1000
    expect(normalizeRoundScore('globe', 3000, { numQuestions: 5 })).toBe(600);
    expect(normalizeRoundScore('globe', 3000, { numQuestions: 3 })).toBe(1000);
  });

  it('falls back gracefully when context is missing', () => {
    expect(normalizeRoundScore('globe', 1000)).toBeLessThanOrEqual(ROUND_SCORE_MAX);
    expect(normalizeRoundScore('versus', 10)).toBe(0); // no max -> 0 (avoids divide-by-zero)
  });
});
