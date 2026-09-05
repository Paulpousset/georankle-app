import { UI_SCALE_MAX, UI_SCALE_MIN_HEIGHT, computeUiScale } from '../uiScale';

/**
 * Le contrat de l'échelle web (voir lib/uiScale.ts) :
 *  - réglage du jour : plafond à 1, donc l'app est rendue 1:1 partout ;
 *  - la courbe reste câblée sous ce plafond — on l'exerce en passant un `max`
 *    explicite, pour que remonter la molette ne soit pas un saut dans le vide :
 *    téléphones et petites fenêtres à 1 exactement, agrandissement doux
 *    au-delà, jamais au point de laisser moins de UI_SCALE_MIN_HEIGHT unités
 *    de hauteur à un écran de jeu.
 */
describe('computeUiScale', () => {
  it('renders the app 1:1 on every desktop window with the current cap', () => {
    expect(UI_SCALE_MAX).toBe(1);
    expect(computeUiScale(1280, 800)).toBe(1);
    expect(computeUiScale(1440, 900)).toBe(1);
    expect(computeUiScale(1512, 982)).toBe(1);
    expect(computeUiScale(1920, 1080)).toBe(1);
    expect(computeUiScale(3840, 2160)).toBe(1);
  });

  it('leaves phones and tablets strictly untouched, cap or no cap', () => {
    expect(computeUiScale(390, 844, 1.25)).toBe(1);
    expect(computeUiScale(430, 932, 1.25)).toBe(1);
    expect(computeUiScale(810, 1080, 1.25)).toBe(1);
    expect(computeUiScale(1024, 768, 1.25)).toBe(1);
  });

  it('ignores gains too small to be worth a zoom', () => {
    expect(computeUiScale(1200, 900, 1.25)).toBe(1);
    expect(computeUiScale(1255, 900, 1.25)).toBe(1);
  });

  it('scales the app up on desktop windows when the cap allows it', () => {
    expect(computeUiScale(1280, 800, 1.25)).toBe(1.05);
    expect(computeUiScale(1366, 1024, 1.25)).toBe(1.1);
    expect(computeUiScale(1440, 900, 1.25)).toBe(1.2);
    expect(computeUiScale(1512, 982, 1.25)).toBe(1.25);
  });

  it('caps the factor so the app never turns into a magnifier', () => {
    expect(computeUiScale(1920, 1080, 1.25)).toBe(1.25);
    expect(computeUiScale(3840, 2160, 1.15)).toBe(1.15);
  });

  it('keeps a usable layout height on wide but short windows', () => {
    // 1600 de large invite à agrandir 1,48× ; 700 de haut l'interdit — sans quoi
    // les écrans de jeu tomberaient sous les 640 unités et se feraient tronquer.
    const scale = computeUiScale(1600, 700, 1.5);
    expect(scale).toBeLessThanOrEqual(700 / UI_SCALE_MIN_HEIGHT);
    expect(700 / scale).toBeGreaterThanOrEqual(UI_SCALE_MIN_HEIGHT);
  });

  it('survives degenerate window sizes', () => {
    expect(computeUiScale(0, 0)).toBe(1);
    expect(computeUiScale(Number.NaN, 900)).toBe(1);
    expect(computeUiScale(Number.NaN, 900, 1.25)).toBe(1);
  });
});
