import { angDistDeg, computeView } from '../regionView';

describe('angDistDeg', () => {
  it('is zero for identical points', () => {
    expect(angDistDeg(48, 2, 48, 2)).toBe(0);
  });

  it('measures a quarter circle along the equator', () => {
    expect(angDistDeg(0, 0, 0, 90)).toBeCloseTo(90, 5);
  });

  it('measures pole-to-equator as 90°', () => {
    expect(angDistDeg(90, 0, 0, 0)).toBeCloseTo(90, 5);
  });
});

describe('computeView', () => {
  it('falls back to a whole-world view when empty', () => {
    expect(computeView([])).toEqual({ clng: 0, clat: 0, maxAng: 30 });
  });

  it('centres on a tight cluster with a small spread', () => {
    const pts = [
      { lat: 48.8, lng: 2.3 },
      { lat: 45.7, lng: 4.8 },
      { lat: 43.6, lng: 1.4 },
    ];
    const v = computeView(pts);
    expect(v.clat).toBeGreaterThan(43);
    expect(v.clat).toBeLessThan(49);
    expect(v.clng).toBeGreaterThan(1);
    expect(v.clng).toBeLessThan(5);
    expect(v.maxAng).toBeLessThan(5);
  });

  it('handles the antimeridian: a cluster straddling ±180 centres near 180, not 0', () => {
    const pts = [
      { lat: -17, lng: 178 },
      { lat: -17, lng: -179 },
      { lat: -18, lng: 179 },
    ];
    const v = computeView(pts);
    // The spherical mean longitude must be near the dateline, never near 0.
    expect(Math.abs(v.clng)).toBeGreaterThan(170);
    // And the spread stays small (a naive averaging would give a huge maxAng).
    expect(v.maxAng).toBeLessThan(5);
  });

  it('frames outlying regions (e.g. distant islands) by growing maxAng', () => {
    const pts = [
      { lat: 40, lng: -100 }, // mainland-ish
      { lat: 39, lng: -98 },
      { lat: 21, lng: -157 }, // far outlier (Hawaii-like)
    ];
    const v = computeView(pts);
    expect(v.maxAng).toBeGreaterThan(20);
  });
});

describe('coreRegions / far-flung territories', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const load = (f: string) => require(`../../../assets/regions/${f}.json`).regions;

  it('frames mainland Norway, not Bouvet Island in the South Atlantic', () => {
    const v = computeView(load('NOR'));
    expect(v.outliers).toEqual(expect.arrayContaining(['NO-X01~']));
    expect(v.maxAng).toBeLessThan(15);
    expect(v.clat).toBeGreaterThan(55);
  });

  it('leaves the Caribbean out of the Netherlands framing', () => {
    expect(computeView(load('NLD')).maxAng).toBeLessThan(5);
  });

  it('keeps long, contiguous countries whole', () => {
    for (const f of ['CHL', 'RUS', 'FRA', 'IDN']) {
      expect(computeView(load(f)).outliers).toBeUndefined();
    }
  });
});
