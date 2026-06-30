import {
  normalizeAnswer,
  levenshtein,
  isAnswerClose,
  matchesCountry,
  COUNTRY_ALIASES,
} from '../answerMatch';

describe('normalizeAnswer', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(normalizeAnswer('Congo (Rép. dém.)')).toBe('congorepdem');
    expect(normalizeAnswer('Côte d’Ivoire')).toBe('cotedivoire');
    expect(normalizeAnswer('  ESPAÑA ')).toBe('espana');
  });
});

describe('levenshtein', () => {
  it('computes edit distance', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
});

describe('isAnswerClose', () => {
  it('accepts exact and accent-insensitive matches', () => {
    expect(isAnswerClose('france', 'France')).toBe(true);
    expect(isAnswerClose('bresil', 'Brésil')).toBe(true);
  });

  it('tolerates a small typo proportional to length', () => {
    expect(isAnswerClose('allemagn', 'Allemagne')).toBe(true); // 1 edit, len > 8 → ok
    expect(isAnswerClose('togi', 'Togo')).toBe(true); // 1 edit, short
  });

  it('rejects answers with a very different length', () => {
    expect(isAnswerClose('a', 'Allemagne')).toBe(false);
  });

  it('matches an alias when the main answer does not', () => {
    expect(isAnswerClose('republique democratique du congo', 'Congo (Rép. dém.)')).toBe(false);
    expect(
      isAnswerClose('republique democratique du congo', 'Congo (Rép. dém.)', COUNTRY_ALIASES.COD),
    ).toBe(true);
    expect(isAnswerClose('rdc', 'Congo (Rép. dém.)', COUNTRY_ALIASES.COD)).toBe(true);
  });
});

describe('matchesCountry', () => {
  const drCongo = { cca3: 'COD', name: 'Congo (Rép. dém.)', name_en: 'DR Congo' };
  const congo = { cca3: 'COG', name: 'Congo', name_en: 'Republic of the Congo' };

  it('matches the stored display name and english name', () => {
    expect(matchesCountry('Congo (Rép. dém.)', drCongo)).toBe(true);
    expect(matchesCountry('DR Congo', drCongo)).toBe(true);
  });

  it('matches official long forms via aliases', () => {
    expect(matchesCountry('république démocratique du congo', drCongo)).toBe(true);
    expect(matchesCountry('congo kinshasa', drCongo)).toBe(true);
    expect(matchesCountry('republique du congo', congo)).toBe(true);
    expect(matchesCountry('congo brazzaville', congo)).toBe(true);
  });

  it('does not confuse the two Congos', () => {
    expect(matchesCountry('republique democratique du congo', congo)).toBe(false);
    expect(matchesCountry('congo brazzaville', drCongo)).toBe(false);
  });
});
