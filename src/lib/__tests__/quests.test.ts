import { fetchDailyQuests, claimQuest, questLabel, type DailyQuest } from '../quests';
import { supabase } from '../supabase';
import type { SupabaseMock } from '../../../test-utils/supabaseMock';

jest.mock('../supabase', () => {
  const { makeSupabaseMock } = require('../../../test-utils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

const sb = supabase as unknown as SupabaseMock;

beforeEach(() => sb.__reset());

const QUEST: DailyQuest = {
  id: 'daily_1',
  reward: 5,
  target: 1,
  current: 0,
  done: false,
  claimed: false,
};

describe('fetchDailyQuests', () => {
  it('returns the server payload as-is', async () => {
    sb.rpc.mockResolvedValueOnce({ data: [QUEST], error: null });
    expect(await fetchDailyQuests()).toEqual([QUEST]);
    expect(sb.rpc).toHaveBeenCalledWith('get_daily_quests');
  });

  it('normalises a null payload to an empty list', async () => {
    sb.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await fetchDailyQuests()).toEqual([]);
  });

  it('throws on RPC error', async () => {
    sb.rpc.mockResolvedValueOnce({ data: null, error: { message: 'rls' } });
    await expect(fetchDailyQuests()).rejects.toEqual({ message: 'rls' });
  });
});

describe('claimQuest', () => {
  it('passes the quest id and returns the claim payload', async () => {
    sb.rpc.mockResolvedValueOnce({ data: { claimed: true, coins_awarded: 5 }, error: null });
    expect(await claimQuest('daily_1')).toEqual({ claimed: true, coins_awarded: 5 });
    expect(sb.rpc).toHaveBeenCalledWith('claim_quest', { p_quest_id: 'daily_1' });
  });

  it('relays server-side refusals (incomplete / already claimed)', async () => {
    sb.rpc.mockResolvedValueOnce({
      data: { claimed: false, reason: 'incomplete', current: 1, target: 3 },
      error: null,
    });
    expect((await claimQuest('daily_3')).reason).toBe('incomplete');
  });

  it('throws on RPC error', async () => {
    sb.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(claimQuest('daily_1')).rejects.toEqual({ message: 'boom' });
  });
});

describe('questLabel', () => {
  it('localizes every quest id in both languages', () => {
    const ids = [
      'daily_1',
      'daily_3',
      'solo_2modes',
      'solo_5games',
      'online_play',
      'online_win',
      'ranked_play',
      'ranked_win',
    ];
    for (const id of ids) {
      expect(questLabel(id, 'fr')).not.toBe(id);
      expect(questLabel(id, 'en')).not.toBe(id);
      expect(questLabel(id, 'fr')).not.toBe(questLabel(id, 'en'));
    }
  });

  it('falls back to the raw id for an unknown quest', () => {
    expect(questLabel('mystery_quest', 'fr')).toBe('mystery_quest');
  });
});
