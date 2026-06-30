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
    expect(groups.map((g) => g.country)).toEqual(['FRA', 'USA']);
    expect(countryLabel('FRA', 'fr')).toBe('France');
    expect(countryLabel('USA', 'en')).toBe('United States');
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
