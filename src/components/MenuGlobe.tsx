/**
 * Decorative spinning globe for the main menu — the planet "rises" behind the
 * GeoGames title, echoing the playgeog.com landing hero. Theme-aware (parchment
 * atlas by day, nautical night chart in dark mode), cropped to its upper part
 * and faded into the screen background at the bottom.
 *
 * Purely decorative: hidden from accessibility, no touch handling. Reuses the
 * shared orthographic projection + simplified world polygons from RankGlobe.
 * The spin honours the system reduce-motion setting.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop, ClipPath } from 'react-native-svg';

import rawWorldPolygons from '../../assets/world_polygons.json';
import { graticule, project } from '../lib/globeProjection';

/**
 * Land rings for the menu globe. The tiny `WORLD_POLYS` set used by RankGlobe
 * (~7 points per country) shatters at this display size, so we reuse the full
 * in-game polygon asset (already bundled for the Globe mode), lightly decimated
 * (every 2nd point on large rings) to keep the spin cheap. Antarctica is
 * dropped — it is never in view with the northern-tilted camera and its
 * antimeridian-spanning ring projects badly.
 */
const MENU_RINGS: [number, number][][] = (
  rawWorldPolygons as { id: string; r: [number, number][][] }[]
)
  .filter((c) => c.id !== 'ATA')
  .flatMap((c) => c.r)
  .map((ring) => (ring.length > 24 ? ring.filter((_, i) => i % 2 === 0) : ring))
  .filter((ring) => ring.length >= 4);

interface GlobeTheme {
  oceanLight: string;
  oceanMid: string;
  oceanDeep: string;
  land: string;
  landStroke: string;
  graticule: string;
  rim: string;
}

const LIGHT_THEME: GlobeTheme = {
  oceanLight: '#f6ecd4',
  oceanMid: '#ecdcb6',
  oceanDeep: '#d9c092',
  land: '#dfc79c',
  landStroke: '#7a5c38',
  graticule: '#7a5c38',
  rim: '#7a5c38',
};

const DARK_THEME: GlobeTheme = {
  oceanLight: '#16273f',
  oceanMid: '#101d33',
  oceanDeep: '#0b1526',
  land: '#1d3a5f',
  landStroke: '#7aa0c4',
  graticule: '#7aa0c4',
  rim: '#4a6a88',
};

/**
 * Ring → SVG path where hidden points are clamped onto the horizon circle
 * instead of breaking the path (the shared `ringToPath` splits rings at the
 * horizon, which shatters large landmasses at this display size). Clamping
 * keeps every ring closed — shapes just flatten against the globe's edge.
 * Rings entirely on the far side return ''.
 */
function ringToClampedPath(
  ring: [number, number][],
  cLon: number,
  cLat: number,
  r: number,
  cx: number,
  cy: number,
): string {
  const d: string[] = [];
  let anyVisible = false;
  for (const [lon, lat] of ring) {
    const [x, y, vis] = project(lon, lat, cLon, cLat, r, cx, cy);
    let px = x;
    let py = y;
    if (vis) {
      anyVisible = true;
    } else {
      const dx = x - cx;
      const dy = y - cy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      px = cx + (dx / len) * r;
      py = cy + (dy / len) * r;
    }
    d.push(`${d.length === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`);
  }
  if (!anyVisible || d.length < 2) return '';
  d.push('Z');
  return d.join(' ');
}

interface MenuGlobeProps {
  /** Globe diameter in px. */
  size: number;
  isDarkMode: boolean;
  /** Screen background the bottom of the globe fades into. */
  backgroundColor: string;
  /** Fraction of the globe height kept visible (cropped from the top). */
  crop?: number;
  style?: StyleProp<ViewStyle>;
}

/** Spin speed in degrees per second — a full turn every 2 minutes. */
const SPIN_DEG_PER_S = 3;
/** Re-render cadence for the spin (~30fps is plenty for a slow rotation). */
const FRAME_MS = 33;

function MenuGlobeBase({ size, isDarkMode, backgroundColor, crop = 0.62, style }: MenuGlobeProps) {
  const t = isDarkMode ? DARK_THEME : LIGHT_THEME;
  const r = size / 2 - 1;
  const cx = size / 2;
  const cy = size / 2;
  const cLat = 12;

  const [lon, setLon] = useState(-20);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => {
      if (mounted) setReduceMotion(!!v);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);
  useEffect(() => {
    if (reduceMotion) return;
    const tick = (ts: number) => {
      if (lastRef.current == null) lastRef.current = ts;
      const dt = ts - lastRef.current;
      if (dt >= FRAME_MS) {
        lastRef.current = ts;
        setLon((prev) => (prev + (SPIN_DEG_PER_S * dt) / 1000) % 360);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      lastRef.current = null;
    };
  }, [reduceMotion]);

  const landPaths = useMemo(() => {
    const paths: string[] = [];
    for (const ring of MENU_RINGS) {
      const d = ringToClampedPath(ring, lon, cLat, r, cx, cy);
      if (d) paths.push(d);
    }
    return paths;
  }, [lon, r, cx, cy]);

  const gratLines = useMemo(() => {
    const lines: string[] = [];
    for (const lat of [-60, -30, 0, 30, 60]) {
      const d = graticule(true, lat, lon, cLat, r, cx, cy);
      if (d) lines.push(d);
    }
    for (const mer of [-120, -60, 0, 60, 120, 180]) {
      const d = graticule(false, mer, lon, cLat, r, cx, cy);
      if (d) lines.push(d);
    }
    return lines;
  }, [lon, r, cx, cy]);

  const visibleHeight = Math.round(size * crop);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: size, height: visibleHeight, overflow: 'hidden' }, style]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="mg_ocean" cx="36%" cy="30%" r="72%">
            <Stop offset="0%" stopColor={t.oceanLight} />
            <Stop offset="65%" stopColor={t.oceanMid} />
            <Stop offset="100%" stopColor={t.oceanDeep} />
          </RadialGradient>
          <LinearGradient id="mg_fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={backgroundColor} stopOpacity="0" />
            <Stop offset="55%" stopColor={backgroundColor} stopOpacity="0" />
            <Stop offset="100%" stopColor={backgroundColor} stopOpacity="1" />
          </LinearGradient>
          <ClipPath id="mg_clip">
            <Circle cx={cx} cy={cy} r={r} />
          </ClipPath>
        </Defs>

        <Circle cx={cx} cy={cy} r={r} fill="url(#mg_ocean)" stroke={t.rim} strokeWidth={1.2} strokeOpacity={0.8} />

        <G clipPath="url(#mg_clip)">
          {gratLines.map((d, i) => (
            <Path key={`g${i}`} d={d} fill="none" stroke={t.graticule} strokeWidth={0.6} strokeOpacity={0.22} />
          ))}
          {landPaths.map((d, i) => (
            <Path key={`l${i}`} d={d} fill={t.land} stroke={t.landStroke} strokeWidth={0.5} strokeOpacity={0.6} />
          ))}
        </G>

        {/* Fade the visible crop into the screen background. */}
        <Rect x={0} y={0} width={size} height={visibleHeight} fill="url(#mg_fade)" />
      </Svg>
    </View>
  );
}

export const MenuGlobe = React.memo(MenuGlobeBase);
