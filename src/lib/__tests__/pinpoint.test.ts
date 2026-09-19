import {
  buildPinpointRun,
  nearestCountries,
  pinpointAcceptedAnswers,
  pinpointCountries,
  pinpointCountryName,
  samplePinpoint,
} from '../pinpoint';
import { createSeededRng } from '../rng';
import { continentOf } from '../../data/continents';
import rawWorldPolygons from '../../../assets/world_polygons.json';

const POLY_BY_ID = new Map(
  (rawWorldPolygons as { id: string; r: number[][][] }[]).map((p) => [p.id, p]),
);

/** Ray-casting point-in-polygon on the raw (seam-unaware) rings. */
function insideCountry(cca3: string, lat: number, lng: number): boolean {
  const entry = POLY_BY_ID.get(cca3)!;
  for (const ring of entry.r) {
    for (const shift of [-360, 0, 360]) {
      let inside = false;
      const x = lng + shift;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > lat !== yj > lat && x < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return true;
    }
  }
  return false;
}

describe('pinpointCountries', () => {
  it('offers a rich pool that includes the obvious landmasses', () => {
    const pool = pinpointCountries();
    expect(pool.length).toBeGreaterThan(140);
    for (const id of ['FRA', 'RUS', 'USA', 'BRA', 'AUS', 'JPN', 'FJI', 'CHL']) {
      expect(pool).toContain(id);
    }
  });
});

describe('samplePinpoint', () => {
  it('drops the point inside the country, for every eligible country', () => {
    for (const id of pinpointCountries()) {
      const p = samplePinpoint(id, createSeededRng(7))!;
      expect(p).toBeTruthy();
      expect({ id, inside: insideCountry(id, p.lat, p.lng) }).toEqual({ id, inside: true });
      expect(p.lng).toBeGreaterThanOrEqual(-180);
      expect(p.lng).toBeLessThanOrEqual(180);
    }
  });

  it('handles the antimeridian countries (Russia, Fiji) without smearing', () => {
    for (const id of ['RUS', 'FJI', 'NZL']) {
      const p = samplePinpoint(id, createSeededRng(3))!;
      expect(insideCountry(id, p.lat, p.lng)).toBe(true);
    }
  });

  it('is seeded — same rng state, same point', () => {
    expect(samplePinpoint('FRA', createSeededRng(11))).toEqual(samplePinpoint('FRA', createSeededRng(11)));
    expect(samplePinpoint('FRA', createSeededRng(11))).not.toEqual(samplePinpoint('FRA', createSeededRng(12)));
  });

  it('is null for a country with no polygon', () => {
    expect(samplePinpoint('VAT', createSeededRng(1))).toBeNull();
  });
});

describe('nearestCountries', () => {
  const pool = pinpointCountries();

  it('returns the real neighbours of a point, nearest first', () => {
    // Luxembourg City: Belgium / Germany / France are the only sensible options.
    const near = nearestCountries({ lat: 49.61, lng: 6.13 }, 'LUX', pool, 3);
    expect(near.sort()).toEqual(['BEL', 'DEU', 'FRA']);
    // Deep in Brazil (Manaus): Amazonian neighbours, never Europe.
    const bra = nearestCountries({ lat: -3.1, lng: -60.0 }, 'BRA', pool, 3);
    for (const id of bra) expect(continentOf(id)).toBe('Americas');
  });

  it('never includes the excluded answer and never repeats', () => {
    const near = nearestCountries({ lat: 48.8, lng: 2.3 }, 'FRA', pool, 3);
    expect(near).not.toContain('FRA');
    expect(new Set(near).size).toBe(3);
  });
});

describe('buildPinpointRun', () => {
  it('is deterministic for a given seed and varies across seeds', () => {
    expect(buildPinpointRun(42)).toEqual(buildPinpointRun(42));
    expect(JSON.stringify(buildPinpointRun(1))).not.toBe(JSON.stringify(buildPinpointRun(2)));
  });

  it('builds the requested number of questions with 4 distinct nearby options containing the answer', () => {
    const run = buildPinpointRun(7, 5);
    expect(run).toHaveLength(5);
    for (const q of run) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options).toContain(q.answer);
      expect(q.distractors).toHaveLength(3);
      expect(q.options.sort()).toEqual([q.answer, ...q.distractors].sort());
      // The point really is in the answer country.
      expect(insideCountry(q.answer, q.lat, q.lng)).toBe(true);
    }
  });

  it('never repeats an answer within a run', () => {
    const answers = buildPinpointRun(99, 10).map((q) => q.answer);
    expect(new Set(answers).size).toBe(answers.length);
  });

  it('narrows the answers to a continent but keeps worldwide neighbours as options', () => {
    const run = buildPinpointRun(5, 8, { continent: 'Europe' });
    expect(run).toHaveLength(8);
    for (const q of run) expect(continentOf(q.answer)).toBe('Europe');
  });

  it('asks the review countries first, in the due order', () => {
    const run = buildPinpointRun(5, 3, { reviewIds: ['PER', 'KEN'] });
    expect(run.slice(0, 2).map((q) => q.answer)).toEqual(['PER', 'KEN']);
  });
});

describe('names', () => {
  it('localizes names and falls back to the code', () => {
    expect(pinpointCountryName('FRA', 'fr')).toBe('France');
    expect(pinpointCountryName('DEU', 'en')).toBe('Germany');
    expect(pinpointCountryName('ZZZ', 'fr')).toBe('ZZZ');
  });

  it('accepts every spelling of the answer for CASH', () => {
    const accepted = pinpointAcceptedAnswers('DEU');
    expect(accepted).toContain('Allemagne');
    expect(accepted).toContain('Germany');
  });
});
