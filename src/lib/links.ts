/**
 * The app's public web domain and every link we build from it — share links,
 * referral links, deep-link parsing.
 *
 * SITE_DOMAIN is the ONE place to change to move to a branded domain later:
 * share text, the invite landing page, and app.json `associatedDomains` all
 * point back here. Today it's the live Vercel domain (already serving
 * privacy.html / reset-password.html), so referral links resolve immediately.
 */

/** The live web domain. Branded domain later = change this single line. */
export const SITE_DOMAIN = 'playgeog.com';
export const SITE_URL = `https://${SITE_DOMAIN}`;

/**
 * Referral invite link, e.g.
 *   https://playgeog.com/invite.html?code=A3F8C13E
 * Opens the landing page (OG preview + store buttons); once universal links are
 * verified it deep-links straight into the app.
 */
export function referralLink(code: string): string {
  return `${SITE_URL}/invite.html?code=${encodeURIComponent(code)}`;
}

/**
 * Instant-play link (the Wordle-style zero-friction entry): opens the app's
 * daily challenge straight in the browser — no install, no login. Carries the
 * referrer's code so playing then installing still credits both. On a phone with
 * the app installed (universal links verified) it deep-links into the app.
 */
export function playLink(code?: string | null): string {
  return code ? `${SITE_URL}/play?code=${encodeURIComponent(code)}` : `${SITE_URL}/play`;
}

/**
 * Extract a referral code from the URL the app was opened with. Accepts both
 * `?code=` and `?ref=`, the `/invite` path and the `geog://` scheme. Returns the
 * uppercased code or null. Codes are 8 hex chars but we accept 4–16 alphanumerics
 * to stay forgiving.
 */
export function parseReferralCode(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/[?&](?:code|ref)=([A-Za-z0-9]{4,16})/);
  return m ? m[1].toUpperCase() : null;
}
