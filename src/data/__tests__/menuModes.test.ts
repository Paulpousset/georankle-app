import { MENU_MODES, MODE_FAMILIES, foldForSearch, matchesQuery } from '../menuModes';

describe('menuModes', () => {
  it('lists each mode once, in a known family', () => {
    const modes = MENU_MODES.map((m) => m.mode);
    expect(new Set(modes).size).toBe(modes.length);
    const families = new Set(MODE_FAMILIES.map((f) => f.id));
    for (const m of MENU_MODES) expect(families.has(m.family)).toBe(true);
  });

  it('gives every online mode its own duel subtitle', () => {
    for (const m of MENU_MODES.filter((x) => x.online)) {
      expect(m.onlineSubtitleFr).toBeTruthy();
      expect(m.onlineSubtitleEn).toBeTruthy();
    }
  });

  it('searches without caring about accents or case', () => {
    expect(foldForSearch('  À l’Échelle ')).toBe('a l’echelle');
    const borders = MENU_MODES.find((m) => m.mode === 'borders')!;
    expect(matchesQuery(borders, 'frontiere')).toBe(true);
    expect(matchesQuery(borders, 'BORDERS')).toBe(true);
    expect(matchesQuery(borders, 'drapeau')).toBe(false);
    expect(matchesQuery(borders, '')).toBe(true);
  });
});
