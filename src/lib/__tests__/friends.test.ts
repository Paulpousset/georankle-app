import {
  friendRelationExists,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriendRow,
} from '../friends';
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

describe('friendRelationExists', () => {
  it('is true when a row links the two users (either direction)', async () => {
    sb.__setResult('friends', { data: { id: 'r1' }, error: null });
    expect(await friendRelationExists('u1', 'u2')).toBe(true);
    expect(lastBuilder().or).toHaveBeenCalledWith(
      'and(user_id1.eq.u1,user_id2.eq.u2),and(user_id1.eq.u2,user_id2.eq.u1)',
    );
  });

  it('is false when no relationship exists', async () => {
    sb.__setResult('friends', { data: null, error: null });
    expect(await friendRelationExists('u1', 'u2')).toBe(false);
  });
});

describe('sendFriendRequest', () => {
  it('inserts a pending request when none exists', async () => {
    sb.__setResult('friends', { data: null, error: null }); // existence check → none
    const result = await sendFriendRequest('u1', 'u2');

    expect(result).toEqual({ ok: true });
    // The most recent builder is the insert; assert its payload.
    expect(lastBuilder().insert).toHaveBeenCalledWith([
      { user_id1: 'u1', user_id2: 'u2', status: 'pending' },
    ]);
  });

  it('refuses when a relationship already exists (no insert)', async () => {
    sb.__setResult('friends', { data: { id: 'r1' }, error: null });
    const result = await sendFriendRequest('u1', 'u2');

    expect(result).toEqual({ ok: false, alreadyExists: true });
    // Only the existence-check `from('friends')` ran — never a second (insert) one.
    expect(sb.from).toHaveBeenCalledTimes(1);
  });

  it('reports an error when the insert fails', async () => {
    // The existence check reads only `data` (null → no relation, so it proceeds);
    // the insert reads only `error`, so one configured result drives both steps.
    sb.__setResult('friends', { data: null, error: { message: 'unique_violation' } });
    const result = await sendFriendRequest('u1', 'u2');

    expect(result).toEqual({ ok: false, error: 'unique_violation' });
  });
});

describe('acceptFriendRequest', () => {
  it('updates the row to accepted', async () => {
    sb.__setResult('friends', { data: null, error: null });
    expect(await acceptFriendRequest('r1')).toEqual({ ok: true });
    const b = lastBuilder();
    expect(b.update).toHaveBeenCalledWith({ status: 'accepted' });
    expect(b.eq).toHaveBeenCalledWith('id', 'r1');
  });

  it('reports the error message on failure', async () => {
    sb.__setResult('friends', { data: null, error: { message: 'rls' } });
    expect(await acceptFriendRequest('r1')).toEqual({ ok: false, error: 'rls' });
  });
});

describe('removeFriendRow', () => {
  it('deletes the row by id', async () => {
    sb.__setResult('friends', { data: null, error: null });
    expect(await removeFriendRow('r1')).toEqual({ ok: true });
    const b = lastBuilder();
    expect(b.delete).toHaveBeenCalled();
    expect(b.eq).toHaveBeenCalledWith('id', 'r1');
  });

  it('reports the error message on failure', async () => {
    sb.__setResult('friends', { data: null, error: { message: 'denied' } });
    expect(await removeFriendRow('r1')).toEqual({ ok: false, error: 'denied' });
  });
});
