jest.mock('../analytics', () => ({ track: jest.fn() }));
jest.mock('../log', () => ({ log: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../syncQueue', () => ({ enqueue: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));
import {
  buildChallengeMessage,
  challengeLink,
  formatChallengeScore,
  isChallengeMode,
  normalizeChallengeCode,
  onChallengeIntent,
  parseChallengeCode,
  randomSeed,
  requestCreateChallenge,
  requestOpenChallenge,
  verdict,
  type ChallengeIntent,
} from '../friendChallenge';

jest.mock('../supabase', () => {
  const { makeSupabaseMock } = require('../../../test-utils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

describe('challenge links', () => {
  it('round-trips a code through the shared link', () => {
    const link = challengeLink('A3F8C13E');
    expect(link).toMatch(/\/play\?defi=A3F8C13E$/);
    expect(parseChallengeCode(link)).toBe('A3F8C13E');
  });

  it('finds the code next to other params and uppercases it', () => {
    expect(parseChallengeCode('https://playgeog.com/play?code=REF12345&defi=a3f8c13e')).toBe(
      'A3F8C13E',
    );
    expect(parseChallengeCode('geog://play?defi=abcdef12')).toBe('ABCDEF12');
  });

  it('ignores links without a valid code', () => {
    expect(parseChallengeCode(null)).toBeNull();
    expect(parseChallengeCode('https://playgeog.com/play?mode=globe')).toBeNull();
    expect(parseChallengeCode('https://playgeog.com/play?defi=ab')).toBeNull();
  });

  it('normalizes pasted codes', () => {
    expect(normalizeChallengeCode('  a3f8c13e ')).toBe('A3F8C13E');
    expect(normalizeChallengeCode('a3f8-c13e')).toBeNull();
    expect(normalizeChallengeCode(undefined)).toBeNull();
  });
});

describe('verdict', () => {
  it('higher score wins in every mode', () => {
    expect(verdict(14, 12)).toBe('win');
    expect(verdict(12, 12)).toBe('tie');
    expect(verdict(3, 12)).toBe('loss');
  });
});

describe('modes and scores', () => {
  it('accepts the daily modes only', () => {
    expect(isChallengeMode('globe')).toBe(true);
    expect(isChallengeMode('split')).toBe(true);
    expect(isChallengeMode('menu')).toBe(false);
    expect(isChallengeMode('ranked')).toBe(false);
  });

  it('formats scores like the daily end screen', () => {
    expect(formatChallengeScore('classic', 87, 'fr')).toBe('87%');
    expect(formatChallengeScore('streak', 9, 'en')).toBe('Streak of 9');
    expect(formatChallengeScore('globe', 1240, 'fr')).toBe('1240');
  });

  it('puts the score and the link in the shared message', () => {
    const msg = buildChallengeMessage('classic', 87, 'A3F8C13E', 'fr');
    expect(msg).toContain('87%');
    expect(msg).toContain('defi=A3F8C13E');
  });
});

describe('randomSeed', () => {
  it('stays a positive 31-bit integer', () => {
    expect(randomSeed(() => 0)).toBe(1);
    const hi = randomSeed(() => 0.999999999);
    expect(hi).toBeGreaterThan(0);
    expect(hi).toBeLessThan(2 ** 31);
    expect(Number.isInteger(hi)).toBe(true);
  });
});

describe('challenge intents', () => {
  it('delivers an intent raised before anyone listened, then live ones', () => {
    requestOpenChallenge('A3F8C13E');
    const got: ChallengeIntent[] = [];
    const off = onChallengeIntent((i) => got.push(i));
    requestCreateChallenge('globe', 42, '2026-11-17');
    off();
    expect(got).toEqual([
      { kind: 'answer', code: 'A3F8C13E' },
      { kind: 'create', mode: 'globe', seed: 42, date: '2026-11-17' },
    ]);
  });
});
