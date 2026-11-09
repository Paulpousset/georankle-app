/**
 * Ce que le menu principal retient du joueur, sur l'appareil :
 *  - ses modes favoris (étoile sur les tuiles de l'onglet Jouer) ;
 *  - ses records personnels et les modes jamais ouverts, lus pour les tuiles
 *    et pour la rubrique « À essayer » de l'Accueil.
 *
 * Tout est local et sans compte : le menu doit marcher déconnecté et hors-ligne.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { GameMode } from '../types';
import { readPersonalBest } from './personalBest';
import { hasSeenModeIntro } from './modeIntro';

const FAVORITES_KEY = 'menu:favorites:v1';

export async function readFavoriteModes(): Promise<GameMode[]> {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed.filter((m) => typeof m === 'string') as GameMode[]) : [];
  } catch {
    return [];
  }
}

/** Les favoris + une bascule. Écrit immédiatement, l'état suit sans attendre. */
export function useFavoriteModes(): [ReadonlySet<GameMode>, (mode: GameMode) => void] {
  const [favorites, setFavorites] = useState<ReadonlySet<GameMode>>(() => new Set());
  useEffect(() => {
    let alive = true;
    readFavoriteModes().then((list) => {
      if (alive) setFavorites(new Set(list));
    });
    return () => {
      alive = false;
    };
  }, []);
  const toggle = useCallback((mode: GameMode) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(mode)) next.delete(mode);
      else next.add(mode);
      AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);
  return [favorites, toggle];
}

/** Records personnels de ces modes (absent = jamais de partie comptée). */
export function usePersonalBests(
  modes: readonly GameMode[],
  refreshKey?: unknown,
): Partial<Record<GameMode, number>> {
  const [bests, setBests] = useState<Partial<Record<GameMode, number>>>({});
  const key = modes.join(',');
  useEffect(() => {
    let alive = true;
    Promise.all(modes.map(async (m) => [m, await readPersonalBest(m)] as const)).then((pairs) => {
      if (!alive) return;
      const next: Partial<Record<GameMode, number>> = {};
      for (const [m, v] of pairs) if (v != null) next[m] = v;
      setBests(next);
    });
    return () => {
      alive = false;
    };
    // `key` résume `modes` ; refreshKey relit après une partie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshKey]);
  return bests;
}

/** Les modes dont le joueur n'a jamais ouvert les règles, donc jamais joués. */
export function useUntriedModes(
  modes: readonly GameMode[],
  refreshKey?: unknown,
): GameMode[] | null {
  const [untried, setUntried] = useState<GameMode[] | null>(null);
  const key = modes.join(',');
  useEffect(() => {
    let alive = true;
    Promise.all(modes.map(async (m) => [m, await hasSeenModeIntro(m)] as const)).then((pairs) => {
      if (alive) setUntried(pairs.filter(([, seen]) => !seen).map(([m]) => m));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshKey]);
  return untried;
}
