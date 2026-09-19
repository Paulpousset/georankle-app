/**
 * Cross-registry invariants for game modes.
 *
 * Adding a mode means touching a dozen catalogues. Three of them fail SILENTLY —
 * `MODE_INTROS` is a Partial<Record<>>, `dailyModeLabel` and `matchModeOf` end in
 * a `default:` — so `tsc` says nothing and the mode just misbehaves in
 * production, sometimes weeks later (MODE_META is read non-optionally by
 * LeagueDetail, which would crash only on the day the draw picks the new mode).
 *
 * These tests turn each of those into a build failure instead.
 */
// daily.ts pulls in Supabase + AsyncStorage + Sentry; none matter for the pure
// catalogues under test here (same mocks as daily.test.ts).
jest.mock('../supabase', () => ({
  supabase: { rpc: jest.fn(async () => ({ data: null, error: null })) },
}));
jest.mock('../log', () => ({
  log: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

import { DAILY_MODES, dailyModeLabel } from '../daily';
import { LEAGUE_MODE_POOL } from '../league';
import { MODE_INTROS } from '../../data/modeIntros';
import { MODE_META } from '../../screens/DailyHub';
import { normalizeRoundScore } from '../score';
import type { GameMode, MatchMode } from '../../types';

/** Every GameMode a player can actually launch (excludes the menu pseudo-mode). */
const PLAYABLE: GameMode[] = [
  'classic', 'streak', 'versus', 'guess', 'globe', 'regions', 'challenge',
  'quiz-capital', 'quiz-flag', 'higherlower', 'silhouette', 'pinpoint', 'borders',
  'languages', 'local-builder',
];

describe('mode registries stay in sync', () => {
  it('gives every playable mode a "how to play" card', () => {
    for (const mode of PLAYABLE) {
      expect({ mode, hasIntro: !!MODE_INTROS[mode] }).toEqual({ mode, hasIntro: true });
    }
  });

  it('gives every daily mode an icon and a real label', () => {
    for (const mode of DAILY_MODES) {
      // MODE_META[mode] is dereferenced without a guard in DailyHub and
      // LeagueDetail — a missing entry is a crash, not a fallback.
      expect({ mode, hasMeta: !!MODE_META[mode] }).toEqual({ mode, hasMeta: true });
      // dailyModeLabel ends in `default: return mode`, so an unlabelled mode
      // shows its raw key ("higherlower") to the player.
      expect({ mode, label: dailyModeLabel(mode, 'fr') }).not.toEqual({ mode, label: mode });
      expect({ mode, label: dailyModeLabel(mode, 'en') }).not.toEqual({ mode, label: mode });
    }
  });

  it('only puts modes with a daily puzzle in the league pool', () => {
    // league_leaderboard aggregates daily_results rows, so a league mode with no
    // daily challenge would score zero for every member, forever — and silently.
    for (const mode of LEAGUE_MODE_POOL) {
      expect({ mode, isDaily: DAILY_MODES.includes(mode) }).toEqual({ mode, isDaily: true });
    }
  });
});

describe('normalizeRoundScore covers every match mode', () => {
  // The `default:` arm clamps the raw score, which silently turns a 25/50-point
  // quiz round into 25/1000 — a guaranteed loss with no error anywhere.
  const QUIZ_MODES: MatchMode[] = ['silhouette', 'pinpoint', 'challenge', 'languages'];

  it('scales point-based quizzes onto the full 0-1000 range', () => {
    for (const mode of QUIZ_MODES) {
      const perfect = normalizeRoundScore(mode, 50, { numQuestions: 10, maxPointsPerQuestion: 5 });
      const half = normalizeRoundScore(mode, 25, { numQuestions: 10, maxPointsPerQuestion: 5 });
      expect({ mode, perfect, half }).toEqual({ mode, perfect: 1000, half: 500 });
    }
  });
});
