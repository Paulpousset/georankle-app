jest.mock('../supabase', () => {
  const { makeSupabaseMock } = require('../../../test-utils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

jest.mock('../log', () => ({
  log: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { supabase } from '../supabase';
import type { SupabaseMock } from '../../../test-utils/supabaseMock';
import {
  countsForLeaderboard,
  earnsCoins,
  offLeaderboardNotice,
  saveSoloScore,
} from '../soloResult';

const sb = supabase as unknown as SupabaseMock;
const USER = { id: 'u1' };

/** The builder returned by the last `from()` call — where insert() is recorded. */
const lastBuilder = () => sb.from.mock.results.at(-1)?.value as { insert: jest.Mock };

beforeEach(() => sb.__reset());

describe('countsForLeaderboard', () => {
  it('accepts a plain worldwide run', () => {
    expect(countsForLeaderboard()).toBe(true);
    expect(countsForLeaderboard({})).toBe(true);
    expect(countsForLeaderboard({ scope: null })).toBe(true);
  });

  it('rejects every biased pool', () => {
    expect(countsForLeaderboard({ scope: 'Oceania' })).toBe(false);
    expect(countsForLeaderboard({ training: true })).toBe(false);
    expect(countsForLeaderboard({ review: true })).toBe(false);
  });
});

describe('earnsCoins', () => {
  it('keeps the reward for scoped and review runs, drops it only in training', () => {
    expect(earnsCoins({ scope: 'Africa' })).toBe(true);
    expect(earnsCoins({ review: true })).toBe(true);
    expect(earnsCoins({ training: true })).toBe(false);
  });
});

describe('saveSoloScore', () => {
  it('inserts the score of a normal run untouched', async () => {
    await saveSoloScore(USER, 'globe', 820);
    expect(sb.from).toHaveBeenCalledWith('scores');
    expect(lastBuilder().insert).toHaveBeenCalledWith({
      user_id: 'u1',
      game_mode: 'globe',
      score: 820,
    });
  });

  it('skips the insert entirely when a continent is active', async () => {
    await saveSoloScore(USER, 'globe', 820, { scope: 'Africa' });
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('skips the insert in training and review runs', async () => {
    await saveSoloScore(USER, 'streak', 12, { training: true });
    await saveSoloScore(USER, 'streak', 12, { review: true });
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('does nothing without a logged-in user', async () => {
    await saveSoloScore(null, 'guess', 900);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('reports a failed insert to the caller', async () => {
    sb.__setResult('scores', { data: null, error: { message: 'nope' } });
    const onError = jest.fn();
    await saveSoloScore(USER, 'guess', 900, {}, onError);
    expect(onError).toHaveBeenCalled();
  });
});

describe('offLeaderboardNotice', () => {
  it('stays silent for a run that counts', () => {
    expect(offLeaderboardNotice({}, 'fr')).toBeNull();
  });

  it('names the continent, and prefers the stronger reason', () => {
    expect(offLeaderboardNotice({ scope: 'Americas' }, 'fr')).toBe(
      'Partie Amériques — hors classement',
    );
    expect(offLeaderboardNotice({ scope: 'Americas' }, 'en')).toBe(
      'Americas run — off the leaderboard',
    );
    expect(offLeaderboardNotice({ scope: 'Africa', training: true }, 'fr')).toContain(
      'Entraînement',
    );
    expect(offLeaderboardNotice({ review: true }, 'fr')).toContain('Révision');
  });
});
