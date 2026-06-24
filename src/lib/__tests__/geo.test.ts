import { haversine, calcBearing, bearingToArrow } from '../geo';

describe('haversine', () => {
  it('is 0 for identical points', () => {
    expect(haversine(48.85, 2.35, 48.85, 2.35)).toBe(0);
  });

  it('matches a known great-circle distance (Paris → New York ≈ 5837 km)', () => {
    const d = haversine(48.8566, 2.3522, 40.7128, -74.006);
    expect(d).toBe(5837);
  });

  it('is symmetric', () => {
    const a = haversine(35, 139, -33, 151); // Tokyo ↔ Sydney
    const b = haversine(-33, 151, 35, 139);
    expect(a).toBe(b);
  });

  it('approaches half the Earth circumference for antipodes (~20015 km)', () => {
    const d = haversine(0, 0, 0, 180);
    expect(d).toBeGreaterThan(20000);
    expect(d).toBeLessThan(20040);
  });
});

describe('calcBearing', () => {
  it('returns the four cardinal directions', () => {
    expect(calcBearing(0, 0, 10, 0)).toBeCloseTo(0, 5); // due north
    expect(calcBearing(0, 0, 0, 10)).toBeCloseTo(90, 5); // due east
    expect(calcBearing(10, 0, 0, 0)).toBeCloseTo(180, 5); // due south
    expect(calcBearing(0, 10, 0, 0)).toBeCloseTo(270, 5); // due west
  });

  it('always returns a value in [0, 360)', () => {
    const b = calcBearing(0, 10, 0, 0);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});

describe('bearingToArrow', () => {
  it('maps each 45° sector to the matching arrow', () => {
    expect(bearingToArrow(0)).toBe('↑');
    expect(bearingToArrow(45)).toBe('↗');
    expect(bearingToArrow(90)).toBe('→');
    expect(bearingToArrow(135)).toBe('↘');
    expect(bearingToArrow(180)).toBe('↓');
    expect(bearingToArrow(225)).toBe('↙');
    expect(bearingToArrow(270)).toBe('←');
    expect(bearingToArrow(315)).toBe('↖');
  });

  it('wraps 360° back to north', () => {
    expect(bearingToArrow(360)).toBe('↑');
  });

  it('rounds to the nearest sector', () => {
    expect(bearingToArrow(22)).toBe('↑'); // < 22.5 → north
    expect(bearingToArrow(23)).toBe('↗'); // ≥ 22.5 → north-east
  });
});
