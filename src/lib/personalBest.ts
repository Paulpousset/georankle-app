/**
 * Le record personnel d'un mode solo, gardé sur l'appareil.
 *
 * Le classement en ligne stocke les scores mais ne dit pas au joueur, à
 * l'instant où il finit, qu'il vient de se dépasser — le moment où ça compte.
 * On garde donc le meilleur score par mode en local : ça marche hors-ligne,
 * déconnecté, et sans aller-retour serveur au moment de la célébration.
 *
 * Seules les parties « normales » comptent (pas de continent, pas
 * d'entraînement, pas de révision) — les mêmes règles que le classement, sinon
 * un 1000 sur l'Océanie battrait un 900 mondial.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { countsForLeaderboard, type SoloRunContext } from './soloResult';

const KEY_PREFIX = 'solo:best:v1:';

export interface PersonalBest {
  /** Le score bat le précédent record (jamais vrai pour la toute première partie). */
  isRecord: boolean;
  /** Le record d'avant cette partie, ou null s'il n'y en avait pas. */
  previous: number | null;
  ready: boolean;
}

export async function readPersonalBest(mode: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + mode);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Compare `score` au record stocké, l'enregistre s'il le dépasse, et dit si
 * c'est un nouveau record. Pure fonction d'I/O locale, jamais bloquante.
 */
export async function submitPersonalBest(
  mode: string,
  score: number,
  ctx: SoloRunContext = {},
): Promise<PersonalBest> {
  if (!countsForLeaderboard(ctx) || !Number.isFinite(score)) {
    return { isRecord: false, previous: null, ready: true };
  }
  const previous = await readPersonalBest(mode);
  const isRecord = previous != null && score > previous;
  if (previous == null || score > previous) {
    try {
      await AsyncStorage.setItem(KEY_PREFIX + mode, String(score));
    } catch {
      /* le record n'est qu'une célébration : on ne bloque rien */
    }
  }
  return { isRecord, previous, ready: true };
}

/**
 * Hook d'écran de fin : soumet le score une seule fois quand `enabled` passe à
 * vrai (la partie est finie, c'est une vraie partie solo).
 */
export function usePersonalBest(
  mode: string,
  score: number | null | undefined,
  ctx: SoloRunContext = {},
  enabled = true,
): PersonalBest {
  const [state, setState] = useState<PersonalBest>({ isRecord: false, previous: null, ready: false });
  const { scope, training, review } = ctx;
  useEffect(() => {
    if (!enabled || score == null) return;
    let alive = true;
    submitPersonalBest(mode, score, { scope, training, review }).then((r) => {
      if (alive) setState(r);
    });
    return () => {
      alive = false;
    };
    // Une seule soumission par fin de partie : on ne suit que le passage à `enabled`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  return state;
}
