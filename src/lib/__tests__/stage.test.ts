/**
 * L'habillage de la scène web ordinateur : combien de hauteur on s'autorise à
 * prendre aux écrans de jeu, et à partir de quand.
 *
 * L'invariant qui compte : l'habillage se paie sur ce qui DÉPASSE la hauteur
 * garantie aux écrans (UI_SCALE_MIN_HEIGHT), jamais dessus.
 */
import { STAGE_MIN_GAME_HEIGHT, stageChrome } from '../stage';

describe('stageChrome', () => {
  it('ne prend rien sur une fenêtre qui tient tout juste', () => {
    expect(stageChrome(STAGE_MIN_GAME_HEIGHT)).toEqual({ barHeight: 0, gapV: 0, radius: 0 });
    expect(stageChrome(645).barHeight).toBe(0);
    expect(stageChrome(645).radius).toBe(0);
  });

  it('habille en compact un portable 1440×900', () => {
    // ~658 unités une fois le zoom 1,20 appliqué : il reste 58 unités.
    expect(stageChrome(658)).toEqual({ barHeight: 30, gapV: 8, radius: 14 });
  });

  it('habille en grand dès 88 unités de rab', () => {
    expect(stageChrome(STAGE_MIN_GAME_HEIGHT + 88)).toEqual({ barHeight: 44, gapV: 16, radius: 20 });
    expect(stageChrome(STAGE_MIN_GAME_HEIGHT + 87).barHeight).toBe(30);
    // L'écran de Paul : 1710×983 à un zoom de 1,25 → 786 unités.
    expect(stageChrome(786).barHeight).toBe(44);
  });

  it('ne mange jamais la hauteur garantie au jeu', () => {
    for (const h of [600, 640, 646, 660, 676, 700, 740, 786, 900, 1200]) {
      const c = stageChrome(h);
      expect(h - c.barHeight - c.gapV * 2).toBeGreaterThanOrEqual(STAGE_MIN_GAME_HEIGHT - 4);
    }
  });

  it('ne laisse jamais la barre recouvrir un rail publicitaire', () => {
    // Un rail fait 600 unités de haut, centré verticalement, et n'existe qu'à
    // partir de 660 unités de fenêtre (railSize, lib/adsWeb.ts). Le haut du
    // rail est donc à (h − 600) / 2 : il doit rester sous la barre.
    for (let h = 660; h <= 1200; h += 10) {
      expect(stageChrome(h).barHeight).toBeLessThanOrEqual((h - 600) / 2);
    }
  });
});
