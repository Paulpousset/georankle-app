/**
 * Pure ordering helpers for a review run.
 *
 * Split out of `reviewPool` on purpose: that module owns AsyncStorage, and the
 * pure game libs (silhouette, …) must stay importable without dragging a native
 * module into every consumer — including their unit tests.
 */

/**
 * Orders a pool for a review run: the countries still to revise first
 * (most-missed leading), then the rest of the pool as filler.
 *
 * Keeping the filler means a review run is still a normal game — five
 * questions, four options — rather than drying up when only two countries are
 * pending. `reviewIds` absent from `pool` are dropped, so a scoped review (say,
 * Africa) never smuggles in a country from outside the scope.
 */
export function orderByReview<T extends { cca3: string }>(pool: T[], reviewIds: string[]): T[] {
  if (!reviewIds.length) return pool;
  const priority = new Map(reviewIds.map((id, i) => [id, i]));
  const due = pool
    .filter((item) => priority.has(item.cca3))
    .sort((a, b) => priority.get(a.cca3)! - priority.get(b.cca3)!);
  if (!due.length) return pool;
  const rest = pool.filter((item) => !priority.has(item.cca3));
  return [...due, ...rest];
}

/** Same as `orderByReview` for a bare cca3 list. */
export function orderCca3sByReview(pool: string[], reviewIds: string[]): string[] {
  return orderByReview(
    pool.map((cca3) => ({ cca3 })),
    reviewIds,
  ).map((x) => x.cca3);
}
