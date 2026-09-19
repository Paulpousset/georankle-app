/**
 * <WorldAvatar3D> — the pre-rendered 3D flavour of the cosmetic World identity.
 * Composites transparent WebP layers (rendered by asset-pipeline/render_layers.py
 * from the shared Blender rig) in the same back→front order as <WorldAvatar>:
 * cosmos → orbit(back) → satellite(behind) → globe → emblem → orbit(front) →
 * satellite(front). Lists show ~30 avatars at once, so this stays plain <Image>
 * stacking — real-time 3D lives only in <AvatarPreview3D>.
 *
 * Falls back to the procedural SVG <WorldAvatar> whenever any equipped item has
 * no rendered layer yet (pack not shipped, or item added to the catalog before
 * its Blender render) — whole-avatar fallback so the look is always coherent.
 * `cosmos_bluenight` (the only tintable item) intentionally has no rendered
 * layer: its tintable radial gradient is drawn procedurally here too.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import type { AvatarConfig } from '../types';
import { COSMETIC_LAYERS } from '../data/cosmeticLayers.gen';
import { DEFAULT_AVATAR_CONFIG, LAYER_ORDER } from '../data/cosmetics';
import { WorldAvatar } from './WorldAvatar';

// Mirrors WorldAvatar's clock constants so both renderers animate in step.
const SAT_BASE_ANGLE = -Math.PI / 4;
const SAT_SPEED = 0.5;

// Globe radius inside a rendered layer frame, as a fraction of the frame size —
// derived from rig.json camera (fov 20°, d=9.15 → sphere fills ~62% of the
// frame, matching the SVG WorldAvatar zoom; rings 1.26–1.55 fit the frame).
const GLOBE_FRAME_RATIO = 0.31;
// rig.json satellite orbit, in globe radii.
const SAT_ORBIT_RX = 1.35;
const SAT_ORBIT_RY = 0.52;
const SAT_ORBIT_TILT = (18 * Math.PI) / 180;
const SAT_SPRITE_RATIO = 0.19;

/** Orbit styles whose rendered rings breathe via an opacity pulse. */
const PULSING_ORBITS = new Set(['orbit_neon', 'orbit_fire', 'orbit_fireflies']);

/** Tight solo render for emblem/satellite shop tiles (undefined -> GlyphThumb).
 *  Emblems must use the dedicated sprite (their main layer is the on-globe
 *  composite); satellites' main IS the tight solo render. */
export function cosmeticTileSprite(part: { id: string; category: string }): number | undefined {
  const src = COSMETIC_LAYERS[part.id];
  if (!src) return undefined;
  return part.category === 'emblem' ? src.sprite : (src.sprite ?? src.main);
}

/** True when every equipped item has its pre-rendered layers available. */
export function worldAvatar3dReady(config?: AvatarConfig | null): boolean {
  const layers = (config ?? DEFAULT_AVATAR_CONFIG).layers;
  for (const cat of LAYER_ORDER) {
    const id = layers?.[cat]?.id;
    if (!id || id.endsWith('_none') || id === 'cosmos_bluenight') continue;
    const src = COSMETIC_LAYERS[id];
    if (!src || (!src.main && !(src.back && src.front))) return false;
  }
  return true;
}

function shade(hex: string, amt: number): string {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
  const n = parseInt(full, 16);
  const mix = (v: number) => {
    const target = amt < 0 ? 0 : 255;
    return Math.round(v + (target - v) * Math.abs(amt));
  };
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

interface WorldAvatar3DProps {
  config?: AvatarConfig | null;
  size: number;
  style?: StyleProp<ViewStyle>;
  animate?: boolean;
  round?: boolean;
  /** No cosmos backdrop: the world floats over whatever is behind (story map). */
  transparent?: boolean;
}

function WorldAvatar3DBase({ config, size, style, animate = false, round = false, transparent = false }: WorldAvatar3DProps) {
  const cfg = config ?? DEFAULT_AVATAR_CONFIG;
  const ready = useMemo(() => worldAvatar3dReady(cfg), [cfg]);

  // Animation clock (seconds) — same rAF pattern as WorldAvatar; at most one or
  // two animated instances exist on screen (shop/editor/profile previews).
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!animate || !ready) return;
    let raf = 0;
    const t0 = Date.now();
    const tick = () => {
      setT((Date.now() - t0) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, ready]);

  if (!ready) {
    return <WorldAvatar config={config} size={size} style={style} animate={animate} round={round} transparent={transparent} />;
  }

  const layers = cfg.layers;
  const cosmosId = layers.cosmos?.id;
  const globeSrc = COSMETIC_LAYERS[layers.globe?.id ?? ''];
  const orbitSrc = COSMETIC_LAYERS[layers.orbit?.id ?? ''];
  const emblemSrc = COSMETIC_LAYERS[layers.emblem?.id ?? ''];
  const satSrc = COSMETIC_LAYERS[layers.satellite?.id ?? ''];
  const cosmosSrc = cosmosId === 'cosmos_bluenight' ? undefined : COSMETIC_LAYERS[cosmosId ?? ''];

  // Satellite position on the tilted rig ellipse; lower half (sy > 0) = front.
  const angle = SAT_BASE_ANGLE + (animate ? t * SAT_SPEED : 0);
  const R = size * GLOBE_FRAME_RATIO;
  const ex = Math.cos(angle) * SAT_ORBIT_RX * R;
  const ey = Math.sin(angle) * SAT_ORBIT_RY * R;
  const sx = ex * Math.cos(SAT_ORBIT_TILT) - ey * Math.sin(SAT_ORBIT_TILT);
  const sy = ex * Math.sin(SAT_ORBIT_TILT) + ey * Math.cos(SAT_ORBIT_TILT);
  const satInFront = Math.sin(angle) > 0;
  const satSize = size * SAT_SPRITE_RATIO;

  const orbitPulse =
    animate && PULSING_ORBITS.has(layers.orbit?.id ?? '') ? 0.75 + 0.25 * Math.sin(t * 3) : 1;

  const fill = { position: 'absolute' as const, width: size, height: size };
  const tint = layers.cosmos?.tint ?? '#0b1230';

  const satellite = satSrc?.main ? (
    <Image
      source={satSrc.main}
      style={{
        position: 'absolute',
        width: satSize,
        height: satSize,
        left: size / 2 + sx - satSize / 2,
        top: size / 2 + sy - satSize / 2,
      }}
      resizeMode="contain"
    />
  ) : null;

  return (
    <View
      style={[
        { width: size, height: size, overflow: 'hidden', borderRadius: round ? size / 2 : 0 },
        style,
      ]}
    >
      {transparent ? null : cosmosSrc?.main ? (
        <Image source={cosmosSrc.main} style={fill} resizeMode="cover" />
      ) : (
        <Svg width={size} height={size} style={fill}>
          <Defs>
            <RadialGradient id="wa3dCosmos" cx="50%" cy="38%" r="80%">
              <Stop offset="0%" stopColor={shade(tint, 0.18)} />
              <Stop offset="55%" stopColor={tint} />
              <Stop offset="100%" stopColor={shade(tint, -0.45)} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={size} height={size} fill="url(#wa3dCosmos)" />
        </Svg>
      )}
      {orbitSrc?.back ? (
        <Image source={orbitSrc.back} style={[fill, { opacity: orbitPulse }]} resizeMode="contain" />
      ) : null}
      {!satInFront ? satellite : null}
      {globeSrc?.main ? <Image source={globeSrc.main} style={fill} resizeMode="contain" /> : null}
      {emblemSrc?.main ? <Image source={emblemSrc.main} style={fill} resizeMode="contain" /> : null}
      {(orbitSrc?.front ?? orbitSrc?.main) ? (
        <Image
          source={(orbitSrc.front ?? orbitSrc.main)!}
          style={[fill, { opacity: orbitPulse }]}
          resizeMode="contain"
        />
      ) : null}
      {satInFront ? satellite : null}
    </View>
  );
}

export const WorldAvatar3D = React.memo(WorldAvatar3DBase);
