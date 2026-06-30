import { Image } from 'react-native';
import { CCA3_TO_CCA2 } from '../data/countryCodes';

const FLAG_CDN = 'https://flagcdn.com/w160';

/**
 * Builds a flag image URL for an ISO alpha-3 country code.
 * Falls back to the UN flag when the code is unknown.
 */
export function getFlagUrl(cca3: string): string {
  const code = CCA3_TO_CCA2[cca3];
  if (!code) return `${FLAG_CDN}/un.png`;
  return `${FLAG_CDN}/${code.toLowerCase()}.png`;
}

/**
 * Builds a flag image URL for an ISO 3166-2 subdivision slug (e.g. `us-ca` for
 * California). flagcdn hosts subdivision flags at the same path as countries, so
 * the country-challenge games (US state flags, …) reuse the exact same CDN.
 */
export function getSubdivisionFlagUrl(slug: string): string {
  return `${FLAG_CDN}/${slug.toLowerCase()}.png`;
}

// URLs already requested this session — avoids redundant prefetch calls.
const prefetched = new Set<string>();

/**
 * Warms the native image cache for upcoming flags so they appear instantly
 * instead of popping in mid-round. Safe to call with the whole game's country
 * list; each URL is only fetched once per session. Failures are ignored.
 */
export function prefetchFlags(cca3s: string[]): void {
  for (const cca3 of cca3s) {
    const url = getFlagUrl(cca3);
    if (prefetched.has(url)) continue;
    prefetched.add(url);
    Image.prefetch(url).catch(() => {
      // Network hiccup — drop it so a later call can retry.
      prefetched.delete(url);
    });
  }
}

/** Like prefetchFlags, but for ISO 3166-2 subdivision slugs (e.g. `us-ca`). */
export function prefetchFlagSlugs(slugs: string[]): void {
  for (const slug of slugs) {
    const url = getSubdivisionFlagUrl(slug);
    if (prefetched.has(url)) continue;
    prefetched.add(url);
    Image.prefetch(url).catch(() => {
      prefetched.delete(url);
    });
  }
}
