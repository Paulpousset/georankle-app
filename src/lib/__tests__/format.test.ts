import { fmtCount, fmtArea, fmtMoney, fmtDist } from '../format';

describe('fmtCount', () => {
  it('formats billions with locale-specific suffix', () => {
    expect(fmtCount(1.4e9, 'fr')).toBe('1.4 Md');
    expect(fmtCount(1.4e9, 'en')).toBe('1.4B');
  });

  it('formats millions (no decimal at/above 10M)', () => {
    expect(fmtCount(2.5e6, 'en')).toBe('2.5 M');
    expect(fmtCount(5e7, 'en')).toBe('50 M');
  });

  it('formats thousands and small numbers', () => {
    expect(fmtCount(12_000, 'en')).toBe('12k');
    expect(fmtCount(800, 'en')).toBe('800');
    expect(fmtCount(0, 'en')).toBe('0');
  });
});

describe('fmtArea', () => {
  it('handles the km² magnitude bands', () => {
    expect(fmtArea(9.8e6, 'fr')).toBe('9.8 M km²');
    expect(fmtArea(9.8e6, 'en')).toBe('9.8M km²');
    expect(fmtArea(500_000, 'en')).toBe('500k km²');
    expect(fmtArea(240, 'en')).toBe('240 km²');
  });
});

describe('fmtMoney', () => {
  it('formats thousands with $ and k', () => {
    expect(fmtMoney(1500)).toBe('$1.5k');
    expect(fmtMoney(50_000)).toBe('$50k'); // ≥10k → no decimal
    expect(fmtMoney(50)).toBe('$50');
  });
});

describe('fmtDist', () => {
  it('switches to "k km" beyond 1000', () => {
    expect(fmtDist(240)).toBe('240 km');
    expect(fmtDist(999)).toBe('999 km');
    expect(fmtDist(5000)).toBe('5.0k km');
    expect(fmtDist(12_500)).toBe('12.5k km');
  });
});
