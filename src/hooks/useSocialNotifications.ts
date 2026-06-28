import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../lib/supabase';
import { tr } from '../i18n';
import { log } from '../lib/log';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../components/ToastProvider';

/**
 * Live, in-app awareness of friend-graph activity — the social counterpart to
 * `useMatchEngine`'s game-invite subscription.
 *
 * Before this, a friend request was only ever discovered by opening the Friends
 * screen (no realtime, no badge). This hook:
 *   • keeps `pendingFriendCount` (incoming requests) in sync for a header badge,
 *   • toasts when a new request arrives, and when someone accepts yours.
 *
 * Realtime delivery is scoped by the `friends` SELECT RLS policy, so a client
 * only receives rows it may read: its own incoming requests (user_id2 = me) and
 * acceptances of requests it sent (user_id1 = me). Requires the `friends` table
 * to be in the `supabase_realtime` publication — see realtime_friends.sql.
 */
export function useSocialNotifications() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const toast = useToast();

  const [pendingFriendCount, setPendingFriendCount] = useState(0);

  // The realtime subscription is set up once per session and must not re-run on
  // every language toggle, so the callbacks read the latest language via a ref.
  const langRef = useRef(language);
  useEffect(() => {
    langRef.current = language;
  }, [language]);

  /** Re-count incoming pending requests (called on mount and after the Friends
   *  screen resolves any of them, so the header badge stays truthful). */
  const refreshFriendCount = useCallback(async () => {
    if (!user) {
      setPendingFriendCount(0);
      return;
    }
    const { count, error } = await supabase
      .from('friends')
      .select('id', { count: 'exact', head: true })
      .eq('user_id2', user.id)
      .eq('status', 'pending');
    if (error) {
      log.error('refreshFriendCount error:', error);
      return;
    }
    if (typeof count === 'number') setPendingFriendCount(count);
  }, [user]);

  const lookupUsername = useCallback(async (userId: string): Promise<string> => {
    const { data } = await supabase.from('profiles').select('username').eq('id', userId).single();
    return data?.username ?? tr(langRef.current, 'Quelqu’un', 'Someone');
  }, []);

  useEffect(() => {
    if (!user) {
      setPendingFriendCount(0);
      return;
    }
    refreshFriendCount();

    const channel = supabase
      .channel(`friend_reqs_${user.id}`)
      // A new incoming request (someone added me as a friend).
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'friends', filter: `user_id2=eq.${user.id}` },
        async (payload) => {
          const row = payload.new as { user_id1: string; status: string };
          if (row.status !== 'pending') return;
          setPendingFriendCount((n) => n + 1);
          const name = await lookupUsername(row.user_id1);
          toast.info(tr(langRef.current, `${name} veut être votre ami`, `${name} wants to be friends`));
        },
      )
      // Someone accepted a request I sent (I am user_id1). NEW carries user_id1,
      // so this filter is reliable (unlike DELETE, where only the PK is sent).
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'friends', filter: `user_id1=eq.${user.id}` },
        async (payload) => {
          const row = payload.new as { user_id2: string; status: string };
          if (row.status !== 'accepted') return;
          const name = await lookupUsername(row.user_id2);
          toast.success(
            tr(langRef.current, `${name} a accepté votre demande d’ami`, `${name} accepted your friend request`),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refreshFriendCount, lookupUsername, toast]);

  return { pendingFriendCount, refreshFriendCount };
}
