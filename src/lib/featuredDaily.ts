/**
 * « GeoG du jour » : UN puzzle mis en avant chaque jour, le même pour tout le
 * monde, numéroté (#N) et partageable.
 *
 * Le défi du jour compte 15 puzzles (un par mode). C'est trop pour un rendez-
 * vous : un nouveau venu ne sait pas par où commencer, et « 0 sur 15 » donne
 * l'impression d'un devoir. L'Accueil met donc en avant un seul puzzle, qui
 * tourne entre les modes les plus accessibles. Les 14 autres restent dans le
 * hub du défi du jour, en bonus. Rien ne change côté serveur : le GeoG du jour
 * est un défi du jour ordinaire (même graine, même série, même classement).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { GameMode } from '../types';
import { DAILY_MODES, getPuzzleNumber, type DailyState } from './daily';

/**
 * Les modes qui tournent comme GeoG du jour : jouables sans explication, sans
 * clavier long, et sans mode derrière un flag (« languages »). Rotation fixe
 * (pas aléatoire) : deux jours de suite ne tombent jamais sur le même mode.
 */
export const FEATURED_ROTATION: GameMode[] = [
  'guess',
  'higherlower',
  'silhouette',
  'globe',
  'quiz-flag',
  'borders',
  'pinpoint',
  'classic',
  'quiz-capital',
  'scale',
];

/** Le mode du GeoG du jour pour une date `YYYY-MM-DD` (UTC, comme le défi). */
export function featuredDailyMode(date: string): GameMode {
  const n = getPuzzleNumber(new Date(`${date}T12:00:00Z`));
  const len = FEATURED_ROTATION.length;
  return FEATURED_ROTATION[((n % len) + len) % len];
}

/** Puzzles bonus du jour (les autres modes du défi) : faits / total. */
export function bonusProgress(state: Pick<DailyState, 'results'>, featured: GameMode) {
  const others = DAILY_MODES.filter((m) => m !== featured);
  return {
    done: others.filter((m) => state.results[m]).length,
    total: others.length,
  };
}

const AUTOSTART_KEY = 'featured:first-autostart';

/**
 * Premier lancement : ouvrir directement le GeoG du jour plutôt qu'un menu de
 * 15 modes. Une seule fois par appareil, et seulement pour quelqu'un qui n'a
 * jamais vu le tour guidé ni joué un défi (un ancien joueur garde son menu).
 */
export function shouldAutostart(
  seenTutorial: boolean,
  alreadyAutostarted: boolean,
  state: Pick<DailyState, 'streak' | 'best' | 'todayCount'>,
): boolean {
  if (seenTutorial || alreadyAutostarted) return false;
  return state.streak === 0 && state.best === 0 && state.todayCount === 0;
}

export async function hasAutostarted(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(AUTOSTART_KEY)) === '1';
  } catch {
    // Stockage illisible : ne jamais relancer une partie à chaque ouverture.
    return true;
  }
}

export async function markAutostarted(): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTOSTART_KEY, '1');
  } catch {
    /* au pire, une seconde ouverture directe */
  }
}
