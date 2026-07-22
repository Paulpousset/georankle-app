import { useEffect } from 'react';
import { Linking } from 'react-native';
import { parseReferralCode } from '../lib/links';
import { storePendingReferral, redeemPendingReferral } from '../lib/referral';
import { useAuth } from '../contexts/AuthContext';
import { track } from '../lib/analytics';

/**
 * The install→reward half of the viral loop.
 *
 * Captures a referral code from the link that opened the app — cold start
 * (`getInitialURL`) or while running (`url` event) — stashes it, and redeems it
 * as soon as a session exists. Works with both the `geog://` scheme and the
 * https invite link. `onRedeemed` fires once, with the coins granted, so the UI
 * can celebrate.
 */
export function useDeepLinks(onRedeemed?: (coins: number) => void): void {
  const { user } = useAuth();

  // Capture from the opening URL + any URL received while the app is running.
  useEffect(() => {
    let mounted = true;
    const capture = (url: string | null) => {
      const code = parseReferralCode(url);
      if (!code) return;
      track('referral_link_opened', {});
      storePendingReferral(code).then(() => {
        // Already logged in? Redeem right away.
        redeemPendingReferral().then((r) => {
          if (mounted && r?.granted) onRedeemed?.(r.coins ?? 0);
        });
      });
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

  // When the user logs in later, redeem any code captured before the session.
  useEffect(() => {
    if (!user) return;
    redeemPendingReferral().then((r) => {
      if (r?.granted) onRedeemed?.(r.coins ?? 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
}
