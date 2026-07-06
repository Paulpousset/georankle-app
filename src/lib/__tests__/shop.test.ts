import { purchaseCosmetic, purchaseBundle, fetchFeaturedCosmetic } from '../shop';
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

describe('purchaseBundle', () => {
  it('debits once, returns the granted items and invalidates the profile cache', async () => {
    sb.rpc.mockResolvedValue({
      data: { granted: ['globe_mars', 'orbit_saturn'], new_balance: 300 },
      error: null,
    });

    const result = await purchaseBundle('bundle_solar', 'user-1');

    expect(sb.rpc).toHaveBeenCalledWith('purchase_bundle', { p_bundle_id: 'bundle_solar' });
    expect(result).toEqual({ ok: true, granted: ['globe_mars', 'orbit_saturn'], newBalance: 300 });
    expect(cacheClearMock).toHaveBeenCalledWith('profile:user-1');
  });

  it('surfaces RPC errors without touching the cache', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: { message: 'bundle already owned' } });

    const result = await purchaseBundle('bundle_solar', 'user-1');

    expect(result).toEqual({ ok: false, message: 'bundle already owned' });
    expect(cacheClearMock).not.toHaveBeenCalled();
  });
});

describe('fetchFeaturedCosmetic', () => {
  it('maps the RPC payload to a FeaturedCosmetic', async () => {
    sb.rpc.mockResolvedValue({
      data: { item_id: 'globe_gold', price: 1050, base_price: 1500 },
      error: null,
    });

    await expect(fetchFeaturedCosmetic()).resolves.toEqual({
      itemId: 'globe_gold',
      price: 1050,
      basePrice: 1500,
    });
    expect(sb.rpc).toHaveBeenCalledWith('get_featured_cosmetic');
  });

  it('returns null on error so the shop renders without the banner', async () => {
    sb.rpc.mockRejectedValue(new Error('offline'));
    await expect(fetchFeaturedCosmetic()).resolves.toBeNull();
  });
});
