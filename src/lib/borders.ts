/**
 * « Frontières » — pure graph logic for the border-chain game (Travle-style):
 * link a start country to a target country through land borders in as few
 * steps as possible.
 *
 * The adjacency lives in src/data/borders.ts (validated against the official
 * per-country border counts in tests). Puzzles are seeded: the same seed gives
 * everyone the same start/target pair, so daily and online rounds are fair.
 */
import { BORDER_PAIRS } from '../data/borders';
import { createSeededRng, seededShuffle } from './rng';

/** Symmetric adjacency map, built once. */
const ADJACENCY: Map<string, string[]> = (() => {
  const adj = new Map<string, Set<string>>();
  for (const pair of BORDER_PAIRS) {
    const [a, b] = pair.split('-');
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }
  return new Map([...adj.entries()].map(([k, v]) => [k, [...v].sort()]));
})();

/** Land neighbours of a country (empty for islands / unknown codes). */
export function borderNeighbors(cca3: string): string[] {
  return ADJACENCY.get(cca3) ?? [];
}

export function sharesBorder(a: string, b: string): boolean {
  return borderNeighbors(a).includes(b);
}

/** Every country with at least one land border. */
export function borderCountries(): string[] {
  return [...ADJACENCY.keys()].sort();
}

/**
 * Shortest border path from `a` to `b` (inclusive of both ends), or null when
 * they are not connected. Plain BFS — the graph has ~160 nodes.
 */
export function shortestBorderPath(a: string, b: string): string[] | null {
  if (a === b) return [a];
  if (!ADJACENCY.has(a) || !ADJACENCY.has(b)) return null;
  const prev = new Map<string, string>([[a, a]]);
  let frontier = [a];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const n of ADJACENCY.get(node)!) {
        if (prev.has(n)) continue;
        prev.set(n, node);
        if (n === b) {
          const path = [b];
          let cur = b;
          while (cur !== a) {
            cur = prev.get(cur)!;
            path.push(cur);
          }
          return path.reverse();
        }
        next.push(n);
      }
    }
    frontier = next;
  }
  return null;
}

export interface BordersPuzzle {
  /** Chain anchor (cca3) — the player extends from here. */
  start: string;
  /** Destination (cca3). */
  target: string;
  /** Fewest border crossings between them (edges, ≥ 3). */
  optimal: number;
}

/** Puzzle difficulty window: 3–4 crossings = 2–3 intermediate countries. */
const MIN_OPTIMAL = 3;
const MAX_OPTIMAL = 4;

/**
 * A seeded puzzle: pick a well-connected start, then a target exactly
 * `optimal` crossings away. Deterministic — the same seed always yields the
 * same pair for every player.
 */
export function buildBordersPuzzle(seed: number): BordersPuzzle {
  const rng = createSeededRng(seed);
  // Anchors need ≥ 2 neighbours or the first move is forced.
  const anchors = borderCountries().filter((c) => borderNeighbors(c).length >= 2);
  const order = seededShuffle(anchors, rng);
  const wantedOptimal = MIN_OPTIMAL + Math.floor(rng() * (MAX_OPTIMAL - MIN_OPTIMAL + 1));

  for (const start of order) {
    // BFS levels from the start.
    const level = new Map<string, number>([[start, 0]]);
    let frontier = [start];
    let depth = 0;
    while (frontier.length > 0 && depth < MAX_OPTIMAL) {
      depth++;
      const next: string[] = [];
      for (const node of frontier) {
        for (const n of ADJACENCY.get(node)!) {
          if (!level.has(n)) {
            level.set(n, depth);
            next.push(n);
          }
        }
      }
      frontier = next;
    }
    for (const optimal of [wantedOptimal, wantedOptimal === MIN_OPTIMAL ? MAX_OPTIMAL : MIN_OPTIMAL]) {
      const candidates = [...level.entries()]
        .filter(([, l]) => l === optimal)
        .map(([c]) => c)
        .sort();
      if (candidates.length > 0) {
        const target = candidates[Math.floor(rng() * candidates.length)];
        return { start, target, optimal };
      }
    }
  }
  // Unreachable with the real dataset (every anchor has level-3 countries),
  // but keep a deterministic fallback for safety.
  return { start: 'FRA', target: 'POL', optimal: 3 };
}

/** Extra crossings allowed beyond the optimal before the run fails. */
export const BORDERS_EXTRA_STEPS = 3;
/** Wrong guesses (non-adjacent countries) allowed before the run fails. */
export const BORDERS_MAX_MISSES = 3;

/**
 * Raw 0–1000 score for a finished run. A win starts at 1000 and pays for
 * detours and wrong guesses (floor 200); a failed run scores on progress only.
 */
export function bordersScore(
  won: boolean,
  extraSteps: number,
  misses: number,
): number {
  if (!won) return 0;
  return Math.max(200, 1000 - 150 * extraSteps - 100 * misses);
}
