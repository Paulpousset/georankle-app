import { tr, pickLabel } from '../index';

describe('tr', () => {
  it('selects the string for the active language', () => {
    expect(tr('fr', 'Bonjour', 'Hello')).toBe('Bonjour');
    expect(tr('en', 'Bonjour', 'Hello')).toBe('Hello');
  });
});

describe('pickLabel', () => {
  it('returns the matching localized value', () => {
    const label = { fr: 'Population', en: 'Population' };
    expect(pickLabel(label, 'fr')).toBe('Population');
    expect(pickLabel(label, 'en')).toBe('Population');
  });

  it('falls back to French when the English variant is missing', () => {
    const label = { fr: 'Côtes', en: '' };
    expect(pickLabel(label, 'en')).toBe('Côtes');
  });
});
