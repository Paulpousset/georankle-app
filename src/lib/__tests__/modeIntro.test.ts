// Mock AsyncStorage so the per-mode intro flags can be tested in isolation.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => (k in store ? store[k] : null)),
      setItem: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
      multiRemove: jest.fn(async (keys: string[]) => {
        for (const k of keys) delete store[k];
      }),
      clear: jest.fn(async () => {
        for (const k of Object.keys(store)) delete store[k];
      }),
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasSeenModeIntro, setModeIntroSeen, resetModeIntros } from '../modeIntro';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('per-mode intro flags', () => {
  it('defaults to not-seen for a mode on a fresh install', async () => {
    expect(await hasSeenModeIntro('classic')).toBe(false);
  });

  it('persists "seen" per mode so each intro shows only once', async () => {
    await setModeIntroSeen('classic');
    expect(await hasSeenModeIntro('classic')).toBe(true);
  });

  it('tracks each mode independently', async () => {
    await setModeIntroSeen('classic');
    expect(await hasSeenModeIntro('classic')).toBe(true);
    expect(await hasSeenModeIntro('streak')).toBe(false);
  });

  it('can be reset (dev/replay helper) back to not-seen', async () => {
    await setModeIntroSeen('globe');
    await resetModeIntros(['globe']);
    expect(await hasSeenModeIntro('globe')).toBe(false);
  });

  it('treats unreadable storage as already-seen so the player is never trapped', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    expect(await hasSeenModeIntro('streak')).toBe(true);
  });
});
