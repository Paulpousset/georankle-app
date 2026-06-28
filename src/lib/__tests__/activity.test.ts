import { touchLastSeen } from '../activity';
import { supabase } from '../supabase';
import type { SupabaseMock } from '../../../test-utils/supabaseMock';

jest.mock('../supabase', () => {
  const { makeSupabaseMock } = require('../../../test-utils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

const sb = supabase as unknown as SupabaseMock;
const TEN_MIN = 10 * 60 * 1000;

afterEach(() => {
  jest.restoreAllMocks();
});

describe('touchLastSeen', () => {
  // `lastTouch` is module-level state, so this single test walks the throttle
  // through its whole lifecycle rather than relying on per-test module resets.
  it('throttles writes within the window and retries after a failure', async () => {
    let now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    sb.rpc.mockResolvedValue({ data: null, error: null });

    // First call writes.
    await touchLastSeen();
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(sb.rpc).toHaveBeenCalledWith('touch_last_seen');

    // Within the 10-minute window → throttled, no write.
    now += 5 * 60 * 1000;
    await touchLastSeen();
    expect(sb.rpc).toHaveBeenCalledTimes(1);

    // Past the window → writes again.
    now += 6 * 60 * 1000;
    await touchLastSeen();
    expect(sb.rpc).toHaveBeenCalledTimes(2);

    // A failed write resets the throttle so the very next call retries
    // immediately (no waiting another full window after a transient error).
    now += TEN_MIN + 1;
    sb.rpc.mockRejectedValueOnce(new Error('offline'));
    await touchLastSeen();
    expect(sb.rpc).toHaveBeenCalledTimes(3);

    await touchLastSeen();
    expect(sb.rpc).toHaveBeenCalledTimes(4);
  });
});
