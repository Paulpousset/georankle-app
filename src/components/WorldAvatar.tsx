/**
 * <WorldAvatar> — renders the cosmetic "World" identity entirely in SVG/Text:
 * a procedural globe (paramaterised by the equipped globe style) sitting on a
 * cosmos backdrop, ringed by an orbit, with a landmark emblem and an orbiting
 * satellite glyph. No 3D, no WebView, no CDN — replaces the old <Avatar3D>.
 *
 * "Boutique 2.0" upgrade: every globe gets an atmosphere halo, a day/night
 * terminator and cloud banks (per-style flags); 8 new globe styles, 6 new
 * cosmos backdrops and 6 new orbit rings — including tilted Saturn-like rings
 * drawn in two passes (behind then in front of the globe). react-native-svg
 * has no SMIL <animate>, so pulses/blinks ride the existing rAF clock `t`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, {
  Rect, Circle, Ellipse, Path, Line, Polygon, Defs, LinearGradient, RadialGradient, Stop, ClipPath, G,
  Text as SvgText,
} from 'react-native-svg';

import type { AvatarConfig } from '../types';
import { getPart } from '../data/cosmetics';
import { WORLD_POLYS } from '../data/worldPolys';
import { ringToPath, graticule, project } from '../lib/globeProjection';
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
  /** Dashed wireframe strokes (blueprint). */
  dash?: boolean;
  /** Random craters + polar cap instead of Earth landmasses (mars). */
  craters?: boolean;
  /** Glowing magma cracks + hot coastlines (lava). */
  lava?: boolean;
  /** Network nodes on the wireframe (cyber). */
  cyber?: boolean;
  /** Solar-corona rays behind a near-black disc (eclipse). */
  corona?: boolean;
  /** Glowing plankton dots in the ocean + phosphorescent coasts (biolum). */
  biolum?: boolean;
  /** Atmosphere halo colour — undefined disables the halo for this style. */
  atmo?: string;
  /** Day/night terminator shading. */
  terminator?: boolean;
  /** Semi-transparent cloud banks. */
  clouds?: boolean;
  /** Hologram scanlines + cyan outer glow. */
  scan?: boolean;
  /** Star-shaped glints on the surface (gold). */
  sparkle?: boolean;
  /** Story-exclusive: glowing tectonic rifts across the crust (fractured). */
  rift?: boolean;
  riftColor?: string;
  /** Story-exclusive: a spiral-galaxy of stars ON the globe (galaxy world). */
  galaxy?: boolean;
  galaxyColor?: string;
  /** Story-exclusive: a golden crown resting on the globe (crowned world). */
  crown?: boolean;
}

const GLOBE_STYLES: Record<string, GlobeStyle> = {
  classic:   { ocean: ['#5cb3ec', '#1f6fae', '#0a2f52'], land: '#6e9e52', stroke: '#2c4a2c', grat: '#0a2f52', atmo: '#6fc0ff', terminator: true, clouds: true },
  satellite: { ocean: ['#2a78b0', '#0d3a66', '#04203c'], land: '#2f6e3a', stroke: '#143a1a', grat: '#04203c', atmo: '#6fc0ff', terminator: true, clouds: true },
  relief:    { ocean: ['#6ec0e0', '#2f7fae', '#123a52'], land: '#b89a5a', stroke: '#7a5a2a', grat: '#123a52', relief: true, atmo: '#6fc0ff', terminator: true, clouds: true },
  vintage:   { ocean: ['#ead6ab', '#cdb37e', '#9c7e4e'], land: '#c2a368', stroke: '#7a5a2a', grat: '#a8895a' },
  gold:      { ocean: ['#ffe7a4', '#e0a93a', '#8a5a14'], land: '#caa23a', stroke: '#7a5212', grat: '#8a5a14', atmo: '#ffd700', terminator: true, sparkle: true },
  gaia:      { ocean: ['#43d6c6', '#159a8a', '#0a4a4a'], land: '#4fc24a', stroke: '#1a6a2a', grat: '#0a4a4a', atmo: '#43d6c6', terminator: true, clouds: true },
  political: { ocean: ['#cfe4f2', '#9cc0e0', '#6f9fc4'], land: '#cccccc', stroke: '#ffffff', grat: '#9cc0e0', political: true },
  night:     { ocean: ['#0c1834', '#070d22', '#03060f'], land: '#13233f', stroke: '#1c3454', grat: '#0c1830', night: true, atmo: '#ffb45a' },
  hologram:  { ocean: ['#0c2c3c', '#06202e', '#03121c'], land: 'none', stroke: '#5ff0ff', grat: '#5ff0ff', wire: true, atmo: '#5ff0ff', scan: true },
  // ── Boutique 2.0 ──
  pastel:    { ocean: ['#cfe8e4', '#a8cfd8', '#7fa8bc'], land: '#f0c8d0', stroke: '#d898a8', grat: '#a8cfd8', atmo: '#f0c8d0', clouds: true },
  mars:      { ocean: ['#e8935a', '#b85a2e', '#6e2f14'], land: '#a04a24', stroke: '#7a3418', grat: '#6e2f14', craters: true, atmo: '#ff9a5a', terminator: true },
  ice:       { ocean: ['#bfe4f5', '#7fb8d8', '#4a86ac'], land: '#f2f8fd', stroke: '#a8c8dc', grat: '#7fb8d8', atmo: '#bfe4f5', terminator: true, clouds: true },
  blueprint: { ocean: ['#1d4d8f', '#16407c', '#0e2c58'], land: 'none', stroke: '#dce9fa', grat: '#dce9fa', wire: true, dash: true },
  lava:      { ocean: ['#3a1410', '#240a08', '#120404'], land: '#1c0e0a', stroke: '#ff6a2a', grat: '#3a1410', lava: true, atmo: '#ff6a2a' },
  cyber:     { ocean: ['#0a1420', '#060d18', '#03070f'], land: 'none', stroke: '#c04df0', grat: '#3af0a0', wire: true, cyber: true, atmo: '#c04df0', scan: true },
  eclipse:   { ocean: ['#0c0c14', '#060608', '#020203'], land: '#0a0a10', stroke: '#1a1a26', grat: '#0c0c14', corona: true },
  biolum:    { ocean: ['#04141c', '#020c14', '#01060a'], land: '#062018', stroke: '#2ff0c0', grat: '#04141c', biolum: true, atmo: '#2ff0c0' },
  // ── Mode Histoire : globes EXCLUSIFS à effet inédit ──
  st_fractured: { ocean: ['#243a5c', '#132038', '#070d1a'], land: '#16263f', stroke: '#ff7a3a', grat: '#1a2c48', rift: true, riftColor: '#ff8a3a', atmo: '#ff7a3a', terminator: true },
  st_galaxy:    { ocean: ['#241a52', '#140f2e', '#060418'], land: 'none', stroke: '#b8a0ff', grat: '#2a1f5a', wire: true, galaxy: true, galaxyColor: '#d8c8ff', atmo: '#9a7cff' },
  st_crowned:   { ocean: ['#ffe7a4', '#e0a93a', '#8a5a14'], land: '#caa23a', stroke: '#7a5212', grat: '#8a5a14', atmo: '#ffd700', terminator: true, sparkle: true, crown: true },
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
  /** Animate movable elements (satellite orbit, globe spin, pulses, blinks). */
  animate?: boolean;
  /**
   * Clip the whole avatar (cosmos backdrop, orbit, satellite) to a circle so it
   * fits a round frame edge-to-edge without relying on the parent's
   * overflow:hidden (which doesn't clip SVG reliably on web). Leave off for the
   * square preview tiles (shop / editor swatches, rounded-square profile card).
   */
  round?: boolean;
  /** Reserved — kept for API parity with the old <Avatar3D>. */
  interactive?: boolean;
  spin?: boolean;
}

function WorldAvatarBase({ config, size, style, animate = false, round = false }: WorldAvatarProps) {
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
    const out: { x: number; y: number }[] = [];
    for (const [lon, lat] of CITY_LIGHTS) {
      const [x, y, vis] = project(lon, lat, viewLon, viewLat, r, cx, cy);
      if (vis) out.push({ x, y });
    }
    return out;
  }, [gs.night, r, cx, cy, viewLon, viewLat]);

  // Mars craters — deterministic polar coords, projected each render is cheap.
  const craters = useMemo(() => {
    if (!gs.craters) return [] as { x: number; y: number; cr: number }[];
    const rng = makeRng(42);
    const out: { x: number; y: number; cr: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      const rad = Math.sqrt(rng()) * r * 0.85;
      out.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad, cr: r * (0.04 + rng() * 0.09) });
    }
    return out;
  }, [gs.craters, r, cx, cy]);

  // Lava cracks / cyber nodes / biolum plankton — deterministic decorations.
  const surfaceDeco = useMemo(() => {
    const cracks: string[] = [];
    const dots: { x: number; y: number; rad: number; o: number }[] = [];
    const rifts: string[] = [];
    const galaxyDots: { x: number; y: number; rad: number; o: number }[] = [];
    if (gs.rift) {
      // Jagged tectonic rifts radiating across the crust.
      const rng = makeRng(13);
      for (let i = 0; i < 5; i++) {
        const a = rng() * Math.PI * 2;
        let px = cx + Math.cos(a) * r * 0.2, py = cy + Math.sin(a) * r * 0.2;
        let d = `M${px.toFixed(1)},${py.toFixed(1)}`;
        const steps = 3 + Math.floor(rng() * 3);
        for (let k = 0; k < steps; k++) {
          px += Math.cos(a) * r * 0.28 + (rng() - 0.5) * r * 0.22;
          py += Math.sin(a) * r * 0.28 + (rng() - 0.5) * r * 0.22;
          d += ` L${px.toFixed(1)},${py.toFixed(1)}`;
        }
        rifts.push(d);
      }
    }
    if (gs.galaxy) {
      // A two-arm spiral of stars projected onto the disc.
      const rng = makeRng(31);
      for (let i = 0; i < 60; i++) {
        const t = i / 60;
        const ang = t * 7 + (i % 2 ? Math.PI : 0);
        const rad = t * r * 0.92 + (rng() - 0.5) * r * 0.06;
        galaxyDots.push({
          x: cx + Math.cos(ang) * rad,
          y: cy + Math.sin(ang) * rad * 0.92,
          rad: Math.max(0.6, size * 0.012 * (1 - t)),
          o: 0.4 + rng() * 0.5,
        });
      }
    }
    if (gs.lava) {
      const rng = makeRng(9);
      for (let i = 0; i < 7; i++) {
        const a = rng() * Math.PI * 2, rad = Math.sqrt(rng()) * r * 0.8;
        const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
        cracks.push(`M${px.toFixed(1)},${py.toFixed(1)} q${((rng() - 0.5) * r * 0.5).toFixed(1)},${((rng() - 0.5) * r * 0.3).toFixed(1)} ${((rng() - 0.5) * r * 0.8).toFixed(1)},${((rng() - 0.5) * r * 0.6).toFixed(1)}`);
      }
    }
    if (gs.cyber) {
      const rng = makeRng(5);
      for (let i = 0; i < 8; i++) {
        const a = rng() * Math.PI * 2, rad = Math.sqrt(rng()) * r * 0.85;
        dots.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad, rad: Math.max(1.2, size * 0.012), o: 1 });
      }
    }
    if (gs.biolum) {
      const rng = makeRng(21);
      for (let i = 0; i < 26; i++) {
        const a = rng() * Math.PI * 2, rad = Math.sqrt(rng()) * r * 0.94;
        dots.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad, rad: 0.6 + rng() * (size * 0.01), o: 0.25 + rng() * 0.5 });
      }
    }
    return { cracks, dots, rifts, galaxyDots };
  }, [gs.lava, gs.cyber, gs.biolum, gs.rift, gs.galaxy, r, cx, cy, size]);

  // Cloud banks (per-style flag) — deterministic ellipses over the globe.
  const clouds = useMemo(() => {
    if (!gs.clouds) return [] as { x: number; y: number; w: number; o: number; rot: number }[];
    const rng = makeRng(13);
    return Array.from({ length: 5 }, () => {
      const a = rng() * Math.PI * 2, rad = Math.sqrt(rng()) * r * 0.7;
      return {
        x: cx + Math.cos(a) * rad,
        y: cy + Math.sin(a) * rad,
        w: r * (0.22 + rng() * 0.3),
        o: 0.16 + rng() * 0.14,
        rot: rng() * 40 - 20,
      };
    });
  }, [gs.clouds, r, cx, cy]);

  // Gold sparkles — star glints on the surface.
  const sparkles = useMemo(() => {
    if (!gs.sparkle) return [] as { x: number; y: number; s: number }[];
    const rng = makeRng(3);
    return Array.from({ length: 4 }, () => {
      const a = rng() * Math.PI * 2, rad = Math.sqrt(rng()) * r * 0.8;
      return { x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad, s: r * (0.06 + rng() * 0.06) };
    });
  }, [gs.sparkle, r, cx, cy]);

  // Solar-corona rays (eclipse globe).
  const coronaRays = useMemo(() => {
    if (!gs.corona) return [] as { x1: number; y1: number; x2: number; y2: number }[];
    const rng = makeRng(7);
    return Array.from({ length: 10 }, () => {
      const a = rng() * Math.PI * 2, len = r * (1.2 + rng() * 0.5);
      return {
        x1: cx + Math.cos(a) * r * 1.02, y1: cy + Math.sin(a) * r * 1.02,
        x2: cx + Math.cos(a) * len, y2: cy + Math.sin(a) * len,
      };
    });
  }, [gs.corona, r, cx, cy]);

  // ── Cosmos decoration (stars / bands / streaks) ──
  const stars = useMemo(() => {
    const rng = makeRng(uid * 97 + cosmosStyle.length);
    const want = cosmosStyle === 'gradient' ? 0
      : cosmosStyle === 'milkyway' ? 70
      : cosmosStyle === 'galaxy' ? 55
      : cosmosStyle === 'constellation' ? 30
      : cosmosStyle === 'goldrain' ? 30
      : cosmosStyle === 'blackhole' ? 40
      : cosmosStyle === 'solareclipse' ? 26
      : cosmosStyle === 'supernova' ? 36
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

  // Meteor streaks — v2: tapered gradient trails with a bright head.
  const meteors = useMemo(() => {
    if (cosmosStyle !== 'meteors') return [] as { x: number; y: number; len: number }[];
    const rng = makeRng(uid * 31 + 7);
    return Array.from({ length: 5 }, () => ({
      x: rng() * size * 0.85,
      y: rng() * size * 0.55,
      len: size * (0.16 + rng() * 0.16),
    }));
  }, [cosmosStyle, uid, size]);

  // Aurora v2 — vertical light curtains (position, height, palette index).
  const auroraCurtains = useMemo(() => {
    if (cosmosStyle !== 'aurora') return [] as { x: number; h: number; ci: number }[];
    const rng = makeRng(uid * 11 + 3);
    return Array.from({ length: 7 }, (_, i) => ({
      x: size * (0.08 + i * 0.13),
      h: size * (0.28 + rng() * 0.22),
      ci: i % 3,
    }));
  }, [cosmosStyle, uid, size]);

  // Constellation figures — connected star points.
  const constellation = useMemo(() => {
    if (cosmosStyle !== 'constellation') return [] as { x: number; y: number }[];
    const rng = makeRng(uid * 53 + 17);
    return Array.from({ length: 9 }, () => ({ x: rng() * size, y: rng() * size * 0.9 }));
  }, [cosmosStyle, uid, size]);

  // Golden 8-point stars.
  const goldStars = useMemo(() => {
    if (cosmosStyle !== 'goldrain') return [] as { x: number; y: number; s: number; o: number }[];
    const rng = makeRng(uid * 41 + 5);
    return Array.from({ length: 9 }, () => ({
      x: rng() * size, y: rng() * size, s: 1.5 + rng() * (size * 0.02), o: 0.5 + rng() * 0.5,
    }));
  }, [cosmosStyle, uid, size]);

  // Galaxy spiral arms (logarithmic) — anchored top-right, clear of the globe.
  const galaxyArms = useMemo(() => {
    if (cosmosStyle !== 'galaxy') return [] as string[];
    const gcx = size * 0.78, gcy = size * 0.2;
    const arms: string[] = [];
    for (let arm = 0; arm < 2; arm++) {
      let d = `M${gcx.toFixed(1)},${gcy.toFixed(1)}`;
      for (let tt = 0; tt < 3.6; tt += 0.15) {
        const a = tt + arm * Math.PI, rad = size * 0.045 * Math.exp(tt * 0.42);
        d += ` L${(gcx + Math.cos(a) * rad).toFixed(1)},${(gcy + Math.sin(a) * rad * 0.55).toFixed(1)}`;
      }
      arms.push(d);
    }
    return arms;
  }, [cosmosStyle, size]);

  // Fireflies orbit — blink phases (opacity animated on the rAF clock).
  const fireflies = useMemo(() => {
    if (orbitStyle !== 'fireflies') return [] as { a: number; rad: number; speed: number; phase: number }[];
    return Array.from({ length: 10 }, (_, i) => {
      const rng = makeRng(i * 29 + 11);
      return {
        a: (i / 10) * Math.PI * 2 + rng() * 0.4,
        rad: ringR + (rng() - 0.5) * size * 0.06,
        speed: 2 + rng() * 3,
        phase: rng() * Math.PI * 2,
      };
    });
  }, [orbitStyle, ringR, size]);

  // Ice-ring crystals.
  const iceCrystals = useMemo(() => {
    if (orbitStyle !== 'iceRing') return [] as { x: number; y: number; s: number; rot: number }[];
    return Array.from({ length: 12 }, (_, i) => {
      const rng = makeRng(i * 7 + 5);
      const a = (i / 12) * Math.PI * 2 + rng() * 0.2;
      return {
        x: cx + Math.cos(a) * ringR, y: cy + Math.sin(a) * ringR,
        s: size * (0.014 + rng() * 0.016), rot: (a * 180) / Math.PI,
      };
    });
  }, [orbitStyle, ringR, cx, cy, size]);

  // Fire-ring flame licks.
  const flames = useMemo(() => {
    if (orbitStyle !== 'fire') return [] as string[];
    return Array.from({ length: 16 }, (_, i) => {
      const rng = makeRng(i * 17 + 3);
      const a = (i / 16) * Math.PI * 2, fl = size * (0.03 + rng() * 0.045);
      const px = cx + Math.cos(a) * ringR, py = cy + Math.sin(a) * ringR;
      return `M${px.toFixed(1)},${py.toFixed(1)} q${(Math.cos(a) * fl * 0.6 - Math.sin(a) * fl * 0.4).toFixed(1)},${(Math.sin(a) * fl * 0.6 + Math.cos(a) * fl * 0.4).toFixed(1)} ${(Math.cos(a) * fl).toFixed(1)},${(Math.sin(a) * fl).toFixed(1)}`;
    });
  }, [orbitStyle, ringR, cx, cy, size]);

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
      case 'galaxy': return ['#140f2e', '#040309'];
      case 'blackhole': return ['#0c0a14', '#020203'];
      case 'constellation': return ['#0b1430', '#040814'];
      case 'solareclipse': return ['#241436', '#050208'];
      case 'supernova': return ['#2a1030', '#070310'];
      case 'goldrain': return ['#141024', '#060410'];
      case 'st_aurorastorm': return ['#062a3a', '#02101e'];
      case 'st_embersky': return ['#1a0a08', '#050202'];
      default: return ['#0b1230', '#05060f'];
    }
  })();

  // Pulse in [0,1] for glow animations (neon ring). Static mid-value when idle.
  const pulse = animate ? 0.5 + 0.5 * Math.sin(t * Math.PI) : 0.5;

  const AURORA_COLORS = ['#3fe0a0', '#43c6e0', '#9a6af0'];
  const AURORA_STORM_COLORS = ['#2ff0a0', '#8f7cff', '#43c6e0'];

  // Story-exclusive cosmos: fixed decorative sets (no memo needed).
  const stormBands = [0.30, 0.44, 0.58].map((y, i) => ({
    y: size * y,
    color: AURORA_STORM_COLORS[i % AURORA_STORM_COLORS.length],
  }));
  const emberSpecks = Array.from({ length: 22 }, (_, i) => {
    const rng = makeRng(i * 41 + 7);
    return { x: rng() * size, y: size * (0.4 + rng() * 0.6), r: 0.6 + rng() * (size * 0.012), o: 0.35 + rng() * 0.5 };
  });

  // Tilted Saturn ring arcs: back (upper) half drawn behind the globe, front
  // (lower) half above it. rotation applied via <G rotation>.
  const saturnArc = (back: boolean, rx: number, ry: number) =>
    back
      ? `M${cx - rx},${cy} A${rx},${ry} 0 0 1 ${cx + rx},${cy}`
      : `M${cx - rx},${cy} A${rx},${ry} 0 0 0 ${cx + rx},${cy}`;

  const renderSaturn = (back: boolean) => {
    const rx = ringR * 1.08, ry = ringR * 0.34;
    const bands: [number, string, number][] = [
      [size * 0.055, '#d8b878', 0.5],
      [size * 0.028, '#f0d8a8', 0.85],
      [size * 0.012, '#a8865a', 0.9],
    ];
    return (
      <G rotation={-16} originX={cx} originY={cy}>
        {bands.map(([w, color, op], i) => (
          <Path key={`sat${back ? 'b' : 'f'}${i}`} d={saturnArc(back, rx, ry)} fill="none" stroke={color} strokeWidth={w} strokeOpacity={op} />
        ))}
      </G>
    );
  };

  const renderDouble = (back: boolean) => {
    // Two crossed elliptical orbits; the upper halves sit behind the globe.
    const halves = back ? { y: 0, h: cy } : { y: cy, h: size - cy };
    return (
      <G clipPath={`url(#half_${back ? 'top' : 'bot'}_${uid})`}>
        <Ellipse cx={cx} cy={cy} rx={ringR} ry={ringR * 0.42} fill="none" stroke="#c8d0d8" strokeWidth={size * 0.011} strokeOpacity={back ? 0.4 : 1} rotation={28} originX={cx} originY={cy} />
        <Ellipse cx={cx} cy={cy} rx={ringR} ry={ringR * 0.42} fill="none" stroke="#8fb8ff" strokeWidth={size * 0.011} strokeOpacity={back ? 0.4 : 1} rotation={-28} originX={cx} originY={cy} />
      </G>
    );
  };

  /** Orbit rings that need a "behind the globe" pass (saturn, double). */
  const renderOrbitBack = () => {
    if (orbitStyle === 'saturn') return renderSaturn(true);
    if (orbitStyle === 'double') return renderDouble(true);
    return null;
  };

  const renderOrbitFront = () => {
    switch (orbitStyle) {
      case 'meridian':
        return (
          <>
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#cd7f32" strokeWidth={size * 0.018} strokeOpacity={0.9} />
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#7a4a18" strokeWidth={size * 0.006} strokeOpacity={0.6} />
          </>
        );
      case 'graticule':
        return (
          <>
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#c8d0d8" strokeWidth={size * 0.012} />
            <Circle cx={cx} cy={cy} r={ringR * 0.92} fill="none" stroke="#c8d0d8" strokeWidth={0.8} strokeOpacity={0.5} strokeDasharray={`${size * 0.02},${size * 0.02}`} />
          </>
        );
      case 'compass':
        // v2: diagonal ticks + N/E/S/O cardinal medallions.
        return (
          <>
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#ffd700" strokeWidth={size * 0.014} />
            {[45, 135, 225, 315].map((deg) => {
              const a = (deg * Math.PI) / 180;
              return (
                <Line
                  key={`ct${deg}`}
                  x1={cx + Math.cos(a) * (ringR - size * 0.03)} y1={cy + Math.sin(a) * (ringR - size * 0.03)}
                  x2={cx + Math.cos(a) * (ringR + size * 0.02)} y2={cy + Math.sin(a) * (ringR + size * 0.02)}
                  stroke="#ffd700" strokeWidth={1} strokeOpacity={0.95}
                />
              );
            })}
            {([['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['O', -1, 0]] as [string, number, number][]).map(([L, dx, dy]) => (
              <G key={`card${L}`}>
                <Circle cx={cx + dx * ringR} cy={cy + dy * ringR} r={size * 0.062} fill="#0a0e1a" stroke="#ffd700" strokeWidth={1.4} />
                <SvgText
                  x={cx + dx * ringR}
                  y={cy + dy * ringR + size * 0.028}
                  textAnchor="middle"
                  fontSize={size * 0.075}
                  fontWeight="bold"
                  fill="#ffd700"
                >
                  {L}
                </SvgText>
              </G>
            ))}
          </>
        );
      case 'neon':
        // v2: triple halo with a slow breathing pulse on the outer glow.
        return (
          <>
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#80f0ff" strokeWidth={size * 0.05} strokeOpacity={0.1 + 0.16 * pulse} />
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#80f0ff" strokeWidth={size * 0.022} strokeOpacity={0.4} />
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#eafcff" strokeWidth={size * 0.01} strokeOpacity={1} />
          </>
        );
      case 'asteroids':
        return (
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
        );
      case 'saturn':
        return renderSaturn(false);
      case 'double':
        return renderDouble(false);
      case 'iceRing':
        return (
          <>
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#bfe4f5" strokeWidth={size * 0.012} strokeOpacity={0.7} />
            {iceCrystals.map((c2, i) => (
              <Polygon
                key={`ic${i}`}
                points={`${c2.x},${c2.y - c2.s} ${c2.x + c2.s * 0.7},${c2.y} ${c2.x},${c2.y + c2.s} ${c2.x - c2.s * 0.7},${c2.y}`}
                fill="#eaf8ff" fillOpacity={0.9} stroke="#8fc8e8" strokeWidth={0.6}
                rotation={c2.rot} originX={c2.x} originY={c2.y}
              />
            ))}
          </>
        );
      case 'fireflies':
        return (
          <>
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#8a9a4a" strokeWidth={0.8} strokeOpacity={0.3} strokeDasharray={`${size * 0.015},${size * 0.03}`} />
            {fireflies.map((f, i) => {
              const blink = animate ? 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(t * f.speed + f.phase)) : 0.8;
              return (
                <Circle key={`ff${i}`} cx={cx + Math.cos(f.a) * f.rad} cy={cy + Math.sin(f.a) * f.rad} r={size * 0.012} fill="#d8ff5a" fillOpacity={blink} />
              );
            })}
          </>
        );
      case 'rainbow':
        return (
          <>
            {['#ff5a5a', '#ffb02e', '#ffe95a', '#3fae5a', '#4f8ef7', '#a458ff'].map((color, i) => {
              const r2 = ringR + size * 0.026 - i * size * 0.0105;
              return (
                <Path
                  key={`rb${i}`}
                  d={`M${cx - r2},${cy} A${r2},${r2} 0 1 0 ${(cx + r2 * Math.cos(-0.6)).toFixed(1)},${(cy + r2 * Math.sin(-0.6)).toFixed(1)}`}
                  fill="none" stroke={color} strokeWidth={size * 0.011} strokeOpacity={0.85} strokeLinecap="round"
                />
              );
            })}
          </>
        );
      case 'fire':
        return (
          <>
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#ff6a2a" strokeWidth={size * 0.026} strokeOpacity={0.85} />
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#ffd27a" strokeWidth={size * 0.01} strokeOpacity={0.95} />
            {flames.map((d, i) => (
              <Path key={`fl${i}`} d={d} fill="none" stroke="#ff9a3a" strokeWidth={size * 0.014} strokeOpacity={0.8} strokeLinecap="round" />
            ))}
          </>
        );
      case 'st_laurel': {
        // Story-exclusive: two laurel branches curving into a wreath.
        const leaf = (base: number, dir: number) =>
          Array.from({ length: 7 }).map((_, i) => {
            const a = base + dir * (0.18 + i * 0.16);
            const lx = cx + Math.cos(a) * ringR;
            const ly = cy + Math.sin(a) * ringR;
            const rot = ((a * 180) / Math.PI) + (dir > 0 ? 60 : 120);
            return (
              <Ellipse
                key={`lf${dir}${i}`}
                cx={lx} cy={ly} rx={size * 0.05} ry={size * 0.02}
                fill="#4fae5a" stroke="#2f7a3a" strokeWidth={0.5}
                rotation={rot} originX={lx} originY={ly}
              />
            );
          });
        return (
          <>
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#2f7a3a" strokeWidth={size * 0.012} strokeOpacity={0.5} />
            {leaf(-Math.PI / 2, -1)}
            {leaf(-Math.PI / 2, 1)}
            <Circle cx={cx} cy={cy + ringR} r={size * 0.02} fill="#ffcf4a" />
          </>
        );
      }
      case 'st_compass': {
        // Story-exclusive: a golden cardinal ring with N·E·S·O gems.
        const card: [string, number, number][] = [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['O', -1, 0]];
        return (
          <>
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#e0a93a" strokeWidth={size * 0.02} strokeOpacity={0.9} />
            <Circle cx={cx} cy={cy} r={ringR * 0.9} fill="none" stroke="#e0a93a" strokeWidth={size * 0.006} strokeOpacity={0.5} strokeDasharray={`${size * 0.015},${size * 0.02}`} />
            {card.map(([L, dx, dy], i) => (
              <G key={`cd${i}`}>
                <Circle cx={cx + dx * ringR} cy={cy + dy * ringR} r={size * 0.055} fill="#12203a" stroke="#ffd700" strokeWidth={1.2} />
                <SvgText x={cx + dx * ringR} y={cy + dy * ringR + size * 0.025} textAnchor="middle" fontSize={size * 0.07} fontWeight="bold" fill="#ffd700">
                  {L}
                </SvgText>
              </G>
            ))}
          </>
        );
      }
      default:
        return null;
    }
  };

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
            <Stop offset="0%" stopColor="#ff5ac8" stopOpacity="0.75" />
            <Stop offset="60%" stopColor="#c63aa6" stopOpacity="0.3" />
            <Stop offset="100%" stopColor="#c63aa6" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={`neb2_${uid}`} cx="30%" cy="68%" r="50%">
            <Stop offset="0%" stopColor="#4fa0ff" stopOpacity="0.6" />
            <Stop offset="100%" stopColor="#2f7fd0" stopOpacity="0" />
          </RadialGradient>
          {gs.atmo && (
            <RadialGradient id={`atm_${uid}`} cx="50%" cy="50%" r="50%">
              <Stop offset="62%" stopColor={gs.atmo} stopOpacity="0" />
              <Stop offset="82%" stopColor={gs.atmo} stopOpacity="0.55" />
              <Stop offset="100%" stopColor={gs.atmo} stopOpacity="0" />
            </RadialGradient>
          )}
          {gs.terminator && (
            <RadialGradient id={`ter_${uid}`} cx="32%" cy="28%" r="85%">
              <Stop offset="55%" stopColor="#000000" stopOpacity="0" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0.62" />
            </RadialGradient>
          )}
          {gs.corona && (
            <RadialGradient id={`cor_${uid}`} cx="50%" cy="50%" r="50%">
              <Stop offset="58%" stopColor="#fff2c8" stopOpacity="0" />
              <Stop offset="72%" stopColor="#ffe9a8" stopOpacity="0.9" />
              <Stop offset="100%" stopColor="#ff9a3a" stopOpacity="0" />
            </RadialGradient>
          )}
          {cosmosStyle === 'solareclipse' && (
            <RadialGradient id={`sec_${uid}`} cx="50%" cy="50%" r="50%">
              <Stop offset="55%" stopColor="#ffe9a8" stopOpacity="0" />
              <Stop offset="70%" stopColor="#ffe9a8" stopOpacity="0.85" />
              <Stop offset="100%" stopColor="#ff9a3a" stopOpacity="0" />
            </RadialGradient>
          )}
          {cosmosStyle === 'supernova' && (
            <RadialGradient id={`sn_${uid}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
              <Stop offset="30%" stopColor="#ffd27a" stopOpacity="0.8" />
              <Stop offset="70%" stopColor="#ff5a8a" stopOpacity="0.3" />
              <Stop offset="100%" stopColor="#ff5a8a" stopOpacity="0" />
            </RadialGradient>
          )}
          <ClipPath id={`clip_${uid}`}>
            <Circle cx={cx} cy={cy} r={r} />
          </ClipPath>
          {round && (
            <ClipPath id={`round_${uid}`}>
              <Circle cx={cx} cy={cy} r={size / 2} />
            </ClipPath>
          )}
          <ClipPath id={`half_top_${uid}`}>
            <Rect x={0} y={0} width={size} height={cy} />
          </ClipPath>
          <ClipPath id={`half_bot_${uid}`}>
            <Rect x={0} y={cy} width={size} height={size - cy} />
          </ClipPath>
        </Defs>

        <G clipPath={round ? `url(#round_${uid})` : undefined}>
        {/* ── Cosmos backdrop ── */}
        <Rect x={0} y={0} width={size} height={size} fill={`url(#cos_${uid})`} />

        {cosmosStyle === 'nebula' && (
          <>
            {/* v2: richer multi-colour swirls + a bright core */}
            <Circle cx={size * 0.62} cy={size * 0.38} r={size * 0.44} fill={`url(#neb_${uid})`} />
            <Circle cx={size * 0.3} cy={size * 0.68} r={size * 0.4} fill={`url(#neb2_${uid})`} />
            <Circle cx={size * 0.55} cy={size * 0.45} r={size * 0.05} fill="#ffffff" fillOpacity={0.9} />
            <Circle cx={size * 0.55} cy={size * 0.45} r={size * 0.12} fill="#ffd8f0" fillOpacity={0.3} />
          </>
        )}
        {cosmosStyle === 'aurora' && (
          <>
            {/* v2: vertical light curtains, multi-hue */}
            {auroraCurtains.map((cu, i) => (
              <Path
                key={`au${i}`}
                d={`M${cu.x},${size * 0.06} q${size * 0.04},${cu.h * 0.5} 0,${cu.h} l${size * 0.05},0 q${size * 0.04},-${cu.h * 0.5} 0,-${cu.h} Z`}
                fill={AURORA_COLORS[cu.ci]}
                fillOpacity={0.4}
              />
            ))}
          </>
        )}
        {cosmosStyle === 'milkyway' && (
          <Path d={`M${-size * 0.1},${size * 0.85} L${size * 0.85},${-size * 0.1} L${size},${size * 0.05} L${size * 0.05},${size} Z`} fill="#6a4ad0" fillOpacity={0.14} />
        )}
        {cosmosStyle === 'sunrise' && (
          <Circle cx={cx} cy={size * 1.02} r={size * 0.5} fill="#ffd27a" fillOpacity={0.55} />
        )}
        {cosmosStyle === 'st_aurorastorm' && (
          <>
            {stormBands.map((bd, i) => (
              <Path
                key={`as${i}`}
                d={`M${-size * 0.1},${bd.y} q${size * 0.3},${-size * 0.14} ${size * 0.55},0 q${size * 0.3},${size * 0.14} ${size * 0.6},0 l0,${size * 0.09} q${-size * 0.3},${size * 0.14} ${-size * 0.6},0 q${-size * 0.25},${-size * 0.14} ${-size * 0.55},0 Z`}
                fill={bd.color}
                fillOpacity={0.4 + 0.18 * pulse}
              />
            ))}
          </>
        )}
        {cosmosStyle === 'st_embersky' && (
          <>
            <Ellipse cx={cx} cy={size * 1.05} rx={size * 0.7} ry={size * 0.4} fill="#c0341a" fillOpacity={0.5} />
            <Ellipse cx={cx} cy={size * 1.08} rx={size * 0.42} ry={size * 0.26} fill="#ff8a3a" fillOpacity={0.5} />
            {emberSpecks.map((e, i) => (
              <Circle key={`es${i}`} cx={e.x} cy={e.y} r={e.r} fill="#ff9a3a" fillOpacity={e.o} />
            ))}
          </>
        )}
        {cosmosStyle === 'galaxy' && (
          <>
            {galaxyArms.map((d, i) => (
              <Path key={`ga${i}`} d={d} fill="none" stroke="#b8a0ff" strokeWidth={size * 0.035} strokeOpacity={0.3} strokeLinecap="round" />
            ))}
            <Circle cx={size * 0.78} cy={size * 0.2} r={size * 0.06} fill="#fff0d8" fillOpacity={0.95} />
            <Circle cx={size * 0.78} cy={size * 0.2} r={size * 0.13} fill="#ffd9a0" fillOpacity={0.3} />
          </>
        )}
        {cosmosStyle === 'blackhole' && (
          <>
            <Ellipse cx={size * 0.74} cy={size * 0.2} rx={size * 0.24} ry={size * 0.07} fill="none" stroke="#ff9a3a" strokeWidth={size * 0.022} strokeOpacity={0.85} />
            <Ellipse cx={size * 0.74} cy={size * 0.2} rx={size * 0.30} ry={size * 0.10} fill="none" stroke="#ffd27a" strokeWidth={size * 0.01} strokeOpacity={0.5} />
            <Circle cx={size * 0.74} cy={size * 0.2} r={size * 0.11} fill="#000000" />
            <Circle cx={size * 0.74} cy={size * 0.2} r={size * 0.115} fill="none" stroke="#ffb45a" strokeWidth={1.6} strokeOpacity={0.9} />
          </>
        )}
        {cosmosStyle === 'constellation' && (
          <>
            {constellation.slice(0, -1).map((p, i) => (
              <Line key={`cl${i}`} x1={p.x} y1={p.y} x2={constellation[i + 1].x} y2={constellation[i + 1].y} stroke="#8fb8ff" strokeWidth={0.7} strokeOpacity={0.5} />
            ))}
            {constellation.map((p, i) => (
              <G key={`cs${i}`}>
                <Circle cx={p.x} cy={p.y} r={size * 0.026} fill="#8fb8ff" fillOpacity={0.25} />
                <Circle cx={p.x} cy={p.y} r={size * 0.013} fill="#ffffff" />
              </G>
            ))}
          </>
        )}
        {cosmosStyle === 'solareclipse' && (
          <>
            <Circle cx={size * 0.76} cy={size * 0.19} r={size * 0.26} fill={`url(#sec_${uid})`} />
            <Circle cx={size * 0.76} cy={size * 0.19} r={size * 0.14} fill="#0a0612" />
            <Circle cx={size * 0.76} cy={size * 0.19} r={size * 0.145} fill="none" stroke="#fff2c8" strokeWidth={1.8} strokeOpacity={0.95} />
          </>
        )}
        {cosmosStyle === 'supernova' && (
          <>
            <Circle cx={size * 0.76} cy={size * 0.21} r={size * 0.34} fill={`url(#sn_${uid})`} />
            {Array.from({ length: 8 }).map((_, i) => {
              const a = (i * Math.PI) / 4;
              const nx = size * 0.76, ny = size * 0.21;
              return (
                <Line
                  key={`sr${i}`}
                  x1={nx + Math.cos(a) * size * 0.1} y1={ny + Math.sin(a) * size * 0.1}
                  x2={nx + Math.cos(a) * size * (0.3 + (i % 2) * 0.12)} y2={ny + Math.sin(a) * size * (0.3 + (i % 2) * 0.12)}
                  stroke="#ffe9c8" strokeWidth={1.6} strokeOpacity={0.8} strokeLinecap="round"
                />
              );
            })}
          </>
        )}
        {cosmosStyle === 'goldrain' && goldStars.map((g2, i) => (
          <Path
            key={`gr${i}`}
            d={`M${g2.x},${g2.y - g2.s * 2} L${g2.x + g2.s * 0.6},${g2.y - g2.s * 0.6} L${g2.x + g2.s * 2},${g2.y} L${g2.x + g2.s * 0.6},${g2.y + g2.s * 0.6} L${g2.x},${g2.y + g2.s * 2} L${g2.x - g2.s * 0.6},${g2.y + g2.s * 0.6} L${g2.x - g2.s * 2},${g2.y} L${g2.x - g2.s * 0.6},${g2.y - g2.s * 0.6} Z`}
            fill="#ffd700" fillOpacity={g2.o}
          />
        ))}

        {stars.map((s, i) => (
          <Circle key={`st${i}`} cx={s.x} cy={s.y} r={s.rad} fill="#ffffff" fillOpacity={s.o} />
        ))}
        {meteors.map((m, i) => (
          // v2: tapered trail + incandescent head (gradient-free: layered strokes)
          <G key={`mt${i}`}>
            <Line x1={m.x} y1={m.y} x2={m.x + m.len} y2={m.y + m.len * 0.55} stroke="#ffffff" strokeWidth={2} strokeOpacity={0.25} strokeLinecap="round" />
            <Line x1={m.x + m.len * 0.45} y1={m.y + m.len * 0.25} x2={m.x + m.len} y2={m.y + m.len * 0.55} stroke="#ffffff" strokeWidth={1.6} strokeOpacity={0.7} strokeLinecap="round" />
            <Circle cx={m.x + m.len} cy={m.y + m.len * 0.55} r={1.9} fill="#ffffff" />
          </G>
        ))}

        {/* ── Orbit rings, back pass (saturn / double pass behind the globe) ── */}
        {renderOrbitBack()}

        {/* ── Atmosphere halo / eclipse corona (behind the globe disc) ── */}
        {gs.atmo && <Circle cx={cx} cy={cy} r={r * 1.28} fill={`url(#atm_${uid})`} />}
        {gs.corona && (
          <>
            <Circle cx={cx} cy={cy} r={r * 1.45} fill={`url(#cor_${uid})`} />
            {coronaRays.map((ray, i) => (
              <Line key={`cr${i}`} x1={ray.x1} y1={ray.y1} x2={ray.x2} y2={ray.y2} stroke="#ffe9a8" strokeWidth={1} strokeOpacity={0.5} strokeLinecap="round" />
            ))}
          </>
        )}

        {/* ── Globe ── */}
        <Circle cx={cx} cy={cy} r={r} fill={`url(#oce_${uid})`} />
        <G clipPath={`url(#clip_${uid})`}>
          {/* graticule */}
          {gratLines.map((d, i) => (
            <Path key={`g${i}`} d={d} fill="none" stroke={gs.grat} strokeWidth={gs.wire ? 0.7 : 0.45} strokeOpacity={gs.wire ? 0.5 : 0.28} strokeDasharray={gs.dash ? '3,3' : undefined} />
          ))}

          {/* land */}
          {gs.craters ? (
            <>
              {craters.map((c2, i) => (
                <G key={`cra${i}`}>
                  <Circle cx={c2.x} cy={c2.y} r={c2.cr} fill="#7a3418" fillOpacity={0.55} />
                  <Circle cx={c2.x - c2.cr * 0.2} cy={c2.y - c2.cr * 0.2} r={c2.cr * 0.7} fill="#c86a3a" fillOpacity={0.35} />
                </G>
              ))}
              <Ellipse cx={cx} cy={cy - r * 0.78} rx={r * 0.55} ry={r * 0.16} fill="#f4e0d0" fillOpacity={0.85} />
            </>
          ) : gs.wire ? (
            fills.map((d, i) => (
              <Path key={`w${i}`} d={d} fill="none" stroke={gs.stroke} strokeWidth={0.7} strokeOpacity={0.85} strokeDasharray={gs.dash ? '2.5,2' : undefined} />
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
              {gs.lava && fills.map((d, i) => (
                <Path key={`lv${i}`} d={d} fill="none" stroke="#ff8a3a" strokeWidth={1.1} strokeOpacity={0.9} />
              ))}
              {gs.biolum && fills.map((d, i) => (
                <Path key={`bl${i}`} d={d} fill="none" stroke="#2ff0c0" strokeWidth={1} strokeOpacity={0.8} />
              ))}
            </>
          )}

          {/* lava cracks / cyber nodes / plankton */}
          {surfaceDeco.cracks.map((d, i) => (
            <Path key={`ck${i}`} d={d} fill="none" stroke="#ffb03a" strokeWidth={1.2} strokeOpacity={0.85} strokeLinecap="round" />
          ))}
          {surfaceDeco.dots.map((p, i) => (
            <Circle key={`sd${i}`} cx={p.x} cy={p.y} r={p.rad} fill={gs.cyber ? '#3af0a0' : '#5affd8'} fillOpacity={p.o} />
          ))}

          {/* story-exclusive: fractured rifts (glow under + bright core) */}
          {gs.rift && surfaceDeco.rifts.map((d, i) => (
            <G key={`rf${i}`}>
              <Path d={d} fill="none" stroke={gs.riftColor} strokeWidth={3.2} strokeOpacity={0.28} strokeLinecap="round" strokeLinejoin="round" />
              <Path d={d} fill="none" stroke="#fff2c8" strokeWidth={1} strokeOpacity={0.9} strokeLinecap="round" strokeLinejoin="round" />
            </G>
          ))}
          {/* story-exclusive: galaxy stars */}
          {gs.galaxy && surfaceDeco.galaxyDots.map((p, i) => (
            <Circle key={`gx${i}`} cx={p.x} cy={p.y} r={p.rad} fill={gs.galaxyColor} fillOpacity={p.o} />
          ))}

          {/* night-side city lights — v2: soft urban halo under each dot */}
          {cityDots.map((p, i) => (
            <G key={`c${i}`}>
              <Circle cx={p.x} cy={p.y} r={Math.max(2.4, size * 0.032)} fill="#ffce6a" fillOpacity={0.28} />
              <Circle cx={p.x} cy={p.y} r={Math.max(0.8, size * 0.012)} fill="#ffe7a0" fillOpacity={0.95} />
            </G>
          ))}

          {/* cloud banks */}
          {clouds.map((cl, i) => (
            <Ellipse key={`cb${i}`} cx={cl.x} cy={cl.y} rx={cl.w} ry={cl.w * 0.38} fill="#ffffff" fillOpacity={cl.o} rotation={cl.rot} originX={cl.x} originY={cl.y} />
          ))}

          {/* gold star glints */}
          {sparkles.map((sp, i) => (
            <Path
              key={`gl${i}`}
              d={`M${sp.x},${sp.y - sp.s} L${sp.x + sp.s * 0.28},${sp.y - sp.s * 0.28} L${sp.x + sp.s},${sp.y} L${sp.x + sp.s * 0.28},${sp.y + sp.s * 0.28} L${sp.x},${sp.y + sp.s} L${sp.x - sp.s * 0.28},${sp.y + sp.s * 0.28} L${sp.x - sp.s},${sp.y} L${sp.x - sp.s * 0.28},${sp.y - sp.s * 0.28} Z`}
              fill="#fff6d8" fillOpacity={0.95}
            />
          ))}

          {/* day/night terminator */}
          {gs.terminator && <Circle cx={cx} cy={cy} r={r} fill={`url(#ter_${uid})`} />}

          {/* hologram / cyber scanlines */}
          {gs.scan && Array.from({ length: Math.floor((2 * r) / 3.2) }).map((_, i) => (
            <Line key={`sc${i}`} x1={cx - r} y1={cy - r + i * 3.2} x2={cx + r} y2={cy - r + i * 3.2} stroke={gs.stroke} strokeWidth={0.5} strokeOpacity={0.13} />
          ))}
        </G>

        {/* scan glow ring outside the clip */}
        {gs.scan && <Circle cx={cx} cy={cy} r={r * 1.06} fill="none" stroke={gs.stroke} strokeWidth={2.4} strokeOpacity={0.22} />}

        {/* rim + specular highlight */}
        <Circle cx={cx} cy={cy} r={r} fill="none" stroke={shade(gs.ocean[0], 0.3)} strokeWidth={1.2} strokeOpacity={0.5} />
        <Circle cx={cx - r * 0.27} cy={cy - r * 0.3} r={r * 0.18} fill="white" fillOpacity={gs.terminator ? 0.3 : 0.22} />

        {/* story-exclusive: a golden crown resting on the crowned world */}
        {gs.crown && (() => {
          const cw = r * 0.9, cyTop = cy - r * 0.62, bh = r * 0.34;
          const px = (u: number) => cx + u * cw;
          const py = (u: number) => cyTop - u * bh;
          return (
            <G>
              <Path
                d={`M${px(-0.5)},${py(0)} L${px(-0.34)},${py(0.9)} L${px(-0.17)},${py(0.28)} L${px(0)},${py(1.05)} L${px(0.17)},${py(0.28)} L${px(0.34)},${py(0.9)} L${px(0.5)},${py(0)} Z`}
                fill="#ffcf4a" stroke="#8a5a12" strokeWidth={1} strokeLinejoin="round"
              />
              <Rect x={px(-0.5)} y={py(0)} width={cw} height={bh * 0.28} fill="#e0a93a" stroke="#8a5a12" strokeWidth={1} />
              <Circle cx={px(-0.34)} cy={py(0.95)} r={r * 0.05} fill="#c0341a" />
              <Circle cx={px(0)} cy={py(1.12)} r={r * 0.055} fill="#3a7bd0" />
              <Circle cx={px(0.34)} cy={py(0.95)} r={r * 0.05} fill="#2a8a4f" />
            </G>
          );
        })()}

        {/* ── Emblem — a landmark planted on the globe at its real country ── */}
        {emblem && emblem.id !== 'emblem_none' && (
          <>
            {/* warm ground spotlight + contact shadow (Boutique 2.0 polish) */}
            <Ellipse cx={cx} cy={cy + r * 0.04} rx={r * 0.86 * 0.46} ry={r * 0.86 * 0.12} fill="#ffce6a" opacity={0.13} />
            <Ellipse cx={cx} cy={cy + r * 0.04} rx={r * 0.86 * 0.34} ry={r * 0.86 * 0.075} fill="#00040a" opacity={0.32} />
            <EmblemGlyph id={emblem.id} bx={cx} by={cy + r * 0.04} h={r * 0.86} />
          </>
        )}

        {/* ── Orbit ring, front pass ── */}
        {renderOrbitFront()}

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
        </G>
      </Svg>
    </View>
  );
}

export const WorldAvatar = React.memo(WorldAvatarBase);
export default WorldAvatar;
