import { awardSoloCoins } from '../coins';
import { supabase } from '../supabase';
import { enqueue } from '../syncQueue';
import type { SupabaseMock } from '../../../test-utils/supabaseMock';

jest.mock('../supabase', () => {
  const { makeSupabaseMock } = require('../../../test-utils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});
jest.mock('../syncQueue', () => ({ enqueue: jest.fn() }));

const sb = supabase as unknown as SupabaseMock;
const enqueueMock = enqueue as jest.Mock;

beforeEach(() => {
  sb.__reset();
  enqueueMock.mockReset();
});

describe('awardSoloCoins', () => {
  it('returns the server award and marks it synced on success', async () => {
    sb.rpc.mockResolvedValue({ data: { coins_awarded: 5, capped: false }, error: null });

    const result = await awardSoloCoins('classic');

    expect(sb.rpc).toHaveBeenCalledWith('award_solo_coins', { p_game_mode: 'classic' });
    expect(result).toEqual({ coinsAwarded: 5, capped: false, synced: true });
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('surfaces the daily cap from the server payload', async () => {
    sb.rpc.mockResolvedValue({ data: { coins_awarded: 0, capped: true }, error: null });

    expect(await awardSoloCoins('streak')).toEqual({
      coinsAwarded: 0,
      capped: true,
      synced: true,
    });
  });

  it('defaults missing payload fields to zero / not-capped', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: null });

    expect(await awardSoloCoins('classic')).toEqual({
      coinsAwarded: 0,
      capped: false,
      synced: true,
    });
  });

  it('queues the award for retry when the RPC returns an error', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: { message: 'rls denied' } });

    const result = await awardSoloCoins('classic');

    expect(result).toEqual({ coinsAwarded: 0, capped: false, synced: false });
    expect(enqueueMock).toHaveBeenCalledWith({ type: 'coins', gameMode: 'classic' });
  });

  it('queues the award for retry when the RPC throws (network path)', async () => {
    sb.rpc.mockRejectedValue(new Error('Network request failed'));

    const result = await awardSoloCoins('streak');

    expect(result).toEqual({ coinsAwarded: 0, capped: false, synced: false });
    expect(enqueueMock).toHaveBeenCalledWith({ type: 'coins', gameMode: 'streak' });
  });
});
