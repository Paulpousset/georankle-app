// Mock AsyncStorage so the onboarding-flag logic can be tested in isolation.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => (k in store ? store[k] : null)),
      setItem: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
      removeItem: jest.fn(async (k: string) => {
        delete store[k];
      }),
      clear: jest.fn(async () => {
        for (const k of Object.keys(store)) delete store[k];
      }),
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getHasSeenTutorial, setHasSeenTutorial, resetTutorial } from '../tutorial';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('onboarding tutorial flag', () => {
  it('defaults to not-seen on a fresh install', async () => {
    expect(await getHasSeenTutorial()).toBe(false);
  });

  it('persists "seen" so the tour only shows once', async () => {
    await setHasSeenTutorial(true);
    expect(await getHasSeenTutorial()).toBe(true);
  });

  it('can be reset (dev/replay helper) back to not-seen', async () => {
    await setHasSeenTutorial(true);
    await resetTutorial();
    expect(await getHasSeenTutorial()).toBe(false);
  });

  it('treats unreadable storage as already-seen so the user is never trapped', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    expect(await getHasSeenTutorial()).toBe(true);
  });
});
