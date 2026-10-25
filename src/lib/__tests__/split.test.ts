import {
  bestSplitError,
  buildSplitRun,
  cityParts,
  clipToBoard,
  partCells,
  partShares,
  placeLabels,
  scoreLines,
  splitCountries,
  splitGroups,
  splitMapName,
  isSplitGroup,
  SPLIT_GROUPS,
  splitError,
  splitMap,
  splitPoints,
  SPLIT_MAX_POINTS,
  type SplitLine,
} from '../split';

const vertical = (x: number): SplitLine => ({ a: { x, y: 0 }, b: { x, y: 10 } });
const horizontal = (y: number): SplitLine => ({ a: { x: 0, y }, b: { x: 10, y } });

describe('splitMap', () => {
  it('builds a board for every listed country, cities inside it and spaced out', () => {
    const countries = splitCountries();
    expect(countries.length).toBeGreaterThanOrEqual(20);
    expect(countries).toContain('FRA');
    for (const cca3 of countries) {
      const m = splitMap(cca3)!;
      expect(m).not.toBeNull();
      expect(m.cities.length).toBeGreaterThanOrEqual(7);
      expect(m.total).toBe(m.cities.reduce((s, c) => s + c.pop, 0));
      for (const c of m.cities) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x).toBeLessThanOrEqual(m.width);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeLessThanOrEqual(m.height);
      }
    }
  });

  it('leaves out territories the map does not draw', () => {
    const fra = splitMap('FRA')!;
    expect(fra.cities.map((c) => c.name)).toContain('Paris');
    expect(fra.cities.map((c) => c.name)).not.toContain('Fort-de-France');
  });

  it('localizes city names', () => {
    const deu = splitMap('DEU')!;
    expect(deu.cities.find((c) => c.name === 'Cologne')?.names?.de).toBe('Köln');
  });
});

describe('multi-country maps', () => {
  it('builds every group, cities from several members and inside the board', () => {
    const groups = splitGroups();
    expect(groups.length).toBe(SPLIT_GROUPS.length);
    for (const id of groups) {
      const m = splitMap(id)!;
      expect(isSplitGroup(id)).toBe(true);
      expect(m.regions.length).toBeGreaterThan(1);
      for (const c of m.cities) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x).toBeLessThanOrEqual(m.width);
      }
    }
    const names = splitMap('europe')!.cities.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['Paris', 'London', 'Moscow']));
    expect(splitMapName('benelux', 'fr')).toBe('Benelux');
    expect(splitMapName('africa', 'fr')).toBe('Afrique');
    expect(splitMapName('FRA', 'fr')).toBe('France');
  });

  it('keeps Russia whole across the antimeridian on the map of Europe', () => {
    const m = splitMap('europe')!;
    // A ring split at ±180° would jump across the whole board in one step.
    for (const ring of m.regions.join('').split('M').filter(Boolean)) {
      const xs = [...('M' + ring).matchAll(/[ML](-?[\d.]+) /g)].map((x) => Number(x[1]));
      for (let i = 1; i < xs.length; i++) expect(Math.abs(xs[i] - xs[i - 1])).toBeLessThan(m.width / 2);
    }
  });
});

describe('splitError', () => {
  it('is 0 for equal parts and grows with the imbalance', () => {
    expect(splitError([0.5, 0.5], 2)).toBeCloseTo(0);
    expect(splitError([0.6, 0.4], 2)).toBeCloseTo(0.1);
    expect(splitError([1], 2)).toBeCloseTo(0.5);
    expect(splitError([0.25, 0.25, 0.25, 0.25], 4)).toBeCloseTo(0);
  });

  it('counts a missing part as empty and an extra part as misplaced', () => {
    // Thirds asked, only two parts drawn.
    expect(splitError([0.5, 0.5], 3)).toBeCloseTo(1 / 3);
    // Thirds asked, two crossing lines leave a fourth part.
    expect(splitError([0.3, 0.3, 0.3, 0.1], 3)).toBeCloseTo(0.1);
  });
});

describe('splitPoints', () => {
  it('gives full marks at the best reachable split, 0 at 60 % of the worst', () => {
    expect(splitPoints(0.02, { parts: 2, best: 0.02 })).toBe(SPLIT_MAX_POINTS);
    expect(splitPoints(0, { parts: 2, best: 0.02 })).toBe(SPLIT_MAX_POINTS);
    expect(splitPoints(0.3, { parts: 2, best: 0 })).toBe(0);
    expect(splitPoints(0.15, { parts: 2, best: 0 })).toBe(100);
    expect(splitPoints(0.45, { parts: 4, best: 0 })).toBe(0);
  });
});

describe('lines and parts', () => {
  const m = splitMap('USA')!;

  it('splits the cities by side, one bit per line', () => {
    const x = m.width / 2;
    const parts = cityParts(m, [vertical(x)]);
    m.cities.forEach((c, i) => expect(parts[i] === 1).toBe(c.x < x));
    const shares = partShares(m, [vertical(x), horizontal(m.height / 2)]);
    expect(shares.reduce((s, p) => s + p.share, 0)).toBeCloseTo(1);
    expect(shares.length).toBeLessThanOrEqual(4);
  });

  it('a line off the map leaves everything in one part', () => {
    expect(partShares(m, [vertical(-5)])).toHaveLength(1);
  });

  it('cuts the board into one cell per side, extended across it', () => {
    expect(partCells([vertical(50)], 100, 80)).toHaveLength(2);
    expect(partCells([vertical(50), horizontal(40)], 100, 80)).toHaveLength(4);
    expect(clipToBoard({ a: { x: 40, y: 40 }, b: { x: 60, y: 40 } }, 100, 80)).toEqual([
      { x: 0, y: 40 },
      { x: 100, y: 40 },
    ]);
    expect(clipToBoard(vertical(120), 100, 80)).toBeNull();
  });

  it('no drawn line beats the computed best split', () => {
    const q = { id: 'USA', parts: 2 as const, lines: 1 as const, best: bestSplitError(m, 2, 1) };
    for (let x = 0; x <= m.width; x += 2) {
      const { error, points } = scoreLines(q, [vertical(x)]);
      expect(error).toBeGreaterThanOrEqual(q.best - 1e-9);
      expect(points).toBeLessThanOrEqual(SPLIT_MAX_POINTS);
    }
  });
});

describe('buildSplitRun', () => {
  it('is deterministic for a given seed and varies across seeds', () => {
    expect(buildSplitRun(42)).toEqual(buildSplitRun(42));
    expect(JSON.stringify(buildSplitRun(1))).not.toBe(JSON.stringify(buildSplitRun(2)));
  });

  it('puts a group of countries on maps 2 and 4', () => {
    for (const seed of [1, 7, 99, 12345]) {
      const run = buildSplitRun(seed, 5);
      expect(run.map((q) => isSplitGroup(q.id))).toEqual([false, true, false, true, false]);
    }
  });

  it('asks halves, then thirds, then quarters, on distinct splittable maps', () => {
    for (const seed of [1, 7, 99, 12345]) {
      const run = buildSplitRun(seed, 5);
      expect(run.map((q) => q.parts)).toEqual([2, 2, 3, 3, 4]);
      expect(run.map((q) => q.lines)).toEqual([1, 1, 2, 2, 2]);
      expect(new Set(run.map((q) => q.id)).size).toBe(5);
      for (const q of run) expect(q.best).toBeLessThanOrEqual(q.parts === 2 ? 0.12 : 0.06);
    }
  });
});

describe('placeLabels', () => {
  it('keeps labels on the board', () => {
    for (const cca3 of splitCountries()) {
      const m = splitMap(cca3)!;
      const texts = m.cities.map((c) => `${c.name} 1.2 M`);
      const spots = placeLabels(m, texts);
      expect(spots).toHaveLength(m.cities.length);
      for (const s of spots) {
        expect(s.y).toBeGreaterThan(0);
        expect(s.y).toBeLessThanOrEqual(m.height + 1);
      }
    }
  });
});
