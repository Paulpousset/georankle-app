import { purchaseCosmetic } from '../shop';
import { supabase } from '../supabase';
import { cacheClear } from '../cache';
import type { SupabaseMock } from '../../../test-utils/supabaseMock';

jest.mock('../supabase', () => {
  const { makeSupabaseMock } = require('../../../test-utils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});
jest.mock('../cache', () => ({ cacheClear: jest.fn() }));

const sb = supabase as unknown as SupabaseMock;
const cacheClearMock = cacheClear as jest.Mock;

beforeEach(() => {
  sb.__reset();
  cacheClearMock.mockReset();
});

describe('purchaseCosmetic', () => {
  it('debits via the RPC and invalidates the profile cache on success', async () => {
    sb.rpc.mockResolvedValue({
      data: { already_owned: false, new_balance: 120 },
      error: null,
    });

    const result = await purchaseCosmetic('item-9', 'user-1');

    expect(sb.rpc).toHaveBeenCalledWith('purchase_cosmetic', { p_item_id: 'item-9' });
    expect(result).toEqual({ ok: true, alreadyOwned: false, newBalance: 120 });
    expect(cacheClearMock).toHaveBeenCalledWith('profile:user-1');
  });

  it('fails (and does NOT touch the cache) when the RPC returns an error', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: { message: 'insufficient_funds' } });

    const result = await purchaseCosmetic('item-9', 'user-1');

    expect(result).toEqual({ ok: false, message: 'insufficient_funds' });
    expect(cacheClearMock).not.toHaveBeenCalled();
  });

  it('fails gracefully when the RPC throws (network path)', async () => {
    sb.rpc.mockRejectedValue(new Error('Network request failed'));

    const result = await purchaseCosmetic('item-9', 'user-1');

    expect(result).toEqual({ ok: false, message: 'Network request failed' });
    expect(cacheClearMock).not.toHaveBeenCalled();
  });
});
