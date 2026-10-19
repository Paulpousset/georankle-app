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

import { decide, MIN_INTERVAL_MS, DAILY_CAP, type GateState } from '../interstitialGate';

const START = Date.parse('2026-07-22T08:00:00Z');
const MIN = 60 * 1000;

describe('interstitial frequency gate — decide()', () => {
  it('never shows before the interval has elapsed since app launch', () => {
    expect(decide(null, START, START).show).toBe(false);
    expect(decide(null, START + MIN_INTERVAL_MS - 1, START).show).toBe(false);
    const r = decide(null, START + MIN_INTERVAL_MS, START);
    expect(r.show).toBe(true);
    expect(r.next.shownToday).toBe(1);
    expect(r.next.lastShownAt).toBe(START + MIN_INTERVAL_MS);
  });

  it('waits the full interval after an ad before showing the next one', () => {
    const shownAt = START + 20 * MIN;
    const state: GateState = { day: '2026-07-22', shownToday: 1, lastShownAt: shownAt };
    expect(decide(state, shownAt + MIN_INTERVAL_MS - MIN, START).show).toBe(false);
    expect(decide(state, shownAt + MIN_INTERVAL_MS, START).show).toBe(true);
  });

  it('a non-showing break leaves the state untouched', () => {
    const state: GateState = { day: '2026-07-22', shownToday: 2, lastShownAt: START };
    const r = decide(state, START + MIN, START);
    expect(r.show).toBe(false);
    expect(r.next).toEqual(state);
  });

  it('shows at most once per interval however many breaks happen', () => {
    let state: GateState | null = null;
    let shows = 0;
    // A break every minute for one hour → 60 min / 6 min = 10 ads.
    for (let t = 1; t <= 60; t++) {
      const r = decide(state, START + t * MIN, START);
      if (r.show) shows++;
      state = r.next;
    }
    expect(shows).toBe(Math.floor((60 * MIN) / MIN_INTERVAL_MS));
  });

  it('never exceeds the daily cap', () => {
    let state: GateState | null = null;
    let shows = 0;
    for (let i = 1; i <= DAILY_CAP + 5; i++) {
      const r = decide(state, START + i * MIN_INTERVAL_MS, START);
      if (r.show) shows++;
      state = r.next;
    }
    expect(shows).toBe(DAILY_CAP);
  });

  it('rolls the daily counter over on a new day', () => {
    const maxed: GateState = {
      day: '2026-07-21',
      shownToday: DAILY_CAP,
      lastShownAt: START - 60 * MIN,
    };
    const r = decide(maxed, START + MIN_INTERVAL_MS, START);
    expect(r.show).toBe(true);
    expect(r.next.day).toBe('2026-07-22');
    expect(r.next.shownToday).toBe(1);
  });
});
