// The module imports AsyncStorage at load time; mock it (these tests exercise
// the pure `decide()` policy, not the persisted wrapper).
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));
jest.mock('../analytics', () => ({ track: jest.fn() }));
jest.mock('expo-store-review', () => ({ hasAction: jest.fn(async () => false), requestReview: jest.fn(async () => {}) }));

import { decide, MAX_ASKS, MIN_DAYS_BETWEEN, MIN_STREAK } from '../reviewPrompt';

const now = new Date('2026-09-10T18:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

describe('reviewPrompt.decide', () => {
  it('never asks below the streak threshold', () => {
    expect(decide(null, MIN_STREAK - 1, now).ask).toBe(false);
    expect(decide(null, 0, now).ask).toBe(false);
  });

  it('asks a fresh device at the threshold and records the timestamp', () => {
    const r = decide(null, MIN_STREAK, now);
    expect(r.ask).toBe(true);
    expect(r.next.askedAt).toEqual([now.toISOString()]);
  });

  it('respects the minimum gap between prompts', () => {
    const recent = { askedAt: [daysAgo(MIN_DAYS_BETWEEN - 1)] };
    expect(decide(recent, 10, now).ask).toBe(false);
    const old = { askedAt: [daysAgo(MIN_DAYS_BETWEEN + 1)] };
    const r = decide(old, 10, now);
    expect(r.ask).toBe(true);
    expect(r.next.askedAt).toHaveLength(2);
  });

  it('stops for good after MAX_ASKS prompts', () => {
    const asked = { askedAt: Array.from({ length: MAX_ASKS }, (_, i) => daysAgo(400 * (i + 1))) };
    expect(decide(asked, 30, now).ask).toBe(false);
  });

  it('tolerates a corrupt stored state', () => {
    expect(decide({ askedAt: undefined as unknown as string[] }, 5, now).ask).toBe(true);
  });
});
