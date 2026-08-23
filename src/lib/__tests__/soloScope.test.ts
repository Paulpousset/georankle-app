// Mock AsyncStorage: the pool guards under test are pure, but the module also
// hosts the persisted scope store.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => (k in store ? store[k] : null)),
      setItem: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
    },
  };
});

import { CONTINENTS } from '../../data/continents';
import {
  MIN_POOL,
  SCOPED_MODES,
  effectiveScope,
  poolSizeFor,
  scopeSupported,
  unsupportedModes,
  getTrainingMode,
  setTrainingMode,
  resetSoloScopeCache,
} from '../soloScope';
import type { GameMode } from '../../types';

describe('SCOPED_MODES', () => {
  it('covers the eight country modes and nothing else', () => {
    expect([...SCOPED_MODES].sort()).toEqual(
      ['classic', 'globe', 'guess', 'higherlower', 'quiz-capital', 'quiz-flag', 'silhouette', 'streak'].sort(),
    );
  });

  it('excludes the modes that have no single answer country', () => {
    for (const mode of ['borders', 'languages', 'regions', 'challenge', 'menu', 'local-builder'] as GameMode[]) {
      expect(SCOPED_MODES.has(mode)).toBe(false);
      expect(scopeSupported(mode, 'Europe')).toBe(false);
    }
  });

  it('gives every scoped mode a minimum pool size', () => {
    for (const mode of SCOPED_MODES) {
      expect(MIN_POOL[mode]).toBeGreaterThan(0);
    }
  });
});

describe('scopeSupported', () => {
  it('always allows the worldwide scope, even for unscoped modes', () => {
    for (const mode of ['globe', 'borders', 'languages'] as GameMode[]) {
      expect(scopeSupported(mode, null)).toBe(true);
      expect(effectiveScope(mode, null)).toBeNull();
    }
  });

  it('allows every continent on the modes that only need a country', () => {
    for (const mode of ['globe', 'guess', 'quiz-capital', 'quiz-flag', 'streak', 'higherlower'] as GameMode[]) {
      for (const c of CONTINENTS) {
        expect(scopeSupported(mode, c.id)).toBe(true);
      }
    }
  });

  it('refuses Oceania for silhouette — only 3 shapes are eligible there', () => {
    expect(poolSizeFor('silhouette', 'Oceania')).toBeLessThan(MIN_POOL.silhouette);
    expect(scopeSupported('silhouette', 'Oceania')).toBe(false);
    for (const c of ['Africa', 'Americas', 'Asia', 'Europe'] as const) {
      expect(scopeSupported('silhouette', c)).toBe(true);
    }
  });

  it('refuses Oceania for classic — 14 countries cannot cover 8 shared themes', () => {
    expect(scopeSupported('classic', 'Oceania')).toBe(false);
    for (const c of ['Africa', 'Americas', 'Asia', 'Europe'] as const) {
      expect(scopeSupported('classic', c)).toBe(true);
    }
  });
});

describe('effectiveScope', () => {
  it('degrades an unsupported combination to worldwide rather than blocking it', () => {
    expect(effectiveScope('silhouette', 'Oceania')).toBeNull();
    expect(effectiveScope('classic', 'Oceania')).toBeNull();
    expect(effectiveScope('globe', 'Oceania')).toBe('Oceania');
  });

  it('never scopes a mode that opted out, so daily/online paths stay worldwide', () => {
    expect(effectiveScope('borders', 'Africa')).toBeNull();
    expect(effectiveScope('languages', 'Africa')).toBeNull();
    expect(effectiveScope('regions', 'Africa')).toBeNull();
  });
});

describe('unsupportedModes', () => {
  it('is empty worldwide and lists exactly the two Oceania gaps', () => {
    expect(unsupportedModes(null)).toEqual([]);
    expect(unsupportedModes('Europe')).toEqual([]);
    expect(unsupportedModes('Oceania').sort()).toEqual(['classic', 'silhouette']);
  });
});

describe('training mode store', () => {
  beforeEach(() => resetSoloScopeCache());

  it('defaults to off and round-trips through the setter', () => {
    expect(getTrainingMode()).toBe(false);
    setTrainingMode(true);
    expect(getTrainingMode()).toBe(true);
    setTrainingMode(false);
    expect(getTrainingMode()).toBe(false);
  });
});
