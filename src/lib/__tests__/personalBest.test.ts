// Le record personnel vit dans AsyncStorage : on le simule en mémoire. Le
// magasin vit DANS la fabrique (les imports sont hissés au-dessus des
// constantes du module) et s'expose par `__store`.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    __store: store,
    default: {
      getItem: jest.fn(async (k: string) => store.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
      removeItem: jest.fn(async (k: string) => {
        store.delete(k);
      }),
    },
  };
});

jest.mock('../log', () => ({
  log: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../supabase', () => {
  const { makeSupabaseMock } = require('../../../test-utils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

import { readPersonalBest, submitPersonalBest } from '../personalBest';

const mockStore = (jest.requireMock('@react-native-async-storage/async-storage') as { __store: Map<string, string> }).__store;

describe('submitPersonalBest', () => {
  beforeEach(() => mockStore.clear());

  it('la toute première partie ne fait pas un record (rien à battre) mais s’enregistre', async () => {
    const r = await submitPersonalBest('globe', 620);
    expect(r).toEqual({ isRecord: false, previous: null, ready: true });
    expect(await readPersonalBest('globe')).toBe(620);
  });

  it('un score supérieur au record est un record et le remplace', async () => {
    await submitPersonalBest('globe', 620);
    const r = await submitPersonalBest('globe', 900);
    expect(r).toEqual({ isRecord: true, previous: 620, ready: true });
    expect(await readPersonalBest('globe')).toBe(900);
  });

  it('un score égal ou inférieur ne touche à rien', async () => {
    await submitPersonalBest('globe', 900);
    expect((await submitPersonalBest('globe', 900)).isRecord).toBe(false);
    expect((await submitPersonalBest('globe', 300)).isRecord).toBe(false);
    expect(await readPersonalBest('globe')).toBe(900);
  });

  it('les modes sont indépendants', async () => {
    await submitPersonalBest('globe', 900);
    expect((await submitPersonalBest('streak', 12)).previous).toBeNull();
  });

  it('une partie biaisée (continent, entraînement, révision) ne compte jamais', async () => {
    await submitPersonalBest('globe', 100);
    for (const ctx of [{ scope: 'africa' as never }, { training: true }, { review: true }]) {
      const r = await submitPersonalBest('globe', 1000, ctx);
      expect(r.isRecord).toBe(false);
    }
    expect(await readPersonalBest('globe')).toBe(100);
  });

  it('ignore un score non fini', async () => {
    expect((await submitPersonalBest('globe', Number.NaN)).isRecord).toBe(false);
    expect(await readPersonalBest('globe')).toBeNull();
  });
});
