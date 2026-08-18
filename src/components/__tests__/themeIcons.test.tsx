import { THEME_ICONS } from '../themeIcons';
import { gameData } from '../../data/gameData';

describe('THEME_ICONS', () => {
  it('ships an Atlas icon for every theme of game_data.json', () => {
    // Un thème ajouté au pipeline sans icône s'afficherait sans pictogramme dans
    // Rankle/Streak : ce test casse tant que la table n'est pas complétée.
    const missing = Object.keys(gameData.themes).filter((id) => !THEME_ICONS[id]);
    expect(missing).toEqual([]);
  });

  it('has no icon mapped to a theme that no longer exists', () => {
    const orphans = Object.keys(THEME_ICONS).filter((id) => !gameData.themes[id]);
    expect(orphans).toEqual([]);
  });
});
