import {
  buildScaleRun,
  scalePoints,
  scaledPath,
  shapeGeometry,
  sliderPosOf,
  trueUnitPx,
  zoomAt,
  SCALE_MAX_POINTS,
} from '../scale';

describe('buildScaleRun', () => {
  it('is deterministic for a given seed and varies across seeds', () => {
    expect(buildScaleRun(42)).toEqual(buildScaleRun(42));
    expect(JSON.stringify(buildScaleRun(1))).not.toBe(JSON.stringify(buildScaleRun(2)));
  });

  it('builds 5 pairs of distinct countries with a judgeable size ratio', () => {
    for (const seed of [1, 7, 99, 12345]) {
      const run = buildScaleRun(seed, 5);
      expect(run).toHaveLength(5);
      const ids = run.flatMap((q) => [q.left, q.right]);
      expect(new Set(ids).size).toBe(ids.length);
      for (const q of run) {
        const l = shapeGeometry(q.left)!;
        const r = shapeGeometry(q.right)!;
        const ratio = Math.max(r.width, r.height) / Math.max(l.width, l.height);
        const lin = ratio >= 1 ? ratio : 1 / ratio;
        expect(lin).toBeGreaterThanOrEqual(1.25);
        expect(lin).toBeLessThanOrEqual(3);
      }
    }
  });

  it('keeps the answer inside the slider range, away from the start', () => {
    for (const q of buildScaleRun(2024, 5)) {
      expect(q.minZoom).toBeLessThan(1);
      expect(q.maxZoom).toBeGreaterThan(1);
      expect(q.startZoom).toBeGreaterThanOrEqual(q.minZoom);
      expect(q.startZoom).toBeLessThanOrEqual(q.maxZoom);
      const off = q.startZoom >= 1 ? q.startZoom : 1 / q.startZoom;
      expect(off).toBeGreaterThanOrEqual(1.45 - 1e-9);
      // The answer is not pinned to the middle of the track.
      const answerPos = sliderPosOf(q, 1);
      expect(answerPos).toBeGreaterThan(0.25);
      expect(answerPos).toBeLessThan(0.75);
    }
  });
});

describe('slider mapping', () => {
  it('round-trips between position and zoom', () => {
    const [q] = buildScaleRun(5, 1);
    expect(zoomAt(q, 0)).toBeCloseTo(q.minZoom);
    expect(zoomAt(q, 1)).toBeCloseTo(q.maxZoom);
    expect(zoomAt(q, sliderPosOf(q, 1))).toBeCloseTo(1);
  });
});

describe('scalePoints', () => {
  it('rewards closeness symmetrically in log space', () => {
    expect(scalePoints(1)).toBe(SCALE_MAX_POINTS);
    expect(scalePoints(1.2)).toBe(scalePoints(1 / 1.2));
    expect(scalePoints(1.1)).toBeGreaterThan(scalePoints(1.5));
    expect(scalePoints(2.5)).toBe(0);
    expect(scalePoints(10)).toBe(0);
    expect(scalePoints(0)).toBe(0);
  });
});

describe('true scale', () => {
  it('draws both countries with the same units per km at zoom 1', () => {
    const [q] = buildScaleRun(11, 1);
    const unit = trueUnitPx(q);
    const l = shapeGeometry(q.left)!;
    const r = shapeGeometry(q.right)!;
    // The bigger country fills the reference span; both fit in their half.
    const bigger = Math.max(l.width, l.height, r.width, r.height) * unit;
    expect(bigger).toBeCloseTo(84);
    expect(scaledPath(q.left, unit, 50, 50)).toMatch(/^M/);
    expect(scaledPath(q.right, unit, 150, 50)).toMatch(/^M/);
  });

  it('keeps France smaller than Brazil', () => {
    const fra = shapeGeometry('FRA')!;
    const bra = shapeGeometry('BRA')!;
    expect(Math.max(bra.width, bra.height)).toBeGreaterThan(Math.max(fra.width, fra.height) * 3);
  });
});
