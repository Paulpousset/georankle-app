jest.mock('../supabase', () => ({
  supabase: {
    rpc: jest.fn(async () => ({ data: { players: 10, winners: 1, coins: 10 }, error: null })),
  },
}));
jest.mock('../log', () => ({
  log: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../analytics', () => ({ track: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => (k in store ? store[k] : null)),
      setItem: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
    },
  };
});

import {
  IMPOSSIBLE_MODES,
  buildImpossibleQuestion,
  impossibleOptionLabel,
  impossiblePrompt,
  impossibleReveal,
} from '../impossible';
import { sharesBorder } from '../borders';
import {
  answerImpossible,
  getImpossibleState,
  openImpossible,
  settleAbandoned,
} from '../impossible';

const DAYS = Array.from({ length: 60 }, (_, i) =>
  new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10),
);

describe('Impossible du jour', () => {
  it('is deterministic per date and mode', () => {
    for (const mode of IMPOSSIBLE_MODES) {
      expect(buildImpossibleQuestion('2026-11-16', mode)).toEqual(
        buildImpossibleQuestion('2026-11-16', mode),
      );
    }
  });

  it('changes from one day to the next', () => {
    for (const mode of IMPOSSIBLE_MODES) {
      const a = buildImpossibleQuestion('2026-11-16', mode);
      const b = buildImpossibleQuestion('2026-11-17', mode);
      expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
    }
  });

  it('always has distinct options including the answer, with labels', () => {
    for (const date of DAYS) {
      for (const mode of IMPOSSIBLE_MODES) {
        const q = buildImpossibleQuestion(date, mode);
        expect(q.options).toContain(q.answer);
        expect(new Set(q.options).size).toBe(q.options.length);
        expect(q.options.length).toBe(q.kind === 'higher' ? 4 : 6);
        expect(impossiblePrompt(q, 'fr')).not.toMatch(/\{\d\}/);
        expect(impossibleReveal(q, 'en').length).toBeGreaterThan(0);
        for (const o of q.options)
          expect(impossibleOptionLabel(q, o, 'fr').length).toBeGreaterThan(0);
      }
    }
  });

  it('borders: exactly one option touches the subject', () => {
    for (const date of DAYS) {
      const q = buildImpossibleQuestion(date, 'borders');
      const touching = q.options.filter((o) => sharesBorder(q.subject!, o));
      expect(touching).toEqual([q.answer]);
    }
  });

  it('capitals: the capital is never given away by the country name', () => {
    for (const date of DAYS) {
      const q = buildImpossibleQuestion(date, 'quiz-capital');
      expect(impossiblePrompt(q, 'fr')).not.toContain(impossibleOptionLabel(q, q.answer, 'fr'));
    }
  });
});

describe('one attempt only', () => {
  const date = '2026-11-16';
  it('keeps the first answer', async () => {
    await openImpossible('quiz-flag', date);
    const r = await answerImpossible('quiz-flag', 'TUV', true, 4000, true, date);
    expect(r).toEqual({ players: 10, winners: 1, coins: 10 });
    expect(await answerImpossible('quiz-flag', 'NRU', false, 1000, true, date)).toBeNull();
    const s = await getImpossibleState(date);
    expect(s.answers['quiz-flag']).toMatchObject({ correct: true, choice: 'TUV', synced: true });
  });

  it('an abandoned question counts as missed', async () => {
    await openImpossible('borders', date);
    const s = await settleAbandoned(false, date);
    expect(s.answers.borders).toMatchObject({ correct: false });
    expect(await answerImpossible('borders', 'X', true, 1, false, date)).toBeNull();
  });
});
