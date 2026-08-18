/**
 * Invariants on the generated region data (assets/regions, built by
 * scripts/build_region_data.mjs).
 *
 * The one that matters: no two regions of the same country may share a name.
 * "Trouve Washington" with both the state and D.C. on the map is unwinnable —
 * FindRegionGame prompts with the NAME and grades by ID, so half the taps are
 * wrong through no fault of the player. Natural Earth ships several of these
 * (US-WA/US-DC, AR-B/AR-C, RU-MOW/RU-MOS), fixed by NAME_OVERRIDES in the
 * generator. This test is the second lock: the generator throws at build time,
 * this fails if the committed JSON is ever edited by hand.
 */
import { BUNDLED_REGIONS } from '../../../assets/regions';

describe('region data', () => {
  const files = Object.entries(BUNDLED_REGIONS);

  it('bundles every country in the manifest', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it.each(files)('%s has no two regions sharing a name', (_key, file) => {
    for (const lang of ['name', 'name_en'] as const) {
      const byName = new Map<string, string[]>();
      for (const r of file.regions) byName.set(r[lang], [...(byName.get(r[lang]) ?? []), r.id]);
      const dupes = [...byName].filter(([, ids]) => ids.length > 1);
      expect({ lang, dupes }).toEqual({ lang, dupes: [] });
    }
  });

  it.each(files)('%s has unique region ids', (_key, file) => {
    const ids = file.regions.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('disambiguates Washington state from the federal district', () => {
    const usa = BUNDLED_REGIONS.USA.regions;
    const state = usa.find((r) => r.id === 'US-WA')!;
    const dc = usa.find((r) => r.id === 'US-DC')!;
    expect(state.name).toBe('État de Washington');
    expect(state.name_en).toBe('Washington (state)');
    expect(dc.name).toBe('Washington D.C.');
    expect(dc.name_en).toBe('Washington, D.C.');
  });
});
