import { existsSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('../log', () => ({
  log: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => (k in store ? store[k] : null)),
      setItem: jest.fn(async (k: string, v: string) => { store[k] = v; }),
      removeItem: jest.fn(async (k: string) => { delete store[k]; }),
    },
  };
});

const mockPlay = jest.fn();
const mockSeekTo = jest.fn(async () => {});
const mockCreateAudioPlayer = jest.fn(() => ({ play: mockPlay, seekTo: mockSeekTo, volume: 1, remove: jest.fn() }));
const mockSetAudioModeAsync = jest.fn(async () => {});
jest.mock('expo-audio', () => ({
  createAudioPlayer: (...a: unknown[]) => mockCreateAudioPlayer(...(a as [])),
  setAudioModeAsync: (...a: unknown[]) => mockSetAudioModeAsync(...(a as [])),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SFX_NAMES,
  __resetSfxForTests,
  initSfx,
  isSfxEnabled,
  playSfx,
  preloadSfx,
  setSfxEnabled,
} from '../sfx';

beforeEach(() => {
  __resetSfxForTests();
  mockPlay.mockClear();
  mockSeekTo.mockClear();
  mockCreateAudioPlayer.mockClear();
  mockSetAudioModeAsync.mockClear();
});

describe('assets', () => {
  it('a un fichier par son (assets/sounds et SFX_NAMES doivent rester alignés)', () => {
    const dir = join(__dirname, '..', '..', '..', 'assets', 'sounds');
    for (const name of SFX_NAMES) {
      const found = existsSync(join(dir, `${name}.mp3`));
      expect({ name, found }).toEqual({ name, found: true });
    }
  });
});

describe('playSfx', () => {
  it('crée un lecteur par son, une seule fois, et rejoue depuis le début', () => {
    playSfx('correct');
    playSfx('correct');
    playSfx('wrong');
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(2);
    expect(mockPlay).toHaveBeenCalledTimes(3);
    expect(mockSeekTo).toHaveBeenCalledWith(0);
  });

  it('applique le volume du son au lecteur', () => {
    playSfx('tap');
    const player = mockCreateAudioPlayer.mock.results[0].value as { volume: number };
    expect(player.volume).toBeLessThan(1);
  });

  it('ne lève jamais, même si le natif casse', () => {
    mockCreateAudioPlayer.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect(() => playSfx('win')).not.toThrow();
    // Le lecteur raté n'est pas mis en cache : le prochain appel réessaie.
    playSfx('win');
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });

  it('reste muet quand les effets sont coupés', async () => {
    await setSfxEnabled(false);
    mockPlay.mockClear();
    playSfx('correct');
    preloadSfx();
    expect(mockPlay).not.toHaveBeenCalled();
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
  });
});

describe('réglage', () => {
  it('est activé par défaut et persiste le changement', async () => {
    expect(isSfxEnabled()).toBe(true);
    await setSfxEnabled(false);
    expect(isSfxEnabled()).toBe(false);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('sfx:v1', 'off');
  });

  it('relit le réglage au démarrage et règle la session audio', async () => {
    await AsyncStorage.setItem('sfx:v1', 'off');
    __resetSfxForTests();
    await initSfx();
    expect(isSfxEnabled()).toBe(false);
    expect(mockSetAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }),
    );
  });

  it('joue un retour sonore quand on rallume, pas quand on coupe', async () => {
    await setSfxEnabled(false);
    expect(mockPlay).not.toHaveBeenCalled();
    await setSfxEnabled(true);
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });
});
