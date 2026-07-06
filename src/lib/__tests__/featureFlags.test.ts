import { fetchFeatureFlags, isFeatureEnabled, __resetFeatureFlagCache } from '../featureFlags';
import { supabase } from '../supabase';
import type { SupabaseMock } from '../../../test-utils/supabaseMock';

jest.mock('../supabase', () => {
  const { makeSupabaseMock } = require('../../../test-utils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

const sb = supabase as unknown as SupabaseMock;

beforeEach(() => {
  sb.__reset();
  __resetFeatureFlagCache();
});

describe('feature flags', () => {
  it('reads flags and answers per key', async () => {
    sb.__setResult('feature_flags', {
      data: [
        { key: 'iap', enabled: false },
        { key: 'rewarded_ads', enabled: true },
      ],
      error: null,
    });
    expect(await isFeatureEnabled('rewarded_ads')).toBe(true);
    expect(await isFeatureEnabled('iap')).toBe(false);
  });

  it('fails closed on error and for unknown flags', async () => {
    sb.__setResult('feature_flags', { data: null, error: { message: 'down' } });
    expect(await isFeatureEnabled('iap')).toBe(false);

    __resetFeatureFlagCache();
    sb.__setResult('feature_flags', { data: [], error: null });
    expect(await isFeatureEnabled('rewarded_ads')).toBe(false);
  });

  it('caches results between calls', async () => {
    sb.__setResult('feature_flags', { data: [{ key: 'iap', enabled: true }], error: null });
    await fetchFeatureFlags();
    await fetchFeatureFlags();
    expect(sb.from).toHaveBeenCalledTimes(1);
  });
});
