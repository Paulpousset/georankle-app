import { fetchCurrentSeason, seasonDaysLeft } from '../seasons';
import { supabase } from '../supabase';
import type { SupabaseMock } from '../../../test-utils/supabaseMock';

jest.mock('../supabase', () => {
  const { makeSupabaseMock } = require('../../../test-utils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

const sb = supabase as unknown as SupabaseMock;

beforeEach(() => sb.__reset());

describe('fetchCurrentSeason', () => {
  it('maps the open season row', async () => {
    sb.__setResult('seasons', {
      data: [{ id: 1, name: 'Saison 1', starts_at: '2026-07-01T00:00:00Z', ends_at: '2026-09-30T23:59:59Z' }],
      error: null,
    });
    expect(await fetchCurrentSeason()).toEqual({
      id: 1,
      name: 'Saison 1',
      startsAt: '2026-07-01T00:00:00Z',
      endsAt: '2026-09-30T23:59:59Z',
    });
  });

  it('is null when no season is open or on error', async () => {
    sb.__setResult('seasons', { data: [], error: null });
    expect(await fetchCurrentSeason()).toBeNull();
    sb.__setResult('seasons', { data: null, error: { message: 'boom' } });
    expect(await fetchCurrentSeason()).toBeNull();
  });
});

describe('seasonDaysLeft', () => {
  const END = '2026-09-30T23:59:59Z';

  it('counts whole days remaining', () => {
    expect(seasonDaysLeft({ endsAt: END }, Date.parse('2026-09-20T23:59:59Z'))).toBe(10);
    expect(seasonDaysLeft({ endsAt: END }, Date.parse('2026-07-05T12:00:00Z'))).toBe(87);
  });

  it('is 0 on the last day and never negative', () => {
    expect(seasonDaysLeft({ endsAt: END }, Date.parse('2026-09-30T10:00:00Z'))).toBe(0);
    expect(seasonDaysLeft({ endsAt: END }, Date.parse('2026-10-05T00:00:00Z'))).toBe(0);
  });
});
