import { useEffect } from 'react';
import { Linking } from 'react-native';
import { parseLeagueCode, parseReferralCode } from '../lib/links';
import { storePendingReferral, redeemPendingReferral } from '../lib/referral';
import { joinPendingLeague, storePendingLeagueJoin } from '../lib/league';
import { useAuth } from '../contexts/AuthContext';
import { track } from '../lib/analytics';

/**
 * The install→reward half of the viral loop.
 *
 * Captures a referral code (`?code=`/`?ref=`) and/or a league invite
 * (`?league=`) from the link that opened the app — cold start
 * (`getInitialURL`) or while running (`url` event) — stashes them, and
 * redeems/joins as soon as a session exists. Works with both the `geog://`
 * scheme and the https links. `onRedeemed` / `onLeagueJoined` fire once so the
 * UI can celebrate.
 */
export function useDeepLinks(
  onRedeemed?: (coins: number) => void,
  onLeagueJoined?: (name: string) => void,
): void {
  const { user } = useAuth();

  // Capture from the opening URL + any URL received while the app is running.
  useEffect(() => {
    let mounted = true;
    const capture = (url: string | null) => {
      const code = parseReferralCode(url);
      if (code) {
        track('referral_link_opened', {});
        storePendingReferral(code).then(() => {
          // Already logged in? Redeem right away.
          redeemPendingReferral().then((r) => {
            if (mounted && r?.granted) onRedeemed?.(r.coins ?? 0);
          });
        });
      }
      const league = parseLeagueCode(url);
      if (league) {
        storePendingLeagueJoin(league).then(() => {
          joinPendingLeague().then((r) => {
            if (mounted && r) onLeagueJoined?.(r.name);
          });
        });
      }
    };
    Linking.getInitialURL().then(capture);
    const sub = Linking.addEventListener('url', ({ url }) => capture(url));
    return () => {
      mounted = false;
      sub.remove();
    };
    // Mount-once: the handler closes over onRedeemed which is stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the user logs in later, redeem/join anything captured pre-session.
  useEffect(() => {
    if (!user) return;
    redeemPendingReferral().then((r) => {
      if (r?.granted) onRedeemed?.(r.coins ?? 0);
    });
    joinPendingLeague().then((r) => {
      if (r) onLeagueJoined?.(r.name);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
}
