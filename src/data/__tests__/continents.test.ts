import rawCountriesStats from '../../../assets/countries_stats.json';
import {
  CONTINENTS,
  continentCca3s,
  continentCount,
  continentLabel,
  continentOf,
  filterByContinent,
  filterCca3sByContinent,
  inContinent,
} from '../continents';
import { CONTINENT_SHAPES } from '../continentShapes.gen';
import type { CountryStat } from '../../types';

const STATS = rawCountriesStats as unknown as CountryStat[];

describe('continents', () => {
  it('covers every country in the pool', () => {
    expect(STATS).toHaveLength(195);
    for (const s of STATS) {
      expect(continentOf(s.cca3)).not.toBeNull();
    }
  });

  it('matches the measured per-continent counts the pool guards rely on', () => {
    // These numbers are what src/lib/soloScope.ts sizes MIN_POOL against — if
    // the dataset shifts, the scope guards must be re-checked.
    expect(continentCount('Africa')).toBe(54);
    expect(continentCount('Asia')).toBe(47);
    expect(continentCount('Europe')).toBe(45);
    expect(continentCount('Americas')).toBe(35);
    expect(continentCount('Oceania')).toBe(14);
    const total = CONTINENTS.reduce((sum, c) => sum + continentCount(c.id), 0);
    expect(total).toBe(STATS.length);
  });

  it('places well-known countries on the right continent', () => {
    expect(continentOf('FRA')).toBe('Europe');
    expect(continentOf('NGA')).toBe('Africa');
    expect(continentOf('JPN')).toBe('Asia');
    expect(continentOf('BRA')).toBe('Americas');
    expect(continentOf('AUS')).toBe('Oceania');
    // Transcontinental / commonly-misfiled cases, pinned to the dataset.
    expect(continentOf('TUR')).toBe('Asia');
    expect(continentOf('RUS')).toBe('Europe');
    expect(continentOf('MEX')).toBe('Americas');
  });

  it('returns null for an unknown code instead of throwing', () => {
    expect(continentOf('ZZZ')).toBeNull();
    expect(inContinent('ZZZ', 'Europe')).toBe(false);
  });

  it('treats a null scope as the whole world', () => {
    expect(inContinent('FRA', null)).toBe(true);
    expect(inContinent('ZZZ', null)).toBe(true);
    expect(filterByContinent(STATS, null)).toBe(STATS);
    const ids = STATS.map((s) => s.cca3);
    expect(filterCca3sByContinent(ids, null)).toBe(ids);
  });

  it('filters lists down to one continent', () => {
    const african = filterByContinent(STATS, 'Africa');
    expect(african).toHaveLength(54);
    expect(african.every((c) => c.region === 'Africa')).toBe(true);

    const ids = filterCca3sByContinent(STATS.map((s) => s.cca3), 'Oceania');
    expect(ids).toHaveLength(14);
    expect(ids).toContain('FJI');
    expect(ids).not.toContain('FRA');
  });

  it('lists the same members through both accessors', () => {
    for (const c of CONTINENTS) {
      expect(continentCca3s(c.id)).toHaveLength(continentCount(c.id));
      expect(continentCca3s(c.id).every((id) => continentOf(id) === c.id)).toBe(true);
    }
  });

  it('localizes continent names and falls back gracefully', () => {
    expect(continentLabel('Americas', 'fr')).toBe('Amériques');
    expect(continentLabel('Americas', 'en')).toBe('Americas');
    // Kept for the Guess clue tile even though no playable country uses it.
    expect(continentLabel('Antarctic', 'fr')).toBe('Antarct.');
    expect(continentLabel('Atlantis', 'fr')).toBe('Atlantis');
    expect(continentLabel(undefined, 'fr')).toBe('?');
  });
});

describe('continent shapes', () => {
  it('ships a silhouette for every continent', () => {
    for (const c of CONTINENTS) {
      const d = CONTINENT_SHAPES[c.id];
      expect(typeof d).toBe('string');
      expect(d.length).toBeGreaterThan(100);
      // Closed sub-paths inside the 24×24 icon box.
      expect(d.startsWith('M')).toBe(true);
      expect(d.endsWith('Z')).toBe(true);
      const nums = d.match(/-?\d+\.\d+/g)!.map(Number);
      expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...nums)).toBeLessThanOrEqual(24);
    }
  });
});
