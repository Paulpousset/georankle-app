import rawGameData from '../../assets/game_data.json';
import type { GameData, Theme } from '../types';

/** Typed view over the bundled game data. */
export const gameData = rawGameData as unknown as GameData;

/** Returns all themes as a flat array, with their id attached. */
export function getThemes(): Theme[] {
  return Object.entries(gameData.themes).map(([id, theme]) => ({ id, ...theme }));
}
