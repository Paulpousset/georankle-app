/**
 * Earth texture delivery into WebView/iframe three.js scenes.
 *
 * The injected HTML ships texture-free (keeps the native bridge payload small);
 * after the frame posts `ready`, callers send URIs via window.setTextures():
 *  - web: the Metro-hashed bundle URL (same-origin for the srcdoc iframe),
 *  - native: a base64 data URL read via expo-file-system (WebView srcdoc pages
 *    have no origin, so file:// asset URIs are not reliably fetchable).
 * Base64 payloads are memoised per session; callers request only the keys the
 * active theme needs (day OR night) to halve the injection cost.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Metro only bundles
   assets referenced by STATIC require() calls; ES imports don't cover .webp. */
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export type EarthTextureKey = 'day' | 'night' | 'clouds' | 'bump';
export type EarthTextureQuality = '1k' | '2k';

const MODULES: Record<EarthTextureQuality, Record<EarthTextureKey, number>> = {
  '2k': {
    day: require('../../../assets/textures/earth_day_2k.webp'),
    night: require('../../../assets/textures/earth_night_2k.webp'),
    clouds: require('../../../assets/textures/earth_clouds_1k.webp'),
    bump: require('../../../assets/textures/earth_bump_1k.webp'),
  },
  '1k': {
    day: require('../../../assets/textures/earth_day_1k.webp'),
    night: require('../../../assets/textures/earth_night_1k.webp'),
    clouds: require('../../../assets/textures/earth_clouds_1k.webp'),
    bump: require('../../../assets/textures/earth_bump_1k.webp'),
  },
};

const uriCache = new Map<string | number, Promise<string>>();

/**
 * Turn a bundled asset module (require() number) into a URI a WebView/iframe
 * page can load: the Metro bundle URL on web, a base64 data URL on native.
 * Memoised per module for the session.
 */
export function moduleToWebViewUri(mod: number): Promise<string> {
  let cached = uriCache.get(mod);
  if (!cached) {
    cached = (async () => {
      const asset = Asset.fromModule(mod);
      if (Platform.OS === 'web') return asset.uri;
      await asset.downloadAsync();
      const b64 = await FileSystem.readAsStringAsync(asset.localUri ?? asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const mime =
        asset.type === 'glb'
          ? 'application/octet-stream'
          : `image/${asset.type === 'png' ? 'png' : 'webp'}`;
      return `data:${mime};base64,${b64}`;
    })();
    uriCache.set(mod, cached);
  }
  return cached;
}

/** Resolve the requested texture URIs (ready to hand to window.setTextures). */
export async function loadEarthTextures(
  keys: EarthTextureKey[],
  quality: EarthTextureQuality = '2k',
): Promise<Partial<Record<EarthTextureKey, string>>> {
  const pairs = await Promise.all(
    keys.map(async (k) => [k, await moduleToWebViewUri(MODULES[quality][k])] as const),
  );
  return Object.fromEntries(pairs);
}
