import { buildHigherLowerRun, higherSide, higherLowerThemeIds } from '../higherLower';
import { gameData } from '../../data/gameData';

describe('buildHigherLowerRun', () => {
  it('is deterministic for a given seed', () => {
    const a = buildHigherLowerRun(1234);
    const b = buildHigherLowerRun(1234);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(50);
  });

  it('produces different chains for different seeds', () => {
    const a = buildHigherLowerRun(1);
    const b = buildHigherLowerRun(2);
    expect(a.map((p) => p.b.cca3).join()).not.toBe(b.map((p) => p.b.cca3).join());
  });

  it('every pair has distinct numeric values on its theme', () => {
    for (const pair of buildHigherLowerRun(42)) {
      expect(Number.isFinite(pair.a.value)).toBe(true);
      expect(Number.isFinite(pair.b.value)).toBe(true);
      expect(pair.a.value).not.toBe(pair.b.value);
      expect(pair.a.cca3).not.toBe(pair.b.cca3);
    }
  });

  it('carries the challenger over as the next reference (higher/lower chain)', () => {
    const run = buildHigherLowerRun(7);
    for (let i = 1; i < run.length; i++) {
      expect(run[i].a.cca3).toBe(run[i - 1].b.cca3);
    }
  });

  it('never repeats a challenger within a run', () => {
    const run = buildHigherLowerRun(99);
    const challengers = run.map((p) => p.b.cca3);
    expect(new Set(challengers).size).toBe(challengers.length);
  });

  it('only asks eligible themes with localized reveal strings', () => {
    const eligible = new Set(higherLowerThemeIds());
    for (const pair of buildHigherLowerRun(2026)) {
      expect(eligible.has(pair.themeId)).toBe(true);
      expect(pair.a.display_fr).not.toBe('');
      expect(pair.b.display_en).not.toBe('');
    }
  });

  it('excludes the sensitive themes from the pool', () => {
    const ids = higherLowerThemeIds();
    expect(ids).not.toContain('suicide_rate');
    expect(ids).not.toContain('homicide_rate');
    // Sanity: the pool is still rich (game_data ships ~29 themes).
    expect(ids.length).toBeGreaterThanOrEqual(20);
    for (const id of ids) expect(gameData.themes[id as keyof typeof gameData.themes]).toBeDefined();
  });
});

describe('higherSide', () => {
  it('points at the larger value', () => {
    const pair = buildHigherLowerRun(5)[0];
    const side = higherSide(pair);
    const other = side === 'a' ? 'b' : 'a';
    expect(pair[side].value).toBeGreaterThan(pair[other].value);
  });
});
