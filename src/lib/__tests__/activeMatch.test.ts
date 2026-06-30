// Mock AsyncStorage so the active-match pointer logic can be tested in isolation.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => (k in store ? store[k] : null)),
      setItem: jest.fn(async (k: string, v: string) => { store[k] = v; }),
      removeItem: jest.fn(async (k: string) => { delete store[k]; }),
      clear: jest.fn(async () => { for (const k of Object.keys(store)) delete store[k]; }),
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  setActiveMatch,
  getActiveMatch,
  clearActiveMatch,
  getResumableMatch,
  isResumable,
  RESUME_WINDOW_MS,
} from '../activeMatch';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('active match pointer', () => {
  it('stores and reads back a pointer', async () => {
    await setActiveMatch('m1', 1000);
    expect(await getActiveMatch()).toEqual({ matchId: 'm1', at: 1000 });
  });

  it('clears the pointer', async () => {
    await setActiveMatch('m1', 1000);
    await clearActiveMatch();
    expect(await getActiveMatch()).toBeNull();
  });

  it('returns null for an empty store', async () => {
    expect(await getActiveMatch()).toBeNull();
  });
});

describe('isResumable', () => {
  it('is true within the window and false past it', () => {
    const ref = { matchId: 'm', at: 1_000_000 };
    expect(isResumable(ref, 1_000_000 + RESUME_WINDOW_MS - 1)).toBe(true);
    expect(isResumable(ref, 1_000_000 + RESUME_WINDOW_MS + 1)).toBe(false);
    expect(isResumable(null, 0)).toBe(false);
  });
});

describe('getResumableMatch', () => {
  it('returns a fresh pointer', async () => {
    await setActiveMatch('m1', 1000);
    expect(await getResumableMatch(1000 + 5000)).toEqual({ matchId: 'm1', at: 1000 });
  });

  it('clears and returns null for a stale pointer', async () => {
    await setActiveMatch('m1', 1000);
    expect(await getResumableMatch(1000 + RESUME_WINDOW_MS + 1)).toBeNull();
    expect(await getActiveMatch()).toBeNull(); // cleared
  });
});
