import { gameData, getThemes } from '../gameData';

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

describe('bundled game data integrity', () => {
  it('ships a non-empty list of countries with rank maps', () => {
    expect(gameData.countries.length).toBeGreaterThan(0);
    const sample = gameData.countries[0];
    expect(typeof sample.cca3).toBe('string');
    expect(sample.ranks).toBeDefined();
  });
});
