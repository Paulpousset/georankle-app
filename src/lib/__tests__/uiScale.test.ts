import { UI_SCALE_MAX, UI_SCALE_MIN_HEIGHT, computeUiScale } from '../uiScale';

/**
 * Le contrat de l'agrandissement web (voir lib/uiScale.ts) :
 *  - téléphones et petites fenêtres : facteur 1 exactement, rien ne bouge ;
 *  - grand écran : on agrandit, mais jamais au point de laisser moins de
 *    UI_SCALE_MIN_HEIGHT unités de hauteur à un écran de jeu ;
 *  - jamais au-delà de UI_SCALE_MAX.
 */
describe('computeUiScale', () => {
  it('leaves phones and tablets strictly untouched', () => {
    expect(computeUiScale(390, 844)).toBe(1);
    expect(computeUiScale(430, 932)).toBe(1);
    expect(computeUiScale(810, 1080)).toBe(1);
    expect(computeUiScale(1024, 768)).toBe(1);
  });

  it('ignores gains too small to be worth a zoom', () => {
    expect(computeUiScale(1200, 900)).toBe(1);
    expect(computeUiScale(1255, 900)).toBe(1);
  });

  it('scales the app up on desktop windows, gently', () => {
    expect(computeUiScale(1280, 800)).toBe(1.05);
    expect(computeUiScale(1366, 1024)).toBe(1.1);
    expect(computeUiScale(1440, 900)).toBe(1.2);
    expect(computeUiScale(1512, 982)).toBe(1.25);
  });

  it('caps the factor so the app never turns into a magnifier', () => {
    expect(computeUiScale(1920, 1080)).toBe(UI_SCALE_MAX);
    expect(computeUiScale(3840, 2160)).toBe(UI_SCALE_MAX);
  });

  it('keeps a usable layout height on wide but short windows', () => {
    // 1600 de large invite à agrandir 1,48× ; 700 de haut l'interdit — sans quoi
    // les écrans de jeu tomberaient sous les 640 unités et se feraient tronquer.
    const scale = computeUiScale(1600, 700);
    expect(scale).toBeLessThanOrEqual(700 / UI_SCALE_MIN_HEIGHT);
    expect(700 / scale).toBeGreaterThanOrEqual(UI_SCALE_MIN_HEIGHT);
  });

  it('survives degenerate window sizes', () => {
    expect(computeUiScale(0, 0)).toBe(1);
    expect(computeUiScale(Number.NaN, 900)).toBe(1);
  });
});
