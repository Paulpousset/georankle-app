/**
 * <WorldAvatar> — renders the cosmetic "World" identity entirely in SVG/Text:
 * a procedural globe (paramaterised by the equipped globe style) sitting on a
 * cosmos backdrop, ringed by an orbit, with a landmark emblem and an orbiting
 * satellite glyph. No 3D, no WebView, no CDN — replaces the old <Avatar3D>.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, {
  Rect, Circle, Ellipse, Path, Line, Defs, LinearGradient, RadialGradient, Stop, ClipPath, G,
} from 'react-native-svg';

import type { AvatarConfig } from '../types';
import { getPart } from '../data/cosmetics';
import { WORLD_POLYS } from '../data/worldPolys';
import { ringToPath, graticule } from '../lib/globeProjection';
import { EmblemGlyph, SatelliteGlyph, satelliteOrient, satelliteScale, EMBLEM_COORD } from './worldGlyphs';

const SAT_BASE_ANGLE = -Math.PI / 4;   // satellite start position on the orbit
const SAT_SPEED = 0.5;                 // rad/s around the orbit
const GLOBE_DPS = 6;                   // globe auto-spin deg/s (only when no emblem)

// Fixed globe face for the avatar (Africa / Europe centred).
const VIEW: [number, number] = [14, 20];

// ── Style tables ─────────────────────────────────────────────────────────────

interface GlobeStyle {
  ocean: [string, string, string]; // radial: lit → mid → deep
  land: string;
  stroke: string;
  grat: string;
  relief?: boolean;
  political?: boolean;
  night?: boolean;
  wire?: boolean;
}

const GLOBE_STYLES: Record<string, GlobeStyle> = {
  classic:   { ocean: ['#5cb3ec', '#1f6fae', '#0a2f52'], land: '#6e9e52', stroke: '#2c4a2c', grat: '#0a2f52' },
  satellite: { ocean: ['#2a78b0', '#0d3a66', '#04203c'], land: '#2f6e3a', stroke: '#143a1a', grat: '#04203c' },
  relief:    { ocean: ['#6ec0e0', '#2f7fae', '#123a52'], land: '#b89a5a', stroke: '#7a5a2a', grat: '#123a52', relief: true },
  vintage:   { ocean: ['#ead6ab', '#cdb37e', '#9c7e4e'], land: '#c2a368', stroke: '#7a5a2a', grat: '#a8895a' },
  gold:      { ocean: ['#ffe7a4', '#e0a93a', '#8a5a14'], land: '#caa23a', stroke: '#7a5212', grat: '#8a5a14' },
  gaia:      { ocean: ['#43d6c6', '#159a8a', '#0a4a4a'], land: '#4fc24a', stroke: '#1a6a2a', grat: '#0a4a4a' },
  political: { ocean: ['#cfe4f2', '#9cc0e0', '#6f9fc4'], land: '#cccccc', stroke: '#ffffff', grat: '#9cc0e0', political: true },
  night:     { ocean: ['#0c1834', '#070d22', '#03060f'], land: '#13233f', stroke: '#1c3454', grat: '#0c1830', night: true },
  hologram:  { ocean: ['#0c2c3c', '#06202e', '#03121c'], land: 'none', stroke: '#5ff0ff', grat: '#5ff0ff', wire: true },
};

const POLITICAL_PALETTE = [
  '#e8a87c', '#c38d9e', '#85a392', '#e8c468', '#8aa6c1',
  '#d98c8c', '#9ec7a0', '#c9a06a', '#b0a4c9', '#7fb3b0',
];

// Major city coordinates [lon, lat] lit up by the "night lights" globe.
const CITY_LIGHTS: [number, number][] = [
  [2, 48], [-0.1, 51], [13, 52], [12, 41], [37, 55], [28, -26], [18, -33],
  [31, 30], [55, 25], [77, 28], [116, 39], [121, 31], [139, 35], [103, 1],
  [151, -33], [-58, -34], [-46, -23], [-99, 19], [-118, 34],
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function shade(hex: string, amt: number): string {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
  const n = parseInt(full, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const target = amt < 0 ? 0 : 255;
  const t = Math.abs(amt);
  r = Math.round(r + (target - r) * t);
  g = Math.round(g + (target - g) * t);
  b = Math.round(b + (target - b) * t);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/** Deterministic [0,1) generator seeded by an integer — stable across renders. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ── Component ────────────────────────────────────────────────────────────────

interface WorldAvatarProps {
  config?: AvatarConfig | null;
  size: number;
  style?: StyleProp<ViewStyle>;
  /** Animate movable elements (satellite orbiting, globe spin when no emblem). */
  animate?: boolean;
  /** Reserved — kept for API parity with the old <Avatar3D>. */
  interactive?: boolean;
  spin?: boolean;
}

function WorldAvatarBase({ config, size, style, animate = false }: WorldAvatarProps) {
  const layers = config?.layers;

  // Animation clock (seconds) — only ticks when `animate` is on.
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!animate) return;
    let raf = 0;
    let last: number | null = null;
    const tick = (ts: number) => {
      if (last != null) {
        const dt = (ts - last) / 1000;
        setT((p) => p + dt);
      }
      last = ts;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate]);

  const cosmos = layers?.cosmos ? getPart('cosmos', layers.cosmos.id) : undefined;
  const globe = layers?.globe ? getPart('globe', layers.globe.id) : undefined;
  const orbit = layers?.orbit ? getPart('orbit', layers.orbit.id) : undefined;
  const emblem = layers?.emblem ? getPart('emblem', layers.emblem.id) : undefined;
  const satellite = layers?.satellite ? getPart('satellite', layers.satellite.id) : undefined;

  const cosmosStyle = cosmos?.cosmosStyle ?? 'gradient';
  const cosmosTint = layers?.cosmos?.tint ?? cosmos?.defaultTint ?? '#0b1230';
  const gs = GLOBE_STYLES[globe?.globeStyle ?? 'classic'] ?? GLOBE_STYLES.classic;
  const orbitStyle = orbit?.orbitStyle ?? 'none';

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.33;              // globe radius
  const ringR = size * 0.43;          // orbit radius
  const uid = Math.round(size);       // unique-ish suffix for gradient ids

  // Recentre the globe on the equipped emblem's country so the monument stands
  // on its real location ("on Earth"). With no emblem, the globe slowly spins
  // when animating (a planet that can move, moves).
  const emblemCoord = emblem && emblem.id !== 'emblem_none' ? EMBLEM_COORD[emblem.id] : undefined;
  const spinLon = animate && !emblemCoord ? (t * GLOBE_DPS) % 360 : 0;
  const viewLon = (emblemCoord ? emblemCoord[0] : VIEW[0]) + spinLon;
  const viewLat = emblemCoord ? emblemCoord[1] : VIEW[1];

  // ── Globe land geometry (memoised per style + size + view) ──
  const { fills, shadows, highlights } = useMemo(() => {
    const cLon = viewLon, cLat = viewLat;
    const ofs = Math.max(1, size * 0.02);
    const f: string[] = [], s: string[] = [], h: string[] = [];
    for (const ring of WORLD_POLYS) {
      const fp = ringToPath(ring, cLon, cLat, r, cx, cy);
      if (fp.length < 4) continue;
      f.push(fp);
      s.push(ringToPath(ring, cLon, cLat, r, cx, cy, ofs, ofs));
      h.push(ringToPath(ring, cLon, cLat, r, cx, cy, -ofs * 0.65, -ofs * 0.65));
    }
    return { fills: f, shadows: s, highlights: h };
  }, [r, cx, cy, size, viewLon, viewLat]);

  const gratLines = useMemo(() => {
    const cLon = viewLon, cLat = viewLat;
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
  }, [r, cx, cy, viewLon, viewLat]);

  // City-light dots (projected) for the "night" globe.
  const cityDots = useMemo(() => {
    if (!gs.night) return [] as { x: number; y: number }[];
    const cLon = viewLon, cLat = viewLat;
    const λ0 = (cLon * Math.PI) / 180, φ0 = (cLat * Math.PI) / 180;
    const out: { x: number; y: number }[] = [];
    for (const [lon, lat] of CITY_LIGHTS) {
      const λ = (lon * Math.PI) / 180, φ = (lat * Math.PI) / 180;
      const cosc = Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * Math.cos(λ - λ0);
      if (cosc < 0) continue;
      const x = cx + r * Math.cos(φ) * Math.sin(λ - λ0);
      const y = cy - r * (Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * Math.cos(φ) * Math.cos(λ - λ0));
      out.push({ x, y });
    }
    return out;
  }, [gs.night, r, cx, cy, viewLon, viewLat]);

  // ── Cosmos decoration (stars / bands / streaks) ──
  const stars = useMemo(() => {
    const rng = makeRng(uid * 97 + cosmosStyle.length);
    const want = cosmosStyle === 'gradient' ? 0
      : cosmosStyle === 'milkyway' ? 70
      : 46;
    const out: { x: number; y: number; rad: number; o: number }[] = [];
    for (let i = 0; i < want; i++) {
      out.push({
        x: rng() * size,
        y: rng() * size,
        rad: 0.5 + rng() * (size * 0.006),
        o: 0.35 + rng() * 0.6,
      });
    }
    return out;
  }, [uid, cosmosStyle, size]);

  const meteors = useMemo(() => {
    if (cosmosStyle !== 'meteors') return [] as { x: number; y: number; len: number }[];
    const rng = makeRng(uid * 31 + 7);
    return Array.from({ length: 4 }, () => ({
      x: rng() * size * 0.9,
      y: rng() * size * 0.6,
      len: size * (0.12 + rng() * 0.12),
    }));
  }, [cosmosStyle, uid, size]);

  // ── Cosmos gradient stops ──
  const cosmosStops = (() => {
    switch (cosmosStyle) {
      case 'gradient': return [shade(cosmosTint, 0.18), shade(cosmosTint, -0.25)];
      case 'stars': return ['#0a1230', '#05060f'];
      case 'sunrise': return ['#f7a85a', '#3a1a52'];
      case 'aurora': return ['#06243a', '#02101e'];
      case 'milkyway': return ['#191033', '#06040f'];
      case 'nebula': return ['#1a0a2a', '#06040f'];
      case 'meteors': return ['#0a1030', '#04060f'];
      default: return ['#0b1230', '#05060f'];
    }
  })();

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={`cos_${uid}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={cosmosStops[0]} />
            <Stop offset="100%" stopColor={cosmosStops[1]} />
          </LinearGradient>
          <RadialGradient id={`oce_${uid}`} cx="36%" cy="30%" r="72%">
            <Stop offset="0%" stopColor={gs.ocean[0]} />
            <Stop offset="42%" stopColor={gs.ocean[1]} />
            <Stop offset="100%" stopColor={gs.ocean[2]} />
          </RadialGradient>
          <RadialGradient id={`neb_${uid}`} cx="60%" cy="40%" r="55%">
            <Stop offset="0%" stopColor="#c63aa6" stopOpacity="0.7" />
            <Stop offset="100%" stopColor="#c63aa6" stopOpacity="0" />
          </RadialGradient>
          <ClipPath id={`clip_${uid}`}>
            <Circle cx={cx} cy={cy} r={r} />
          </ClipPath>
        </Defs>

        {/* ── Cosmos backdrop ── */}
        <Rect x={0} y={0} width={size} height={size} fill={`url(#cos_${uid})`} />

        {cosmosStyle === 'nebula' && (
          <>
            <Circle cx={size * 0.62} cy={size * 0.4} r={size * 0.4} fill={`url(#neb_${uid})`} />
            <Circle cx={size * 0.3} cy={size * 0.66} r={size * 0.34} fill="#2f7fd0" fillOpacity={0.28} />
          </>
        )}
        {cosmosStyle === 'aurora' && (
          <>
            <Path d={`M0,${size * 0.32} Q${size * 0.5},${size * 0.18} ${size},${size * 0.34} L${size},${size * 0.5} Q${size * 0.5},${size * 0.36} 0,${size * 0.5} Z`} fill="#3fe0a0" fillOpacity={0.22} />
            <Path d={`M0,${size * 0.46} Q${size * 0.5},${size * 0.32} ${size},${size * 0.48} L${size},${size * 0.62} Q${size * 0.5},${size * 0.5} 0,${size * 0.64} Z`} fill="#43c6e0" fillOpacity={0.18} />
          </>
        )}
        {cosmosStyle === 'milkyway' && (
          <Path d={`M${-size * 0.1},${size * 0.85} L${size * 0.85},${-size * 0.1} L${size},${size * 0.05} L${size * 0.05},${size} Z`} fill="#6a4ad0" fillOpacity={0.14} />
        )}
        {cosmosStyle === 'sunrise' && (
          <Circle cx={cx} cy={size * 1.02} r={size * 0.5} fill="#ffd27a" fillOpacity={0.55} />
        )}

        {stars.map((s, i) => (
          <Circle key={`st${i}`} cx={s.x} cy={s.y} r={s.rad} fill="#ffffff" fillOpacity={s.o} />
        ))}
        {meteors.map((m, i) => (
          <Line key={`mt${i}`} x1={m.x} y1={m.y} x2={m.x + m.len} y2={m.y + m.len * 0.55} stroke="#ffffff" strokeWidth={1.4} strokeOpacity={0.8} strokeLinecap="round" />
        ))}

        {/* ── Globe ── */}
        <Circle cx={cx} cy={cy} r={r} fill={`url(#oce_${uid})`} />
        <G clipPath={`url(#clip_${uid})`}>
          {/* graticule */}
          {gratLines.map((d, i) => (
            <Path key={`g${i}`} d={d} fill="none" stroke={gs.grat} strokeWidth={gs.wire ? 0.7 : 0.45} strokeOpacity={gs.wire ? 0.5 : 0.28} />
          ))}

          {/* land */}
          {gs.wire ? (
            fills.map((d, i) => (
              <Path key={`w${i}`} d={d} fill="none" stroke={gs.stroke} strokeWidth={0.7} strokeOpacity={0.85} />
            ))
          ) : gs.political ? (
            fills.map((d, i) => (
              <Path key={`p${i}`} d={d} fill={POLITICAL_PALETTE[i % POLITICAL_PALETTE.length]} fillOpacity={0.95} stroke={gs.stroke} strokeWidth={0.4} strokeOpacity={0.8} />
            ))
          ) : (
            <>
              {gs.relief && shadows.map((d, i) => (
                <Path key={`s${i}`} d={d} fill={gs.stroke} fillOpacity={0.4} />
              ))}
              {fills.map((d, i) => (
                <Path key={`f${i}`} d={d} fill={gs.land} fillOpacity={gs.night ? 1 : 0.92} stroke={gs.stroke} strokeWidth={0.35} strokeOpacity={0.55} />
              ))}
              {gs.relief && highlights.map((d, i) => (
                <Path key={`h${i}`} d={d} fill="rgba(255,255,255,0.20)" />
              ))}
            </>
          )}

          {/* night-side city lights */}
          {cityDots.map((p, i) => (
            <Circle key={`c${i}`} cx={p.x} cy={p.y} r={Math.max(0.8, size * 0.012)} fill="#ffe7a0" fillOpacity={0.9} />
          ))}
        </G>

        {/* rim + specular highlight */}
        <Circle cx={cx} cy={cy} r={r} fill="none" stroke={shade(gs.ocean[0], 0.3)} strokeWidth={1.2} strokeOpacity={0.5} />
        <Circle cx={cx - r * 0.27} cy={cy - r * 0.3} r={r * 0.18} fill="white" fillOpacity={0.22} />

        {/* ── Emblem — a landmark planted on the globe at its real country ── */}
        {emblem && emblem.id !== 'emblem_none' && (
          <>
            <Ellipse cx={cx} cy={cy + r * 0.04} rx={r * 0.86 * 0.34} ry={r * 0.86 * 0.075} fill="#00040a" opacity={0.32} />
            <EmblemGlyph id={emblem.id} bx={cx} by={cy + r * 0.04} h={r * 0.86} />
          </>
        )}

        {/* ── Orbit ring ── */}
        {orbitStyle === 'meridian' && (
          <>
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#cd7f32" strokeWidth={size * 0.018} strokeOpacity={0.9} />
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#7a4a18" strokeWidth={size * 0.006} strokeOpacity={0.6} />
          </>
        )}
        {orbitStyle === 'graticule' && (
          <>
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#c8d0d8" strokeWidth={size * 0.012} />
            <Circle cx={cx} cy={cy} r={ringR * 0.92} fill="none" stroke="#c8d0d8" strokeWidth={0.8} strokeOpacity={0.5} strokeDasharray={`${size * 0.02},${size * 0.02}`} />
          </>
        )}
        {orbitStyle === 'compass' && (
          <>
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#ffd700" strokeWidth={size * 0.014} />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
              const a = (deg * Math.PI) / 180;
              const inner = deg % 90 === 0 ? ringR - size * 0.06 : ringR - size * 0.03;
              return (
                <Line
                  key={`ct${deg}`}
                  x1={cx + Math.cos(a) * inner} y1={cy + Math.sin(a) * inner}
                  x2={cx + Math.cos(a) * (ringR + size * 0.02)} y2={cy + Math.sin(a) * (ringR + size * 0.02)}
                  stroke="#ffd700" strokeWidth={deg % 90 === 0 ? 2 : 1} strokeOpacity={0.95}
                />
              );
            })}
          </>
        )}
        {orbitStyle === 'neon' && (
          <>
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#80f0ff" strokeWidth={size * 0.03} strokeOpacity={0.25} />
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#aef8ff" strokeWidth={size * 0.012} strokeOpacity={0.95} />
          </>
        )}
        {orbitStyle === 'asteroids' && (
          <>
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#6a5e44" strokeWidth={1} strokeOpacity={0.4} />
            {Array.from({ length: 22 }).map((_, i) => {
              const rng = makeRng(uid * 7 + i * 13);
              const a = (i / 22) * Math.PI * 2 + rng() * 0.2;
              const rr = ringR + (rng() - 0.5) * size * 0.05;
              return (
                <Circle key={`as${i}`} cx={cx + Math.cos(a) * rr} cy={cy + Math.sin(a) * rr} r={size * (0.008 + rng() * 0.014)} fill="#9a8a6a" fillOpacity={0.9} />
              );
            })}
          </>
        )}

        {/* ── Satellite — an SVG icon travelling the orbit, oriented to motion ── */}
        {satellite && satellite.id !== 'sat_none' && (() => {
          const ang = SAT_BASE_ANGLE + (animate ? t * SAT_SPEED : 0);
          const px = cx + Math.cos(ang) * ringR;
          const py = cy + Math.sin(ang) * ringR;
          const rot = satelliteOrient(satellite.id, (ang * 180) / Math.PI);
          return (
            <G rotation={rot} originX={px} originY={py}>
              <SatelliteGlyph id={satellite.id} cx={px} cy={py} s={size * 0.2 * satelliteScale(satellite.id)} />
            </G>
          );
        })()}
      </Svg>
    </View>
  );
}

export const WorldAvatar = React.memo(WorldAvatarBase);
export default WorldAvatar;
