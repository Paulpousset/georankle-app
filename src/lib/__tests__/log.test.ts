// log.ts pulls in @sentry/react-native (untranspiled ESM) — stub the wrapper.
jest.mock('../sentry', () => ({ Sentry: { captureException: jest.fn(), addBreadcrumb: jest.fn() } }));

import { isTransientNetworkError } from '../log';

describe('isTransientNetworkError', () => {
  it('flags Supabase network failures and gateway timeouts', () => {
    expect(isTransientNetworkError(['x', { code: '', message: 'TypeError: Network request failed' }])).toBe(true);
    expect(isTransientNetworkError(['x', { message: '', details: 'TypeError: Network request timed out' }])).toBe(true);
    expect(isTransientNetworkError(['x', { message: 'Gateway Timeout' }])).toBe(true);
    expect(isTransientNetworkError(['x', new TypeError('Failed to fetch')])).toBe(true);
  });

  it('flags supabase-js auth retryable fetch errors', () => {
    const error = Object.assign(new Error('boom'), { name: 'AuthRetryableFetchError' });
    expect(isTransientNetworkError(['Signup error details:', error])).toBe(true);
  });

  it('keeps real server errors reportable', () => {
    expect(isTransientNetworkError(['x', { code: 'P0001', message: 'level 7 not unlocked' }])).toBe(false);
    expect(isTransientNetworkError(['x', { code: '42501', message: 'permission denied' }])).toBe(false);
    expect(isTransientNetworkError(['Network request failed'])).toBe(false);
  });
});
