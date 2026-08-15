/**
 * <AvatarPreview3D> — the single live real-time 3D avatar instance (shop modal,
 * editor preview). Hosts the three.js scene from buildAvatarHtml inside the
 * platform GlobeWebView (native WebView / web same-origin iframe).
 *
 * While the frame boots (~200–500 ms) the composited <WorldAvatar3D> renders
 * underneath and the WebView cross-fades in on `ready` — no blank flash. Config
 * changes after `ready` are injected via window.setAvatarConfig (no reload), so
 * tapping swatches in the editor re-styles instantly.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { AvatarConfig } from '../types';
import { COSMETIC_LAYERS } from '../data/cosmeticLayers.gen';
import { COSMETIC_MODELS, GLOBE_TEXTURES } from '../data/cosmeticModels.gen';
import { normalizeConfig } from '../data/cosmetics';
import { buildAvatarHtml, type AvatarLiveAssets } from '../lib/avatar3d/buildAvatarHtml';
import { moduleToWebViewUri } from '../lib/globe3d/textureLoader';
import GlobeWebView, { type WebViewMessageEvent } from './GlobeWebView';
import { WorldAvatar3D } from './WorldAvatar3D';

/** Resolve the live-scene asset URIs for a config: the rig's GLB models
 *  (emblem/satellite/orbit — real 3D), the cartoon globe texture and the
 *  cosmos backdrop, plus sprite fallbacks if a model is missing. */
async function resolveAssets(c: AvatarConfig): Promise<AvatarLiveAssets> {
  const emblemId = c.layers.emblem?.id ?? '';
  const satId = c.layers.satellite?.id ?? '';
  const orbitId = c.layers.orbit?.id ?? '';
  const cosmosId = c.layers.cosmos?.id ?? '';
  const globeStyle = (c.layers.globe?.id ?? 'globe_classic').replace('globe_', '');
  const emblemSrc = COSMETIC_LAYERS[emblemId];
  const mods: Record<keyof AvatarLiveAssets, number | undefined> = {
    emblem: emblemSrc?.sprite ?? emblemSrc?.main,
    satellite: COSMETIC_LAYERS[satId]?.main,
    emblemModel: COSMETIC_MODELS[emblemId],
    satModel: COSMETIC_MODELS[satId],
    orbitModel: COSMETIC_MODELS[orbitId],
    // Relief 3D des continents (partagé) + props du style (volcans, calottes…)
    landModel: COSMETIC_MODELS.globe_land,
    globePropsModel: COSMETIC_MODELS[`globe_${globeStyle}_props`],
    globeTex: GLOBE_TEXTURES[globeStyle],
    cosmosTex: cosmosId && cosmosId !== 'cosmos_bluenight' ? COSMETIC_LAYERS[cosmosId]?.main : undefined,
  };
  const keys = Object.keys(mods) as (keyof AvatarLiveAssets)[];
  const uris = await Promise.all(
    keys.map((k) => (mods[k] ? moduleToWebViewUri(mods[k]!) : Promise.resolve(null))),
  );
  const out: AvatarLiveAssets = {};
  keys.forEach((k, i) => {
    out[k] = uris[i];
  });
  return out;
}

interface AvatarPreview3DProps {
  config?: AvatarConfig | null;
  size: number;
  style?: StyleProp<ViewStyle>;
}

export function AvatarPreview3D({ config, size, style }: AvatarPreview3DProps) {
  const cfg = useMemo(() => normalizeConfig(config ?? ({} as AvatarConfig)), [config]);
  const [html, setHtml] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Same untyped ref as the game screens: the shim resolves to WebView on
  // native and the iframe handle on web, which share only injectJavaScript.
  const webViewRef = useRef<any>(null);
  const [fade] = useState(() => new Animated.Value(0));
  const reduceMotionRef = useRef(false);
  // The HTML is built once with the mount-time config; later changes go through
  // window.setAvatarConfig so the WebView never reloads.
  const initialCfgRef = useRef(cfg);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        reduceMotionRef.current = v;
      })
      .catch(() => {});
    // three.js is lazy-imported so its ~700 KB source never lands in the
    // initial web chunk (mirrors the game screens). Sprite URIs are resolved
    // BEFORE build so the first frame opens centred on the equipped emblem.
    Promise.all([import('../vendor/threeSource'), resolveAssets(initialCfgRef.current)])
      .then(([{ THREE_SRC }, sprites]) => {
        if (alive) {
          setHtml(buildAvatarHtml({ threeSrc: THREE_SRC, config: initialCfgRef.current, sprites }));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const inject = useCallback((code: string) => {
    webViewRef.current?.injectJavaScript(`try{${code}}catch(e){};true;`);
  }, []);

  const sendAssets = useCallback(
    async (c: AvatarConfig) => {
      inject(`window.setAssets(${JSON.stringify(await resolveAssets(c))});`);
    },
    [inject],
  );

  const handleMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let msg: { type?: string } = {};
      try {
        msg = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      if (msg.type !== 'ready') return;
      setReady(true);
      if (reduceMotionRef.current) inject('window.setReduceMotion(true);');
      // No NASA textures: the cartoon direction keeps every globe style on its
      // painted-canvas material (same tables as the SVG renderer).
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    },
    [fade, inject],
  );

  // Re-style on config change once the scene is live.
  useEffect(() => {
    if (!ready) return;
    inject(`window.setAvatarConfig(${JSON.stringify(cfg.layers)});`);
    sendAssets(cfg).catch(() => {});
  }, [ready, cfg, inject, sendAssets]);

  return (
    <View style={[{ width: size, height: size, overflow: 'hidden' }, style]}>
      <WorldAvatar3D config={cfg} size={size} animate style={StyleSheet.absoluteFill} />
      {html ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          <GlobeWebView
            ref={webViewRef}
            source={{ html }}
            onMessage={handleMessage}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            style={styles.webview}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: 'transparent' },
});
