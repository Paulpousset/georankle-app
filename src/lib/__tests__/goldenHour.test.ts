import {
  NO_GOLDEN_HOUR,
  fetchGoldenHour,
  formatClock,
  formatCountdown,
  __resetGoldenHourCache,
} from '../goldenHour';
import { supabase } from '../supabase';
import type { SupabaseMock } from '../../../test-utils/supabaseMock';

jest.mock('../supabase', () => {
  const { makeSupabaseMock } = require('../../../test-utils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

const sb = supabase as unknown as SupabaseMock;

beforeEach(() => {
  sb.__reset();
  __resetGoldenHourCache();
});

describe('fetchGoldenHour', () => {
  it('maps an active slot from golden_hour_status()', async () => {
    sb.rpc.mockResolvedValueOnce({
      data: {
        active: true,
        multiplier: 3,
        ad_cap: 10,
        ends_at: '2026-10-24T19:00:00+00:00',
        next_starts_at: '2026-10-31T17:00:00+00:00',
        next_multiplier: 3,
      },
      error: null,
    });
    const s = await fetchGoldenHour();
    expect(sb.rpc).toHaveBeenCalledWith('golden_hour_status');
    expect(s.active).toBe(true);
    expect(s.multiplier).toBe(3);
    expect(s.adCap).toBe(10);
    expect(s.endsAt?.toISOString()).toBe('2026-10-24T19:00:00.000Z');
    expect(s.nextStartsAt?.toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(s.nextMultiplier).toBe(3);
  });

  it('falls back to no golden hour on errors', async () => {
    sb.rpc.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
    expect(await fetchGoldenHour()).toEqual(NO_GOLDEN_HOUR);
  });

  it('caches the status for a minute', async () => {
    sb.rpc.mockResolvedValue({ data: { active: false, multiplier: 1, ad_cap: 5 }, error: null });
    await fetchGoldenHour();
    await fetchGoldenHour();
    expect(sb.rpc).toHaveBeenCalledTimes(1);
  });
});

describe('formatting', () => {
  it('formats a local clock time', () => {
    expect(formatClock(new Date(2026, 9, 24, 18, 5))).toBe('18:05');
  });

  it('formats the time left before a slot', () => {
    const now = Date.UTC(2026, 9, 24, 12, 0);
    expect(formatCountdown(new Date(now + 45 * 60000), now)).toBe('45 min');
    expect(formatCountdown(new Date(now + 3 * 3600000), now)).toBe('3 h');
    expect(formatCountdown(new Date(now + 135 * 60000), now)).toBe('2 h 15');
    expect(formatCountdown(new Date(now - 1000), now)).toBe('1 min');
  });
});
