import { getRankColor, getEfficiencyColor } from '../ranks';
import { RANK_COLORS } from '../../theme/colors';

describe('getRankColor', () => {
  it('greens the best ranks and reddens the worst', () => {
    expect(getRankColor(1)).toBe(RANK_COLORS.excellent);
    expect(getRankColor(5)).toBe(RANK_COLORS.excellent);
    expect(getRankColor(6)).toBe(RANK_COLORS.good);
    expect(getRankColor(20)).toBe(RANK_COLORS.good);
    expect(getRankColor(21)).toBe(RANK_COLORS.average);
    expect(getRankColor(50)).toBe(RANK_COLORS.average);
    expect(getRankColor(51)).toBe(RANK_COLORS.poor);
    expect(getRankColor(200)).toBe(RANK_COLORS.poor);
  });
});

describe('getEfficiencyColor', () => {
  it('uses thresholds 80 and 50', () => {
    expect(getEfficiencyColor(100)).toBe(RANK_COLORS.excellent);
    expect(getEfficiencyColor(80)).toBe(RANK_COLORS.excellent);
    expect(getEfficiencyColor(79)).toBe(RANK_COLORS.good);
    expect(getEfficiencyColor(50)).toBe(RANK_COLORS.good);
    expect(getEfficiencyColor(49)).toBe(RANK_COLORS.poor);
    expect(getEfficiencyColor(0)).toBe(RANK_COLORS.poor);
  });
});
