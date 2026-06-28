/**
 * Friend-graph mutations — the network core of the Friends screen, pulled out so
 * the request / accept / reject / remove flows can be unit-tested without
 * rendering the screen. Each helper returns a small result object; the screen
 * keeps the UI side effects (alerts, analytics, list reloads).
 *
 * A relationship is a single `friends` row keyed by an unordered
 * (user_id1, user_id2) pair whose `status` is 'pending' | 'accepted'.
 */
import { supabase } from './supabase';

export interface OpResult {
  ok: boolean;
  /** Server error message when `ok` is false. */
  error?: string;
}

/** True if any relationship or pending request already links the two users. */
export async function friendRelationExists(
  userId: string,
  targetUserId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('friends')
    .select('id')
    .or(
      `and(user_id1.eq.${userId},user_id2.eq.${targetUserId}),and(user_id1.eq.${targetUserId},user_id2.eq.${userId})`,
    )
    .single();
  return !!data;
}

export type SendRequestResult = OpResult & { alreadyExists?: boolean };

/** Create a pending request, unless a relationship already exists. */
export async function sendFriendRequest(
  userId: string,
  targetUserId: string,
): Promise<SendRequestResult> {
  if (await friendRelationExists(userId, targetUserId)) {
    return { ok: false, alreadyExists: true };
  }
  const { error } = await supabase
    .from('friends')
    .insert([{ user_id1: userId, user_id2: targetUserId, status: 'pending' }]);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Accept a pending request by its row id. */
export async function acceptFriendRequest(requestId: string): Promise<OpResult> {
  const { error } = await supabase
    .from('friends')
    .update({ status: 'accepted' })
    .eq('id', requestId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Delete a friends row — used both to reject a request and to remove a friend. */
export async function removeFriendRow(requestId: string): Promise<OpResult> {
  const { error } = await supabase.from('friends').delete().eq('id', requestId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
