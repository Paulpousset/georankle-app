import { pickRoundCountries } from '../matchCountries';
import type { MatchMode } from '../../types';

describe('pickRoundCountries', () => {
  const modes: MatchMode[] = ['guess', 'globe', 'versus', 'classic', 'streak', 'guess'];
  const perRoundCounts = { 1: 1, 2: 5, 3: 5, 6: 1 }; // classic/streak get no entry

  it('assigns only the single-answer / per-question modes', () => {
    const rc = pickRoundCountries(123456, modes, { perRoundCounts });
    expect(Object.keys(rc).sort()).toEqual(['1', '2', '3', '6']); // not classic(4)/streak(5)
    expect(rc[1]).toHaveLength(1);
    expect(rc[2]).toHaveLength(5);
    expect(rc[3]).toHaveLength(5);
    expect(rc[6]).toHaveLength(1);
  });

  it('never repeats a country across rounds', () => {
    const rc = pickRoundCountries(987654, modes, { perRoundCounts });
    const all = Object.values(rc).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('avoids countries reserved via preUsed', () => {
    const first = pickRoundCountries(42, modes, { perRoundCounts });
    const reserved = first[1]; // reserve round 1's pick
    const second = pickRoundCountries(42, modes, { perRoundCounts, preUsed: reserved });
    // The reserved cca3 must not reappear anywhere in the new assignment.
    expect(Object.values(second).flat()).not.toContain(reserved[0]);
  });

  it('is deterministic for the same seed (multiplayer sync)', () => {
    const a = pickRoundCountries(2024, modes, { perRoundCounts });
    const b = pickRoundCountries(2024, modes, { perRoundCounts });
    expect(a).toEqual(b);
  });

  it('degrades gracefully without per-round dupes when the pool is exhausted', () => {
    // Demand far more countries than any single round normally needs; the pool is
    // ~195, so a huge count forces the fallback. It must still avoid within-round
    // duplicates.
    const big: MatchMode[] = ['globe'];
    const rc = pickRoundCountries(7, big, { perRoundCounts: { 1: 500 } });
    const round = rc[1];
    expect(new Set(round).size).toBe(round.length); // no within-round dupes
    expect(round.length).toBeLessThanOrEqual(500);
  });
});
