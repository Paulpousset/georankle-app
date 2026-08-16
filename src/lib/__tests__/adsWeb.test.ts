import { railOffset, railSize } from '../adsWeb';
import { STAGE_MAX_WIDTH } from '../stage';

/**
 * La politique d'affichage des rails. DesktopStage borne le jeu à
 * STAGE_MAX_WIDTH ; un rail n'apparaît que s'il tient dans la gouttière avec
 * 30px de marge de chaque côté — c'est le contrat « ne recouvre jamais le jeu ».
 * Seuils qui en découlent : 160×600 dès 1340px, 300×600 dès 1620px.
 */
describe('railSize', () => {
  it('hides the rails on phone/tablet widths', () => {
    expect(railSize(375, 800)).toBeNull();
    expect(railSize(768, 1024)).toBeNull();
    expect(railSize(1119, 900)).toBeNull();
  });

  it('hides the rails until the gutter can hold one without touching the game', () => {
    expect(railSize(1339, 900)).toBeNull();
    expect(railSize(1340, 900)).toEqual({ width: 160, height: 600 });
  });

  it('shows a 160×600 wide skyscraper on laptop widths', () => {
    expect(railSize(1440, 900)).toEqual({ width: 160, height: 600 });
    expect(railSize(1600, 900)).toEqual({ width: 160, height: 600 });
  });

  it('upgrades to a 300×600 half-page on large desktops', () => {
    expect(railSize(1620, 900)).toEqual({ width: 300, height: 600 });
    expect(railSize(2560, 1440)).toEqual({ width: 300, height: 600 });
  });

  it('hides the rails when the viewport is too short for the 600px unit', () => {
    expect(railSize(1920, 659)).toBeNull();
    expect(railSize(1920, 660)).toEqual({ width: 300, height: 600 });
  });
});

describe('railOffset', () => {
  it('centres the rail inside its gutter', () => {
    const size = { width: 300, height: 600 } as const;
    // Fenêtre 1920 → gouttière (1920 − 900) / 2 = 510 ; (510 − 300) / 2 = 105.
    expect(railOffset(1920, size)).toBe(105);
  });

  it('never lets the rail touch the game column', () => {
    const size = { width: 160, height: 600 } as const;
    // Au seuil exact, la marge minimale de 30px s'applique des deux côtés.
    const offset = railOffset(1340, size);
    expect(offset).toBeGreaterThanOrEqual(30);
    expect(offset + size.width).toBeLessThanOrEqual((1340 - STAGE_MAX_WIDTH) / 2);
  });
});
