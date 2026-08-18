import { gameData, getThemes } from '../gameData';
import { getThemeDescription } from '../../i18n/themeDescriptions';

describe('getThemes', () => {
  it('flattens every theme with its id attached', () => {
    const themes = getThemes();
    expect(themes).toHaveLength(Object.keys(gameData.themes).length);
    for (const t of themes) {
      expect(typeof t.id).toBe('string');
      expect(t.id.length).toBeGreaterThan(0);
      expect(t.label).toBeDefined();
    }
  });

  it('preserves each theme id as a key of the raw data', () => {
    for (const t of getThemes()) {
      expect(gameData.themes[t.id]).toBeDefined();
    }
  });
});

describe('theme copy', () => {
  it('explains every theme in both languages', () => {
    // Un thème ajouté au pipeline sans description afficherait « Informations non
    // disponibles » dans la fiche « ? » de Rankle et de Plus ou Moins.
    const missing = getThemes()
      .filter(
        (t) =>
          getThemeDescription(t.id, 'fr').startsWith('Informations non') ||
          getThemeDescription(t.id, 'en').startsWith('Information not'),
      )
      .map((t) => t.id);
    expect(missing).toEqual([]);
  });

  it('labels every theme in both languages', () => {
    for (const t of getThemes()) {
      expect(t.label.fr.length).toBeGreaterThan(0);
      expect(t.label.en.length).toBeGreaterThan(0);
    }
  });
});

describe('bundled game data integrity', () => {
  it('ships a non-empty list of countries with rank maps', () => {
    expect(gameData.countries.length).toBeGreaterThan(0);
    const sample = gameData.countries[0];
    expect(typeof sample.cca3).toBe('string');
    expect(sample.ranks).toBeDefined();
  });
});
