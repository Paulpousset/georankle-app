import { getFlagUrl } from '../flags';

describe('getFlagUrl', () => {
  it('builds a lowercase cca2 URL for a known alpha-3 code', () => {
    expect(getFlagUrl('FRA')).toBe('https://flagcdn.com/w160/fr.png');
    expect(getFlagUrl('USA')).toBe('https://flagcdn.com/w160/us.png');
    expect(getFlagUrl('DEU')).toBe('https://flagcdn.com/w160/de.png');
  });

  it('falls back to the UN flag for an unknown code', () => {
    expect(getFlagUrl('ZZZ')).toBe('https://flagcdn.com/w160/un.png');
    expect(getFlagUrl('')).toBe('https://flagcdn.com/w160/un.png');
  });
});
