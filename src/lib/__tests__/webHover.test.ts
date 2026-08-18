import {
  HOVER_BRIGHTNESS_VAR,
  LIFT_ATTR,
  POINTER_CLASSES,
  buildHoverCss,
  hoverBrightness,
  hoverLift,
} from '../webHover';

/**
 * Le contrat du survol (voir lib/webHover.ts) : il ne s'applique qu'aux
 * pointeurs fins, il vise ce que react-native-web marque comme cliquable, et
 * il ne va jamais brutaliser le natif.
 */
describe('buildHoverCss', () => {
  const css = buildHoverCss(POINTER_CLASSES);

  it('confines every rule to a real mouse', () => {
    expect(css.startsWith('@media (hover: hover) and (pointer: fine) {')).toBe(true);
    // Une seule ouverture de média : aucune règle ne s'échappe au tactile.
    expect(css.match(/@media/g)).toHaveLength(1);
  });

  it('targets every class react-native-web puts on active pressables', () => {
    // Deux formes : identifiants lisibles en développement, raccourcis une
    // fois le web minifié — le survol doit marcher dans les deux builds.
    for (const cls of POINTER_CLASSES) expect(css).toContain(`.${cls}`);
    expect(css).toContain(':hover');
  });

  it('takes the tint from the theme-driven variable', () => {
    expect(css).toContain(`brightness(var(${HOVER_BRIGHTNESS_VAR}`);
  });

  it('lets the innermost pressable win over its container', () => {
    expect(css).toMatch(/:has\(.*:hover\)/);
  });

  it('leaves disabled controls alone', () => {
    expect(css).toContain("[aria-disabled='true']");
  });

  it('follows whatever class names RNW hands it', () => {
    const css2 = buildHoverCss(['r-future']);
    expect(css2).toContain('.r-future');
    for (const cls of POINTER_CLASSES) expect(css2).not.toContain(cls);
  });
});

describe('hoverBrightness', () => {
  it('brightens night cards and dims parchment ones', () => {
    expect(Number(hoverBrightness(true))).toBeGreaterThan(1);
    expect(Number(hoverBrightness(false))).toBeLessThan(1);
  });
});

describe('hoverLift', () => {
  // Les tests tournent sous le préréglage natif de jest-expo : rien ne doit
  // partir vers un View natif, qui n'a que faire d'un `dataSet`.
  it('is inert off the web', () => {
    expect(hoverLift).toEqual({});
  });

  it('is spread as a data attribute the stylesheet knows', () => {
    expect(buildHoverCss(POINTER_CLASSES)).toContain(`[${LIFT_ATTR}='lift']`);
  });
});
