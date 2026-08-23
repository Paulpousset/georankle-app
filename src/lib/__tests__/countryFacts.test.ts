import { countryFactName, countryFacts, notableRanks, pickNotableRank } from '../countryFacts';

describe('countryFacts', () => {
  it('assembles a full sheet for a well-documented country', () => {
    const f = countryFacts('FRA', 'fr');
    expect(f).not.toBeNull();
    expect(f!.name).toBe('France');
    expect(f!.capital).toBe('Paris');
    expect(f!.continent).toBe('Europe');
    const labels = f!.rows.map((r) => r.label);
    expect(labels).toEqual(
      expect.arrayContaining(['Capitale', 'Continent', 'Population', 'Superficie']),
    );
  });

  it('localizes names and labels', () => {
    expect(countryFactName('DEU', 'fr')).toBe('Allemagne');
    expect(countryFactName('DEU', 'en')).toBe('Germany');
    expect(countryFacts('DEU', 'en')!.rows.map((r) => r.label)).toContain('Capital');
  });

  it('says "island" rather than 0 when a country has no land neighbour', () => {
    const row = countryFacts('JPN', 'fr')!.rows.find((r) => r.label === 'Pays frontaliers');
    expect(row!.value).toBe('aucun (île)');
  });

  it('returns null for an unknown code instead of throwing', () => {
    expect(countryFacts('ZZZ', 'fr')).toBeNull();
    expect(countryFactName('ZZZ', 'fr')).toBe('ZZZ');
  });
});

describe('notableRanks', () => {
  it('surfaces striking placements, best first, capped', () => {
    const ranks = notableRanks('RUS', 'fr', 3);
    expect(ranks.length).toBeGreaterThan(0);
    expect(ranks.length).toBeLessThanOrEqual(3);
    // Russia is #1 by area — that must be the headline fact.
    expect(ranks[0].rank).toBe(1);
    expect(ranks[0].themeId).toBe('area');
    for (const r of ranks) {
      expect(r.total).toBeGreaterThan(0);
      expect(r.rank).toBeLessThanOrEqual(r.total);
      expect(r.label).toBeTruthy();
      expect(r.hint).toBeTruthy();
    }
  });

  it('counts a bottom placement as remarkable too', () => {
    // Every returned rank sits within 15 of one end of its table.
    for (const r of notableRanks('TUV', 'fr', 5)) {
      expect(Math.min(r.rank, r.total - r.rank + 1)).toBeLessThanOrEqual(15);
    }
  });

  it('never shows the morbid themes', () => {
    for (const cca3 of ['FRA', 'USA', 'BRA', 'ZAF', 'LTU']) {
      const ids = notableRanks(cca3, 'fr', 10).map((r) => r.themeId);
      expect(ids).not.toContain('suicide_rate');
      expect(ids).not.toContain('homicide_rate');
    }
  });
});

describe('notableRanks framing', () => {
  it('labels which end of the table a rank sits at', () => {
    for (const r of notableRanks('MDA', 'fr', 5)) {
      expect(r.position).toBe(r.rank === r.fromEnd ? 'top' : 'bottom');
      expect(r.fromEnd).toBe(Math.min(r.rank, r.total - r.rank + 1));
    }
  });

  it('leads with a top placement when the country has one', () => {
    // Russia is #1 by area; a bottom rank must never outrank that.
    expect(notableRanks('RUS', 'fr', 3)[0].position).toBe('top');
    // Same for China (#1 population) and Brazil (top-5 area).
    expect(notableRanks('CHN', 'fr', 3)[0].position).toBe('top');
  });
});

describe('pickNotableRank', () => {
  const ranks = notableRanks('FRA', 'fr', 8);

  it('offers several candidates so the card can vary', () => {
    expect(ranks.length).toBeGreaterThan(1);
  });

  it('returns exactly one of the candidates', () => {
    const picked = pickNotableRank(ranks, () => 0.5);
    expect(picked).not.toBeNull();
    expect(ranks).toContain(picked);
  });

  it('can reach every candidate, first and last included', () => {
    expect(pickNotableRank(ranks, () => 0)).toBe(ranks[0]);
    // A degenerate rng returning 1 must not walk off the end.
    expect(pickNotableRank(ranks, () => 1)).toBe(ranks[ranks.length - 1]);
    expect(pickNotableRank(ranks, () => 0.999999)).toBe(ranks[ranks.length - 1]);
  });

  it('returns null when a country has nothing remarkable', () => {
    expect(pickNotableRank([], () => 0.5)).toBeNull();
  });
});
