/**
 * Web build of adsSdk — react-native-google-mobile-ads is native-only, so the
 * web bundle must never reference it (Metro would fail the export). Rewarded
 * ads simply don't exist on web; monetization.ts degrades gracefully on null.
 */
export type AdsSdk = never;

export function loadAdsSdk(): AdsSdk | null {
  return null;
}
