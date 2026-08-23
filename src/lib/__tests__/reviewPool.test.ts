jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => (k in store ? store[k] : null)),
      setItem: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
      removeItem: jest.fn(async (k: string) => {
        delete store[k];
      }),
    },
  };
});

jest.mock('../log', () => ({
  log: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  GRADUATION_STREAK,
  clearReviewPool,
  recordRun,
  reviewCount,
  reviewCounts,
  reviewCountries,
  orderByReview,
} from '../reviewPool';
import type { RecapEntry } from '../../components/RunRecap';

const miss = (cca3: string): RecapEntry => ({
  cca3,
  prompt: cca3,
  correctAnswer: cca3,
  ok: false,
});
const hit = (cca3: string): RecapEntry => ({ ...miss(cca3), ok: true });

beforeEach(async () => {
  await clearReviewPool('globe');
  await clearReviewPool('silhouette');
});

describe('recordRun', () => {
  it('adds missed countries and ignores ones answered right', async () => {
    await recordRun('globe', [miss('KGZ'), hit('FRA'), miss('BEN')], '2026-08-23');
    expect(await reviewCountries('globe')).toEqual(expect.arrayContaining(['KGZ', 'BEN']));
    expect(await reviewCountries('globe')).not.toContain('FRA');
  });

  it('graduates a country after two consecutive hits, not one', async () => {
    await recordRun('globe', [miss('KGZ')], '2026-08-23');
    expect(await reviewCount('globe')).toBe(1);

    await recordRun('globe', [hit('KGZ')], '2026-08-24');
    expect(await reviewCountries('globe')).toContain('KGZ');

    await recordRun('globe', [hit('KGZ')], '2026-08-25');
    expect(await reviewCountries('globe')).not.toContain('KGZ');
    expect(GRADUATION_STREAK).toBe(2);
  });

  it('re-arms a country that is missed again mid-graduation', async () => {
    await recordRun('globe', [miss('KGZ')], '2026-08-23');
    await recordRun('globe', [hit('KGZ')], '2026-08-24');
    await recordRun('globe', [miss('KGZ')], '2026-08-25');
    // The streak reset, so one hit must no longer be enough.
    await recordRun('globe', [hit('KGZ')], '2026-08-26');
    expect(await reviewCountries('globe')).toContain('KGZ');
  });

  it('orders the pool by how often each country was missed', async () => {
    await recordRun('globe', [miss('AAA'), miss('BBB')], '2026-08-23');
    await recordRun('globe', [miss('BBB')], '2026-08-24');
    expect(await reviewCountries('globe')).toEqual(['BBB', 'AAA']);
  });

  it('keeps modes independent', async () => {
    await recordRun('globe', [miss('KGZ')], '2026-08-23');
    expect(await reviewCount('silhouette')).toBe(0);
  });

  it('ignores entries with no country (language or theme questions)', async () => {
    await recordRun('globe', [{ prompt: 'x', correctAnswer: 'y', ok: false }], '2026-08-23');
    expect(await reviewCount('globe')).toBe(0);
  });
});

describe('reviewCounts', () => {
  it('reports only the modes with something pending', async () => {
    await recordRun('globe', [miss('KGZ'), miss('BEN')], '2026-08-23');
    const counts = await reviewCounts(['globe', 'silhouette', 'streak']);
    expect(counts).toEqual({ globe: 2 });
  });
});

describe('orderByReview', () => {
  it('pulls the due countries to the front, most-missed first', () => {
    const pool = ['AAA', 'BBB', 'CCC', 'DDD'].map((cca3) => ({ cca3 }));
    expect(orderByReview(pool, ['CCC', 'AAA']).map((x) => x.cca3)).toEqual([
      'CCC',
      'AAA',
      'BBB',
      'DDD',
    ]);
  });

  it('keeps the rest of the pool as filler so a run is still full length', () => {
    const pool = ['AAA', 'BBB', 'CCC'].map((cca3) => ({ cca3 }));
    expect(orderByReview(pool, ['BBB'])).toHaveLength(3);
  });

  it('drops due countries that are outside the pool (e.g. a scoped run)', () => {
    const pool = ['FRA', 'DEU'].map((cca3) => ({ cca3 }));
    expect(orderByReview(pool, ['KEN']).map((x) => x.cca3)).toEqual(['FRA', 'DEU']);
  });

  it('leaves the pool untouched when nothing is due', () => {
    const pool = ['AAA', 'BBB'].map((cca3) => ({ cca3 }));
    expect(orderByReview(pool, [])).toBe(pool);
  });
});
