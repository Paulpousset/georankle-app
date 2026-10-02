/**
 * Wandering paths for the story map's wildlife.
 *
 * An animal no longer paces a straight line: it strolls between random
 * waypoints spread over ALL the free ground around it (up and down the screen
 * too), along curves, stops now and then (the app swaps in its idle clip —
 * grazing, sniffing…), then heads off somewhere else. The walk is a closed
 * loop so the Animated timeline repeats without a jump.
 *
 * Pure and deterministic (seeded rng) so it can be unit-tested and so a band
 * looks the same every time it scrolls back into view.
 */

export interface Keyframe {
  /** ms from the start of the loop */
  t: number;
  x: number;
  y: number;
  /** 1 = facing right, -1 = facing left (held through pauses) */
  face: 1 | -1;
  /** false while the animal is stopped at a waypoint */
  moving: boolean;
}

export interface WanderOptions {
  /** Can the animal stand at (x, y)? (anchor = bottom-centre of the sprite) */
  isFree: (x: number, y: number) => boolean;
  rng: () => number;
  /** Area to search for a starting point. */
  bounds: { x0: number; y0: number; x1: number; y1: number };
  /** Speed in px/s. */
  speed: number;
  /** Waypoints per loop (before the way home). */
  stops?: number;
  /** Leg length range in px. */
  step?: [number, number];
  /** Chance to pause at a waypoint, and pause length range in ms. */
  pauseChance?: number;
  pause?: [number, number];
  /** Vertical squash of the random headings (the map reads wider than tall). */
  vertical?: number;
}

type Pt = [number, number];

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Every point along a–b (every `every` px) is free. */
function segmentFree(a: Pt, b: Pt, isFree: WanderOptions['isFree'], every = 6): boolean {
  const n = Math.max(1, Math.ceil(dist(a, b) / every));
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    if (!isFree(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k)) return false;
  }
  return true;
}

/** Catmull-Rom point between p1 and p2 at u ∈ [0, 1]. */
function catmull(p0: Pt, p1: Pt, p2: Pt, p3: Pt, u: number): Pt {
  const u2 = u * u;
  const u3 = u2 * u;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

/** A random free starting point, or null when the area has none. */
export function findFreePoint(opts: Pick<WanderOptions, 'isFree' | 'rng' | 'bounds'>, tries = 80): Pt | null {
  const { bounds: b, rng, isFree } = opts;
  for (let i = 0; i < tries; i++) {
    const p: Pt = [b.x0 + rng() * (b.x1 - b.x0), b.y0 + rng() * (b.y1 - b.y0)];
    if (isFree(p[0], p[1])) return p;
  }
  return null;
}

/**
 * Plan one looping stroll. Returns null when there's no room to walk (the
 * caller simply doesn't place that animal).
 */
export function planWander(start: Pt, opts: WanderOptions): Keyframe[] | null {
  const {
    isFree, rng, speed, stops = 6, step = [45, 120], pauseChance = 0.45, pause = [1600, 3400], vertical = 0.7,
  } = opts;

  // 1. Waypoints: random headings, preferring a turn away from the last one.
  const way: Pt[] = [start];
  let heading = rng() * Math.PI * 2;
  for (let s = 0; s < stops; s++) {
    const from = way[way.length - 1];
    let next: Pt | null = null;
    for (let tries = 0; tries < 28 && !next; tries++) {
      const turn = (0.6 + rng() * 1.6) * (rng() < 0.5 ? -1 : 1); // 35°–125° either way
      const a = tries < 14 ? heading + turn : rng() * Math.PI * 2;
      const d = step[0] + rng() * (step[1] - step[0]);
      const cand: Pt = [from[0] + Math.cos(a) * d, from[1] + Math.sin(a) * d * vertical];
      if (isFree(cand[0], cand[1]) && segmentFree(from, cand, isFree)) {
        next = cand;
        heading = a;
      }
    }
    if (!next) break;
    way.push(next);
  }
  if (way.length < 3) return null;

  // 2. Close the loop: straight home if the way is clear, else retrace.
  const last = way[way.length - 1];
  const loop: Pt[] = segmentFree(last, start, isFree)
    ? [...way, start]
    : [...way, ...way.slice(0, -1).reverse()];

  // 3. Smooth into curves (kept only where the curve stays on free ground).
  const pts: { p: Pt; stop: boolean }[] = [];
  for (let i = 0; i < loop.length - 1; i++) {
    const p0 = loop[Math.max(0, i - 1)];
    const p1 = loop[i];
    const p2 = loop[i + 1];
    const p3 = loop[Math.min(loop.length - 1, i + 2)];
    pts.push({ p: p1, stop: true });
    const sub = [catmull(p0, p1, p2, p3, 0.33), catmull(p0, p1, p2, p3, 0.66)];
    const ok = segmentFree(p1, sub[0], isFree) && segmentFree(sub[0], sub[1], isFree) && segmentFree(sub[1], p2, isFree);
    if (ok) for (const q of sub) pts.push({ p: q, stop: false });
  }
  pts.push({ p: loop[loop.length - 1], stop: true });

  // 4. Timeline: distance / speed, a pause at some waypoints (never the last,
  //    which is the start again — the loop restarts moving).
  const frames: Keyframe[] = [];
  let t = 0;
  let face: 1 | -1 = 1;
  for (let i = 0; i < pts.length; i++) {
    const { p, stop } = pts[i];
    if (i > 0) {
      const prev = pts[i - 1].p;
      const dx = p[0] - prev[0];
      if (Math.abs(dx) > 0.5) face = dx > 0 ? 1 : -1;
      t += (dist(prev, p) / speed) * 1000;
    } else {
      const dx = pts[1].p[0] - p[0];
      if (Math.abs(dx) > 0.5) face = dx > 0 ? 1 : -1;
    }
    frames.push({ t, x: p[0], y: p[1], face, moving: true });
    if (stop && i > 0 && i < pts.length - 1 && rng() < pauseChance) {
      t += pause[0] + rng() * (pause[1] - pause[0]);
      frames.push({ t, x: p[0], y: p[1], face, moving: false });
    }
  }
  // The very first frame's facing must match the first leg (set above).
  return frames;
}

/**
 * Animated `interpolate` ranges for a keyframed track.
 *
 * Continuous tracks (x, y) blend between keyframes. `stepped` tracks (facing,
 * walking vs stopped) hold, over each interval, the value of the keyframe that
 * ENDS it — that keyframe is the one that knows whether the leg was a walk or
 * a pause, and which way the animal faced on it.
 */
export function track(
  frames: Keyframe[],
  pick: (k: Keyframe) => number,
  stepped = false,
): { inputRange: number[]; outputRange: number[] } {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  if (!stepped) {
    for (const f of frames) {
      inputRange.push(f.t);
      outputRange.push(pick(f));
    }
  } else {
    const EPS = 0.5;
    inputRange.push(frames[0].t);
    outputRange.push(pick(frames[Math.min(1, frames.length - 1)]));
    for (let i = 1; i < frames.length; i++) {
      inputRange.push(frames[i - 1].t + EPS, frames[i].t);
      outputRange.push(pick(frames[i]), pick(frames[i]));
    }
  }
  if (inputRange.length === 1) {
    inputRange.push(inputRange[0] + 1);
    outputRange.push(outputRange[0]);
  }
  return { inputRange, outputRange };
}
