jest.mock('../supabase', () => {
  const { makeSupabaseMock } = require('../../../test-utils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

import { buildRematchGameData } from '../rematch';
import type { Match, MatchGameData } from '../../types';

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    player1_id: 'a',
    player2_id: 'b',
    game_mode: 'globe',
    status: 'completed',
    is_public: false,
    is_ranked: false,
    best_of: 3,
    p1_rounds_won: 2,
    p2_rounds_won: 1,
    p1_current_score: 0,
    p2_current_score: 0,
    current_round: 3,
    p1_finished_round: true,
    p2_finished_round: true,
    game_data: { seed: 42 },
    ...overrides,
  } as Match;
}

describe('buildRematchGameData', () => {
  it('garde les réglages du match et ne change que le seed', () => {
    const m = match({
      game_data: { seed: 42, questionType: 'FLAG', roundsPerSet: 7 } as MatchGameData,
    });
    const next = buildRematchGameData(m);
    expect(next.questionType).toBe('FLAG');
    expect(next.roundsPerSet).toBe(7);
    expect(next.seed).not.toBe(42);
  });

  it("ne fabrique pas de champs que le match d'origine n'avait pas", () => {
    const next = buildRematchGameData(match());
    expect(next.sessions).toBeUndefined();
    expect(next.roundCountries).toBeUndefined();
  });

  it('régénère les sessions de Rankle quand le match en avait', () => {
    const m = match({
      game_mode: 'classic',
      best_of: 3,
      game_data: {
        seed: 42,
        sessions: { 1: { themeIds: ['x'], countryCca3s: ['FRA'] } },
      } as unknown as MatchGameData,
    });
    const next = buildRematchGameData(m) as MatchGameData & {
      sessions: Record<number, { themeIds: string[]; countryCca3s: string[] }>;
    };
    // Une session par manche, chacune avec 8 thèmes et 8 pays.
    expect(Object.keys(next.sessions)).toHaveLength(3);
    expect(next.sessions[1].themeIds).toHaveLength(8);
    expect(next.sessions[1].countryCca3s).toHaveLength(8);
    expect(next.sessions[1].countryCca3s).not.toEqual(['FRA']);
  });

  it('régénère roundCountries en gardant le nombre de questions par manche', () => {
    const m = match({
      game_data: {
        seed: 42,
        roundCountries: { 1: ['FRA', 'ESP'], 2: ['ITA', 'DEU'], 3: ['PER', 'CHL'] },
      } as unknown as MatchGameData,
    });
    const next = buildRematchGameData(m);
    expect(Object.keys(next.roundCountries!)).toHaveLength(3);
    for (const ids of Object.values(next.roundCountries!)) {
      expect(ids).toHaveLength(2);
    }
  });

  it("suit la séquence de modes d'une partie perso", () => {
    const m = match({
      best_of: 2,
      game_data: {
        seed: 42,
        is_custom: true,
        modes: ['guess', 'globe'],
        roundCountries: { 1: ['FRA'], 2: ['ESP', 'ITA'] },
      } as unknown as MatchGameData,
    });
    const next = buildRematchGameData(m);
    expect(next.modes).toEqual(['guess', 'globe']);
    expect(next.roundCountries![1]).toHaveLength(1);
    expect(next.roundCountries![2]).toHaveLength(2);
  });
});
