import { findFreePoint, planWander, track } from '../critterPaths';

function rngOf(seed: number) {
  let s = seed >>> 0 || 1;
  return () => (s = Math.imul(s ^ (s >>> 15), 0x2c9277b5) >>> 0) / 4294967296;
}

// A 300×300 meadow with a pond (blocked disc) in the middle.
const isFree = (x: number, y: number) =>
  x >= 10 && x <= 290 && y >= 10 && y <= 290 && Math.hypot(x - 150, y - 150) > 60;
const bounds = { x0: 0, y0: 0, x1: 300, y1: 300 };

describe('planWander', () => {
  it('strolls a closed loop that never enters blocked ground', () => {
    const rng = rngOf(7);
    const start = findFreePoint({ isFree, rng, bounds })!;
    const frames = planWander(start, { isFree, rng, bounds, speed: 30 })!;
    expect(frames).not.toBeNull();
    for (const f of frames) expect(isFree(f.x, f.y)).toBe(true);
    const first = frames[0];
    const last = frames[frames.length - 1];
    expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeLessThan(0.01);
    for (let i = 1; i < frames.length; i++) expect(frames[i].t).toBeGreaterThanOrEqual(frames[i - 1].t);
  });

  it('moves in both axes and turns around, not a straight left-right line', () => {
    const rng = rngOf(11);
    const start = findFreePoint({ isFree, rng, bounds })!;
    const frames = planWander(start, { isFree, rng, bounds, speed: 30, stops: 7 })!;
    const ys = frames.map((f) => f.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(30);
    expect(new Set(frames.map((f) => f.face)).size).toBe(2);
  });

  it('gives up when there is no room', () => {
    const rng = rngOf(3);
    expect(planWander([5, 5], { isFree: () => false, rng, bounds, speed: 30 })).toBeNull();
  });
});

describe('track', () => {
  it('holds a stepped value over the interval its keyframe ends', () => {
    const frames = [
      { t: 0, x: 0, y: 0, face: 1 as const, moving: true },
      { t: 1000, x: 30, y: 0, face: 1 as const, moving: true },
      { t: 3000, x: 30, y: 0, face: 1 as const, moving: false }, // a pause
      { t: 4000, x: 0, y: 0, face: -1 as const, moving: true },
    ];
    const r = track(frames, (k) => (k.moving ? 1 : 0), true);
    const at = (t: number) => {
      const i = r.inputRange.findIndex((v) => v >= t);
      return r.outputRange[i];
    };
    expect(at(500)).toBe(1);
    expect(at(2000)).toBe(0); // stopped between 1000 and 3000
    expect(at(3500)).toBe(1);
    for (let i = 1; i < r.inputRange.length; i++) expect(r.inputRange[i]).toBeGreaterThanOrEqual(r.inputRange[i - 1]);
  });
});
