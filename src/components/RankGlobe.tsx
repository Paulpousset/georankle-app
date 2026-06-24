import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle, Path, Defs, RadialGradient, Stop, ClipPath, G } from 'react-native-svg';
import type { Language } from '../types';
import type { RankInfo } from '../lib/ranked';
import { FONTS } from '../theme/typography';
import { WORLD_POLYS } from '../data/worldPolys';
import { ringToPath, graticule } from '../lib/globeProjection';

// Globe center [centerLon, centerLat] per rank — each rank shows a different face of Earth
const RANK_VIEW: Record<string, [number, number]> = {
  bronze:   [10,  15],   // Africa / Europe
  silver:   [-75, 35],   // Americas
  gold:     [85,  20],   // India / Asia
  platinum: [140, 10],   // Pacific / Australia
  diamond:  [0,   62],   // Arctic / Greenland / Europe
  master:   [10,  15],   // Classic Earth view
};

interface RankGlobeProps {
  rank: RankInfo;
  size?: number;
  showName?: boolean;
  language?: Language;
  style?: object;
  /** Spin the globe continuously around its axis. */
  spin?: boolean;
  /** Degrees per second when spinning (default 18 = full turn in 20s). */
  spinSpeed?: number;
}

function RankGlobeBase({
  rank,
  size = 80,
  showName = true,
  language = 'fr',
  style,
  spin = false,
  spinSpeed = 18,
}: RankGlobeProps) {
  const r = (size / 2) - 2;
  const cx = size / 2;
  const cy = size / 2;
  const [baseLon, cLat] = RANK_VIEW[rank.tier] ?? [10, 15];

  // Continuous rotation offset (degrees), driven by an rAF loop when `spin`.
  const [spinLon, setSpinLon] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!spin) return;
    const tick = (ts: number) => {
      if (lastTsRef.current != null) {
        const dt = (ts - lastTsRef.current) / 1000;
        setSpinLon((prev) => (prev + spinSpeed * dt) % 360);
      }
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
    };
  }, [spin, spinSpeed]);

  const cLon = baseLon + (spin ? spinLon : 0);

  // IDs must be unique per tier when multiple globes appear on screen
  const gradId = `rg_${rank.tier}_${Math.round(size)}`;
  const clipId = `rc_${rank.tier}_${Math.round(size)}`;

  // Compute all projected land paths (memoised — stable for a given rank + size)
  const { shadowPaths, fillPaths, hlPaths } = useMemo(() => {
    const shadow: string[] = [];
    const fill:   string[] = [];
    const hl:     string[] = [];
    const ofs = Math.max(1, size * 0.02);

    for (const ring of WORLD_POLYS) {
      const f = ringToPath(ring, cLon, cLat, r, cx, cy);
      if (f.length < 4) continue;
      fill.push(f);
      shadow.push(ringToPath(ring, cLon, cLat, r, cx, cy,  ofs,  ofs));
      hl.push(   ringToPath(ring, cLon, cLat, r, cx, cy, -ofs * 0.65, -ofs * 0.65));
    }
    return { shadowPaths: shadow, fillPaths: fill, hlPaths: hl };
  }, [rank.tier, r, cx, cy, cLon, cLat, size]);

  // Graticule lines
  const gratLines = useMemo(() => {
    const lines: string[] = [];
    for (const lat of [-60, -30, 0, 30, 60]) {
      const d = graticule(true, lat, cLon, cLat, r, cx, cy);
      if (d) lines.push(d);
    }
    for (const lon of [-120, -60, 0, 60, 120, 180]) {
      const d = graticule(false, lon, cLon, cLat, r, cx, cy);
      if (d) lines.push(d);
    }
    return lines;
  }, [cLon, cLat, r, cx, cy]);

  return (
    <View style={[{ alignItems: 'center', gap: 6 }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          {/* Ocean radial gradient: lit upper-left → rank color → deep dark */}
          <RadialGradient id={gradId} cx="36%" cy="30%" r="72%">
            <Stop offset="0%"   stopColor={rank.highlightColor} stopOpacity="1" />
            <Stop offset="42%"  stopColor={rank.color}          stopOpacity="1" />
            <Stop offset="100%" stopColor={rank.darkColor}       stopOpacity="1" />
          </RadialGradient>
          <ClipPath id={clipId}>
            <Circle cx={cx} cy={cy} r={r} />
          </ClipPath>
        </Defs>

        {/* ── Ocean ─────────────────────────────── */}
        <Circle cx={cx} cy={cy} r={r} fill={`url(#${gradId})`} />

        <G clipPath={`url(#${clipId})`}>

          {/* ── Graticule ─────────────────────────── */}
          {gratLines.map((d, i) => (
            <Path
              key={`g${i}`}
              d={d}
              fill="none"
              stroke={rank.darkColor}
              strokeWidth={0.45}
              strokeOpacity={0.28}
            />
          ))}

          {/* ── Land shadow (lower-right, simulates depth) ── */}
          {shadowPaths.map((d, i) => (
            <Path
              key={`s${i}`}
              d={d}
              fill={rank.darkColor}
              fillOpacity={0.5}
            />
          ))}

          {/* ── Land fill (earthy green, neutral across all rank colors) ── */}
          {fillPaths.map((d, i) => (
            <Path
              key={`f${i}`}
              d={d}
              fill="#6e9e52"
              fillOpacity={0.92}
              stroke={rank.darkColor}
              strokeWidth={0.35}
              strokeOpacity={0.55}
            />
          ))}

          {/* ── Land highlight (upper-left, simulates raised relief) ── */}
          {hlPaths.map((d, i) => (
            <Path
              key={`h${i}`}
              d={d}
              fill="rgba(255,255,255,0.20)"
            />
          ))}

        </G>

        {/* ── Globe rim ─────────────────────────── */}
        <Circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={rank.highlightColor}
          strokeWidth={1.2}
          strokeOpacity={0.55}
        />

        {/* ── Specular highlight (lens flare effect) ── */}
        <Circle
          cx={cx - r * 0.27}
          cy={cy - r * 0.30}
          r={r * 0.19}
          fill="white"
          fillOpacity={0.24}
        />
      </Svg>

      {showName && (
        <Text
          style={{
            fontFamily: FONTS.monoBold,
            fontSize: Math.max(8, size * 0.175),
            color: rank.color,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {language === 'fr' ? rank.nameFr : rank.name}
        </Text>
      )}
    </View>
  );
}

/** Memoised: expensive SVG path projection only recomputes when props change. */
export const RankGlobe = React.memo(RankGlobeBase);
