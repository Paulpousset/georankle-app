// Mock AsyncStorage + Supabase : `withGameGlobe` est pur, mais il vit à côté de
// la préférence globe, qui importe les deux (voir globeSkin.test.ts).
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
    multiGet: jest.fn(async (keys: string[]) => keys.map((k) => [k, null])),
  },
}));

jest.mock('../supabase', () => {
  const { makeSupabaseMock } = require('../../../test-utils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

import { withGameGlobe } from '../myGlobe';
import { DEFAULT_AVATAR_CONFIG, getPart } from '../../data/cosmetics';
import { GLOBE_PARTS, partStyleKey } from '../globeSkin';
import type { AvatarConfig } from '../../types';

describe('withGameGlobe', () => {
  const base: AvatarConfig = DEFAULT_AVATAR_CONFIG;

  it('rend la config telle quelle sans choix in-game', () => {
    expect(withGameGlobe(base, null)).toBe(base);
  });

  it('remplace la couche globe par le globe choisi en jeu', () => {
    // Un globe du catalogue qui n'est pas celui équipé par défaut.
    const other = GLOBE_PARTS.find((p) => p.id !== base.layers.globe.id)!;
    const next = withGameGlobe(base, partStyleKey(other))!;
    expect(next.layers.globe.id).toBe(other.id);
    // Le reste de l'identité (cosmos, orbite, emblème…) est intact.
    expect(next.layers.cosmos).toEqual(base.layers.cosmos);
    expect(base.layers.globe.id).not.toBe(other.id); // pas de mutation
  });

  it('ignore un style inconnu plutôt que de vider le globe', () => {
    const next = withGameGlobe(base, 'style_qui_nexiste_pas')!;
    expect(next.layers.globe.id).toBe(base.layers.globe.id);
  });

  it('ne fabrique pas de config quand il n’y en a pas', () => {
    expect(withGameGlobe(null, 'classic')).toBeNull();
  });

  it('chaque globe du catalogue reste résoluble en cosmétique', () => {
    for (const part of GLOBE_PARTS) {
      expect(getPart('globe', part.id)).toBeDefined();
    }
  });
});
