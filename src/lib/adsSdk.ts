/**
 * Native-only loader for react-native-google-mobile-ads. Kept in its own file
 * (with an adsSdk.web.ts sibling) because Metro statically bundles require()d
 * modules even inside try/catch — a direct require in monetization.ts breaks
 * the web export, where the SDK has no web implementation.
 */
import { Platform } from 'react-native';

export type AdsSdk = typeof import('react-native-google-mobile-ads');

/** The native SDK, or null on jest/Expo Go where it isn't linked. */
export function loadAdsSdk(): AdsSdk | null {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-google-mobile-ads') as AdsSdk;
  } catch {
    return null;
  }
}
