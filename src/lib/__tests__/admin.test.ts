import {
  fetchIsAdmin,
  previewRecipients,
  sendBroadcast,
  searchUsers,
  listCampaigns,
  saveCampaign,
  setCampaignEnabled,
  deleteCampaign,
  listLog,
  type Segment,
} from '../admin';
import { supabase } from '../supabase';
import type { SupabaseMock, QueryBuilderMock } from '../../../test-utils/supabaseMock';

jest.mock('../supabase', () => {
  const { makeSupabaseMock } = require('../../../test-utils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

const sb = supabase as unknown as SupabaseMock;

/** The query builder returned by the most recent `supabase.from(...)` call. */
function lastBuilder(): QueryBuilderMock {
  const calls = sb.from.mock.results;
  return calls[calls.length - 1].value as QueryBuilderMock;
}

beforeEach(() => sb.__reset());

describe('fetchIsAdmin', () => {
  it('is true only when the profile flag is exactly true', async () => {
    sb.__setResult('profiles', { data: { is_admin: true }, error: null });
    expect(await fetchIsAdmin('u1')).toBe(true);
    const b = lastBuilder();
    expect(sb.from).toHaveBeenCalledWith('profiles');
    expect(b.select).toHaveBeenCalledWith('is_admin');
    expect(b.eq).toHaveBeenCalledWith('id', 'u1');
  });

  it('is false for a non-admin profile', async () => {
    sb.__setResult('profiles', { data: { is_admin: false }, error: null });
    expect(await fetchIsAdmin('u1')).toBe(false);
  });

  it('is false when no profile row is returned', async () => {
    sb.__setResult('profiles', { data: null, error: null });
    expect(await fetchIsAdmin('u1')).toBe(false);
  });
});

describe('previewRecipients', () => {
  const segment: Segment = { type: 'inactive', days: 7 };

  it('invokes the edge function in dryRun mode and returns the count', async () => {
    sb.functions.invoke.mockResolvedValue({ data: { recipients: 42, sent: 0 }, error: null });
    expect(await previewRecipients(segment)).toBe(42);
    expect(sb.functions.invoke).toHaveBeenCalledWith('admin-broadcast', {
      body: { segment, dryRun: true },
    });
  });

  it('throws on a transport error', async () => {
    sb.functions.invoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(previewRecipients(segment)).rejects.toEqual({ message: 'boom' });
  });

  it('throws when the function payload reports an error', async () => {
    sb.functions.invoke.mockResolvedValue({ data: { error: 'not admin' }, error: null });
    await expect(previewRecipients(segment)).rejects.toThrow('not admin');
  });
});

describe('sendBroadcast', () => {
  it('returns recipients and sent counts', async () => {
    sb.functions.invoke.mockResolvedValue({ data: { recipients: 10, sent: 9 }, error: null });
    const res = await sendBroadcast('Hi', 'Body', { type: 'everyone' });
    expect(res).toEqual({ recipients: 10, sent: 9 });
    expect(sb.functions.invoke).toHaveBeenCalledWith('admin-broadcast', {
      body: { title: 'Hi', body: 'Body', segment: { type: 'everyone' } },
    });
  });
});

describe('searchUsers', () => {
  it('short-circuits on a blank query without hitting the network', async () => {
    expect(await searchUsers('   ')).toEqual([]);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('searches by trimmed username and returns rows', async () => {
    const rows = [{ id: 'a', username: 'alice' }];
    sb.__setResult('profiles', { data: rows, error: null });
    expect(await searchUsers('  ali ')).toEqual(rows);
    const b = lastBuilder();
    expect(b.ilike).toHaveBeenCalledWith('username', '%ali%');
    expect(b.limit).toHaveBeenCalledWith(20);
  });

  it('returns an empty array when the query yields no data', async () => {
    sb.__setResult('profiles', { data: null, error: null });
    expect(await searchUsers('zzz')).toEqual([]);
  });
});

describe('campaign CRUD', () => {
  it('lists campaigns newest-first', async () => {
    const rows = [{ id: 'c1' }, { id: 'c2' }];
    sb.__setResult('notification_campaigns', { data: rows, error: null });
    expect(await listCampaigns()).toEqual(rows);
    expect(lastBuilder().order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('inserts a new campaign when no id is supplied', async () => {
    sb.__setResult('notification_campaigns', { data: null, error: null });
    await saveCampaign(
      {
        title: 'T',
        body: 'B',
        segment: { type: 'everyone' },
        schedule: 'daily',
        hour: 9,
        weekday: null,
        enabled: true,
      },
      'admin-1',
    );
    const b = lastBuilder();
    expect(b.insert).toHaveBeenCalledWith(expect.objectContaining({ title: 'T', created_by: 'admin-1' }));
    expect(b.update).not.toHaveBeenCalled();
  });

  it('updates an existing campaign when an id is supplied', async () => {
    sb.__setResult('notification_campaigns', { data: null, error: null });
    await saveCampaign(
      {
        id: 'c9',
        title: 'T',
        body: 'B',
        segment: { type: 'everyone' },
        schedule: 'weekly',
        hour: 9,
        weekday: 1,
        enabled: false,
      },
      'admin-1',
    );
    const b = lastBuilder();
    expect(b.update).toHaveBeenCalled();
    expect(b.eq).toHaveBeenCalledWith('id', 'c9');
  });

  it('throws when saving fails', async () => {
    sb.__setResult('notification_campaigns', { data: null, error: { message: 'denied' } });
    await expect(
      saveCampaign(
        { title: 'T', body: 'B', segment: { type: 'everyone' }, schedule: 'daily', hour: 9, weekday: null, enabled: true },
        'admin-1',
      ),
    ).rejects.toEqual({ message: 'denied' });
  });

  it('toggles enabled and throws on error', async () => {
    sb.__setResult('notification_campaigns', { data: null, error: null });
    await expect(setCampaignEnabled('c1', false)).resolves.toBeUndefined();
    expect(lastBuilder().update).toHaveBeenCalledWith({ enabled: false });

    sb.__setResult('notification_campaigns', { data: null, error: { message: 'nope' } });
    await expect(setCampaignEnabled('c1', true)).rejects.toEqual({ message: 'nope' });
  });

  it('deletes a campaign and throws on error', async () => {
    sb.__setResult('notification_campaigns', { data: null, error: null });
    await expect(deleteCampaign('c1')).resolves.toBeUndefined();
    expect(lastBuilder().delete).toHaveBeenCalled();

    sb.__setResult('notification_campaigns', { data: null, error: { message: 'fk' } });
    await expect(deleteCampaign('c2')).rejects.toEqual({ message: 'fk' });
  });
});

describe('listLog', () => {
  it('returns log rows limited to the requested size', async () => {
    const rows = [{ id: 'l1' }];
    sb.__setResult('notification_log', { data: rows, error: null });
    expect(await listLog(5)).toEqual(rows);
    expect(lastBuilder().limit).toHaveBeenCalledWith(5);
  });
});
