jest.mock('../analytics', () => ({ track: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}) },
}));
jest.mock('../supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('../log', () => ({ log: { debug: jest.fn(), error: jest.fn() } }));
jest.mock('../syncQueue', () => ({ enqueue: jest.fn() }));
jest.mock('../shareDaily', () => ({ getCachedReferralCode: jest.fn(() => null) }));

import { buildSoloShareMessage, soloShareLink } from '../shareSolo';

describe('soloShareLink', () => {
  it('opens the same mode when a URL can boot into it', () => {
    expect(soloShareLink('quiz-flag', 'A3F8C13E')).toBe(
      'https://playgeog.com/play?mode=quiz-flag&code=A3F8C13E',
    );
  });

  it('falls back to the daily entry for modes a URL cannot boot', () => {
    expect(soloShareLink('regions', null)).toBe('https://playgeog.com/play?s=solo');
    expect(soloShareLink('languages', 'ABCD1234')).toBe('https://playgeog.com/play?code=ABCD1234');
  });

  it('tags logged-out shares so opens stay measurable', () => {
    expect(soloShareLink('globe')).toBe('https://playgeog.com/play?mode=globe&s=solo');
  });
});

describe('buildSoloShareMessage', () => {
  it('composes mode, score, call to action and link in French', () => {
    const msg = buildSoloShareMessage({ mode: 'quiz-flag', summary: '12/15', language: 'fr', refCode: 'A3F8C13E' });
    expect(msg.split('\n')).toEqual([
      '🌍 GeoG — Drapeaux',
      'Score : 12/15',
      'Tu fais mieux ? 👇',
      'https://playgeog.com/play?mode=quiz-flag&code=A3F8C13E',
    ]);
  });

  it('composes the English variant without a code', () => {
    const msg = buildSoloShareMessage({ mode: 'streak', summary: 'Streak of 9', language: 'en' });
    expect(msg).toContain('🌍 GeoG — Streak');
    expect(msg).toContain('Score: Streak of 9');
    expect(msg).toContain('Can you beat it? 👇');
    expect(msg.endsWith('https://playgeog.com/play?mode=streak&s=solo')).toBe(true);
  });
});
