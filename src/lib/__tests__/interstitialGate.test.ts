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

import { decide, SHOW_EVERY_N_GAMES, DAILY_CAP, type GateState } from '../interstitialGate';

const DAY = '2026-07-22';

describe('interstitial frequency gate — decide()', () => {
  it('does not show before N games are played', () => {
    let state: GateState | null = null;
    for (let i = 1; i < SHOW_EVERY_N_GAMES; i++) {
      const r = decide(state, DAY);
      expect(r.show).toBe(false);
      state = r.next;
    }
    // The Nth game trips it.
    const r = decide(state, DAY);
    expect(r.show).toBe(true);
    expect(r.next.gamesSinceLast).toBe(0);
    expect(r.next.shownToday).toBe(1);
  });

  it('shows exactly once per N games', () => {
    let state: GateState | null = null;
    let shows = 0;
    for (let i = 0; i < SHOW_EVERY_N_GAMES * 3; i++) {
      const r = decide(state, DAY);
      if (r.show) shows++;
      state = r.next;
    }
    expect(shows).toBe(3);
  });

  it('never exceeds the daily cap', () => {
    let state: GateState | null = null;
    let shows = 0;
    // Play far more games than the cap allows.
    for (let i = 0; i < SHOW_EVERY_N_GAMES * (DAILY_CAP + 5); i++) {
      const r = decide(state, DAY);
      if (r.show) shows++;
      state = r.next;
    }
    expect(shows).toBe(DAILY_CAP);
  });

  it('rolls the counter over on a new day', () => {
    // Maxed out yesterday.
    const maxed: GateState = { day: '2026-07-21', shownToday: DAILY_CAP, gamesSinceLast: 0 };
    let state = maxed;
    let firstShowIndex = -1;
    for (let i = 0; i < SHOW_EVERY_N_GAMES; i++) {
      const r = decide(state, DAY);
      if (r.show && firstShowIndex < 0) firstShowIndex = i;
      state = r.next;
    }
    // A fresh day resets shownToday, so the Nth game of the new day shows again.
    expect(firstShowIndex).toBe(SHOW_EVERY_N_GAMES - 1);
    expect(state.day).toBe(DAY);
  });
});
