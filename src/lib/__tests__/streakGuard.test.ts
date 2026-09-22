jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    multiSet: jest.fn(async () => {}),
  },
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date' },
  AndroidImportance: { MAX: 5 },
}));
jest.mock('expo-device', () => ({ isDevice: false }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: null, easConfig: null } }));
jest.mock('../supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../analytics', () => ({ track: jest.fn() }));
jest.mock('../log', () => ({ log: { debug: jest.fn(), error: jest.fn() } }));

import { planStreakGuard, STREAK_GUARD_HOUR } from '../notifications';

/** Build a local-time date on the same day as `base`. */
function at(base: Date, h: number, m = 0): Date {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

describe('planStreakGuard', () => {
  // A deadline far away, so only the local-evening rule applies.
  const noon = at(new Date('2026-09-22T12:00:00'), 12);
  const farDeadline = new Date(noon.getTime() + 20 * 3_600_000);

  it('does nothing without a streak worth protecting', () => {
    expect(planStreakGuard(noon, farDeadline, 0, false)).toBeNull();
    expect(planStreakGuard(noon, farDeadline, 1, false)).toBeNull();
  });

  it('does nothing once today is played', () => {
    expect(planStreakGuard(noon, farDeadline, 5, true)).toBeNull();
  });

  it('fires at the local evening hour when the deadline is far', () => {
    const plan = planStreakGuard(noon, farDeadline, 5, false);
    expect(plan).not.toBeNull();
    expect(plan!.at.getHours()).toBe(STREAK_GUARD_HOUR);
    expect(plan!.at.getMinutes()).toBe(0);
    expect(plan!.hoursLeft).toBeGreaterThanOrEqual(1);
  });

  it('fires earlier when UTC midnight comes before the evening', () => {
    // Deadline 4 h after noon: the guard must fire 3 h before it, i.e. 13:00.
    const soonDeadline = new Date(noon.getTime() + 4 * 3_600_000);
    const plan = planStreakGuard(noon, soonDeadline, 3, false);
    expect(plan).not.toBeNull();
    expect(plan!.at.getTime()).toBe(soonDeadline.getTime() - 3 * 3_600_000);
    expect(plan!.hoursLeft).toBe(3);
  });

  it('gives up when it is already too late tonight', () => {
    const late = at(noon, STREAK_GUARD_HOUR, 5);
    expect(planStreakGuard(late, farDeadline, 5, false)).toBeNull();
    const almost = at(noon, STREAK_GUARD_HOUR - 1, 50);
    expect(planStreakGuard(almost, farDeadline, 5, false)).toBeNull();
  });
});
