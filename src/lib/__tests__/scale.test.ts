import {
  buildScaleRun,
  scalePoints,
  scaledPath,
  shapeGeometry,
  sliderPosOf,
  trueUnitPx,
  zoomAt,
  SCALE_MAX_POINTS,
  BOARD_H,
  LEFT_W,
  RIGHT_W,
} from '../scale';
import { normalizeRoundScore } from '../score';
import { simulateBotRound } from '../bot';

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
  it('keeps both countries inside their column, the right one up to max zoom', () => {
    for (const seed of [11, 42, 777, 2024, 99999]) {
      for (const q of buildScaleRun(seed, 5)) {
        const unit = trueUnitPx(q);
        const l = shapeGeometry(q.left)!;
        const r = shapeGeometry(q.right)!;
        expect(l.width * unit).toBeLessThanOrEqual(LEFT_W + 1e-6);
        expect(l.height * unit).toBeLessThanOrEqual(BOARD_H + 1e-6);
        expect(r.width * unit * q.maxZoom).toBeLessThanOrEqual(RIGHT_W + 1e-6);
        expect(r.height * unit * q.maxZoom).toBeLessThanOrEqual(BOARD_H + 1e-6);
        // …and the reference country stays big enough to read.
        expect(Math.max(l.width * unit, l.height * unit)).toBeGreaterThan(15);
        expect(scaledPath(q.left, unit, LEFT_W / 2, BOARD_H / 2)).toMatch(/^M/);
      }
    }
  });

  it('keeps France smaller than Brazil', () => {
    const fra = shapeGeometry('FRA')!;
    const bra = shapeGeometry('BRA')!;
    expect(Math.max(bra.width, bra.height)).toBeGreaterThan(Math.max(fra.width, fra.height) * 3);
  });
});

describe('scale across surfaces', () => {
  it('normalizes a round on 200 points a pair, whatever maxPointsPerQuestion says', () => {
    expect(normalizeRoundScore('scale', 1000, { numQuestions: 5, maxPointsPerQuestion: 5 })).toBe(1000);
    expect(normalizeRoundScore('scale', 500, { numQuestions: 5 })).toBe(500);
    expect(normalizeRoundScore('scale', 400, { numQuestions: 2 })).toBe(1000);
  });

  it('simulates a bot on the same 0..n×200 scale, never auto-maxed', () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const rating of [800, 1400, 2400]) {
      const { score } = simulateBotRound('scale', { roundsPerSet: 5 }, rating, rng);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1000);
      expect(normalizeRoundScore('scale', score, { numQuestions: 5, maxPointsPerQuestion: 5 })).toBeLessThan(1000);
    }
  });
});
