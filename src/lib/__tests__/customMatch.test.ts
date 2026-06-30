import {
  ONLINE_MODES,
  buildCustomGameData,
  modeKeyLabel,
  newCustomRound,
  summariseCustomModes,
  winTarget,
  type CustomRound,
} from '../customMatch';

/** Build a deterministic round list bypassing the id counter. */
const mk = (rounds: { key: CustomRound['key']; count?: number }[]): CustomRound[] =>
  rounds.map((r, i) => ({ id: `t${i}`, key: r.key, count: r.count ?? ONLINE_MODES[r.key].defaultCount }));

describe('buildCustomGameData', () => {
  it('maps every round to a MatchMode and best_of = modes.length', () => {
    const gd = buildCustomGameData(mk([{ key: 'capital' }, { key: 'classic' }, { key: 'streak' }]), 42);
    expect(gd.modes).toEqual(['versus', 'classic', 'streak']);
    expect(gd.rounds).toHaveLength(3);
    expect(gd.is_custom).toBe(true);
    expect(gd.seed).toBe(42);
  });

  it('carries per-round versus question type and count', () => {
    const gd = buildCustomGameData(mk([{ key: 'capital', count: 7 }, { key: 'flag', count: 3 }]), 1);
    expect(gd.rounds[0]).toEqual({ mode: 'versus', questionType: 'CAPITAL', count: 7 });
    expect(gd.rounds[1]).toEqual({ mode: 'versus', questionType: 'FLAG', count: 3 });
  });

  it('omits count for non-configurable modes', () => {
    const gd = buildCustomGameData(mk([{ key: 'streak' }, { key: 'guess' }]), 1);
    expect(gd.rounds[0]).toEqual({ mode: 'streak' });
    expect(gd.rounds[1]).toEqual({ mode: 'guess' });
  });

  it('carries a regions round country/level and count', () => {
    const region = { cca3: 'FRA', name: 'France', name_en: 'France', unit: null, level: 'departments' as const };
    const gd = buildCustomGameData([{ id: 'r0', key: 'regions', count: 8, region }], 5);
    expect(gd.modes).toEqual(['regions']);
    expect(gd.rounds[0]).toEqual({ mode: 'regions', count: 8, region });
  });

  it('keys Rankle sessions by their 1-indexed round number (classic rounds only)', () => {
    // Rankle sits at round 2 (index 1) → sessions key must be 2.
    const gd = buildCustomGameData(mk([{ key: 'streak' }, { key: 'classic' }]), 99);
    expect(Object.keys(gd.sessions)).toEqual(['2']);
    expect(gd.sessions[2].themeIds).toHaveLength(8);
    expect(gd.sessions[2].countryCca3s).toHaveLength(8);
  });

  it('is deterministic for a given seed', () => {
    const rounds = mk([{ key: 'capital', count: 5 }, { key: 'classic' }]);
    expect(buildCustomGameData(rounds, 7)).toEqual(buildCustomGameData(rounds, 7));
  });

  it('exposes flat fallbacks for screens that read game_data.questionType / roundsPerSet', () => {
    const gd = buildCustomGameData(mk([{ key: 'flag', count: 4 }]), 1);
    expect(gd.questionType).toBe('FLAG');
    expect(gd.roundsPerSet).toBe(4);
  });
});

describe('winTarget', () => {
  it('is a majority of the series length', () => {
    expect(winTarget(1)).toBe(1);
    expect(winTarget(3)).toBe(2);
    expect(winTarget(4)).toBe(2);
    expect(winTarget(5)).toBe(3);
  });
});

describe('summariseCustomModes', () => {
  it('labels each round, distinguishing capitals from flags', () => {
    const gd = buildCustomGameData(mk([{ key: 'capital' }, { key: 'flag' }, { key: 'classic' }]), 1);
    expect(summariseCustomModes(gd, 'en')).toBe('Capitals · Flags · Rankle');
    expect(summariseCustomModes(gd, 'fr')).toBe('Capitales · Drapeaux · Rankle');
  });

  it('labels a regions round as Country Challenges', () => {
    const region = { cca3: 'USA', name: 'États-Unis', name_en: 'United States', unit: null, level: 'regions' as const };
    const gd = buildCustomGameData([{ id: 'r0', key: 'regions', count: 5, region }], 1);
    expect(summariseCustomModes(gd, 'en')).toBe('Country Challenges');
    expect(summariseCustomModes(gd, 'fr')).toBe('Défis Pays');
  });

  it('returns an empty string for non-custom game data', () => {
    expect(summariseCustomModes(null, 'en')).toBe('');
    expect(summariseCustomModes({ seed: 1 }, 'en')).toBe('');
  });
});

describe('newCustomRound', () => {
  it('seeds a round with the mode default count and a unique id', () => {
    const a = newCustomRound('globe');
    const b = newCustomRound('globe');
    expect(a.count).toBe(ONLINE_MODES.globe.defaultCount);
    expect(a.id).not.toBe(b.id);
    expect(modeKeyLabel('globe', 'en')).toBe('Geo Globe');
  });
});
