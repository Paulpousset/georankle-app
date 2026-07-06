import {
  CHALLENGES, getChallenge, challengesByCountry, countryLabel,
  entityAnswer, entityPrompt, entityFlagUrl, entityAcceptedAnswers, pickDistractors,
} from '../../data/challenges';
import { createSeededRng } from '../rng';

describe('challenges data', () => {
  it('ships the France département and US state-flag challenges', () => {
    expect(getChallenge('fr-dept-number')).toBeDefined();
    expect(getChallenge('us-state-flag')).toBeDefined();
  });

  it('France has 101 départements with unique numbers and text prompts', () => {
    const fr = getChallenge('fr-dept-number')!;
    expect(fr.promptKind).toBe('text');
    expect(fr.answerKind).toBe('number');
    expect(fr.entities).toHaveLength(101);
    const codes = fr.entities.map((e) => e.answerFr);
    expect(new Set(codes).size).toBe(101);
    // Spot-checks of well-known départements.
    const byPrompt = (name: string) => fr.entities.find((e) => e.promptFr === name)?.answerFr;
    expect(byPrompt('Gironde')).toBe('33');
    expect(byPrompt('Paris')).toBe('75');
    expect(byPrompt('Corse-du-Sud')).toBe('2A');
  });

  it('USA has 50 states, each with a flagcdn subdivision slug', () => {
    const us = getChallenge('us-state-flag')!;
    expect(us.promptKind).toBe('flag');
    expect(us.answerKind).toBe('name');
    expect(us.entities).toHaveLength(50);
    for (const e of us.entities) {
      expect(e.flagSlug).toMatch(/^us-[a-z]{2}$/);
      expect(entityFlagUrl(e)).toContain(`/${e.flagSlug}.png`);
    }
    const ca = us.entities.find((e) => e.flagSlug === 'us-ca')!;
    expect(entityAnswer(ca, 'fr')).toBe('Californie');
    expect(entityAnswer(ca, 'en')).toBe('California');
    // Either spelling is accepted when typed.
    expect(entityAcceptedAnswers(ca)).toEqual(expect.arrayContaining(['California', 'Californie']));
  });

  it('text challenges expose a prompt, flag challenges expose a flag url', () => {
    const fr = getChallenge('fr-dept-number')!;
    expect(entityPrompt(fr.entities[0], 'fr').length).toBeGreaterThan(0);
    expect(entityFlagUrl(fr.entities[0])).toBeNull();
  });

  it('groups challenges by country and labels them', () => {
    const groups = challengesByCountry();
    expect(groups.map((g) => g.country)).toEqual(['FRA', 'USA', 'DEU', 'ESP', 'ITA', 'CAN']);
    expect(countryLabel('FRA', 'fr')).toBe('France');
    expect(countryLabel('USA', 'en')).toBe('United States');
    expect(countryLabel('DEU', 'fr')).toBe('Allemagne');
    expect(countryLabel('CAN', 'en')).toBe('Canada');
  });

  it('ships the six capital challenges with the expected entity counts', () => {
    const expected: [string, number][] = [
      ['fr-region-capital', 13],
      ['us-state-capital', 50],
      ['de-land-capital', 13],
      ['es-comunidad-capital', 14],
      ['it-region-capital', 20],
      ['ca-province-capital', 13],
    ];
    for (const [id, count] of expected) {
      const ch = getChallenge(id)!;
      expect(ch).toBeDefined();
      expect(ch.promptKind).toBe('text');
      expect(ch.answerKind).toBe('name');
      expect(ch.entities).toHaveLength(count);
    }
  });

  it('every challenge has globally unique entity ids and non-empty answers', () => {
    const ids = CHALLENGES.flatMap((c) => c.entities.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CHALLENGES) {
      for (const e of c.entities) {
        expect(e.answerFr.length).toBeGreaterThan(0);
        expect(e.answerEn.length).toBeGreaterThan(0);
        if (c.promptKind === 'text') expect(entityPrompt(e, 'fr').length).toBeGreaterThan(0);
        else expect(e.flagSlug).toBeTruthy();
      }
    }
  });

  it('capital spot-checks (both languages accepted when typed)', () => {
    const de = getChallenge('de-land-capital')!;
    const bavaria = de.entities.find((e) => e.promptEn === 'Bavaria')!;
    expect(entityAnswer(bavaria, 'fr')).toBe('Munich');
    expect(entityAcceptedAnswers(bavaria)).toEqual(expect.arrayContaining(['München']));

    const it = getChallenge('it-region-capital')!;
    const tuscany = it.entities.find((e) => e.promptFr === 'Toscane')!;
    expect(entityAcceptedAnswers(tuscany)).toEqual(expect.arrayContaining(['Florence', 'Firenze']));

    const ca = getChallenge('ca-province-capital')!;
    const nl = ca.entities.find((e) => e.promptEn === 'Newfoundland and Labrador')!;
    expect(entityAnswer(nl, 'en')).toBe("St. John's");
    expect(entityAcceptedAnswers(nl)).toEqual(expect.arrayContaining(['Saint-Jean']));

    const fr = getChallenge('fr-region-capital')!;
    expect(entityAnswer(fr.entities.find((e) => e.promptFr === 'Normandie')!, 'fr')).toBe('Rouen');
  });
});

describe('pickDistractors', () => {
  const fr = getChallenge('fr-dept-number')!;

  it('returns the requested count of distinct wrong answers', () => {
    const correct = fr.entities[0];
    const ds = pickDistractors(fr.entities, correct, 3, 'fr', createSeededRng(7));
    expect(ds).toHaveLength(3);
    expect(new Set(ds).size).toBe(3);
    expect(ds).not.toContain(entityAnswer(correct, 'fr'));
  });

  it('is deterministic for a fixed seed', () => {
    const correct = fr.entities[5];
    const a = pickDistractors(fr.entities, correct, 3, 'fr', createSeededRng(42));
    const b = pickDistractors(fr.entities, correct, 3, 'fr', createSeededRng(42));
    expect(a).toEqual(b);
  });
});
