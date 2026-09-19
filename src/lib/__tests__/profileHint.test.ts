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
import { GLOBE_HINT_MAX_SHOWS, consumeGlobeHint, resetGlobeHint } from '../profileHint';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('profile globe hint', () => {
  it('shows on the first openings, then retires for good', async () => {
    const results: boolean[] = [];
    for (let i = 0; i < GLOBE_HINT_MAX_SHOWS + 2; i++) results.push(await consumeGlobeHint());
    expect(results).toEqual([true, true, true, false, false]);
  });

  it('reset makes it show again', async () => {
    for (let i = 0; i < GLOBE_HINT_MAX_SHOWS; i++) await consumeGlobeHint();
    expect(await consumeGlobeHint()).toBe(false);
    await resetGlobeHint();
    expect(await consumeGlobeHint()).toBe(true);
  });

  it('shows when storage is unavailable', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('quota'));
    expect(await consumeGlobeHint()).toBe(true);
  });
});
