/**
 * Format « globe » : un quiz plein écran, sans capture de l'app. La vraie
 * Terre (Blue Marble, éclairée, avec atmosphère) vole d'un pays à l'autre,
 * éteint tout sauf le pays à trouver, compte 3 secondes puis révèle la
 * réponse. On ouvre sur le pays le plus dur (« 97 % ne le trouvent pas »)
 * pour donner envie de rester jusqu'au bout.
 *
 * Zones sûres : rien d'important au-dessus de 200 px, sous 1 650 px, ni dans
 * la colonne de droite (boutons des apps).
 */
import { loadFont } from '@remotion/fonts';
import playfair800 from '@fontsource/playfair-display/files/playfair-display-latin-800-normal.woff2';
import montserrat600 from '@fontsource/montserrat/files/montserrat-latin-600-normal.woff2';
import montserrat800 from '@fontsource/montserrat/files/montserrat-latin-800-normal.woff2';
import { geoArea, geoCentroid, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { useLayoutEffect, useRef, useState } from 'react';
import { feature, mesh } from 'topojson-client';
import world from 'world-atlas/countries-50m.json';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const display = 'Playfair Display';
const sans = 'Montserrat';
loadFont({ family: display, url: playfair800, weight: '800' });
loadFont({ family: sans, url: montserrat600, weight: '600' });
loadFont({ family: sans, url: montserrat800, weight: '800' });

const C = {
  space: '#03060f',
  parchment: '#f2e8d0',
  gold: '#f5b942',
  red: '#ff3b4a',
  green: '#3ddc84',
};

export const GLOBE_FPS = 30;
// Mêmes durées dans globe.mjs (placement de la voix off).
const HOOK_S = 2.8;
const ROUND_S = 3.6;
const TURN_S = 0.8;
const COUNT_S = 2.0;
const OUTRO_S = 3.2;

export type Round = {
  /** Code ISO 3166 numérique, comme dans world-atlas (« 380 » = Italie). */
  id: string;
  name: string;
  flag: string;
  level: string;
};

export type GlobeQuizProps = {
  hook: string[];
  question: string;
  rounds: Round[];
  /** Pays montré (en rouge) pendant l'accroche ; par défaut le dernier. */
  teaser?: string;
  outro: string;
  outroSub: string;
  cta: string;
  icon: string;
  sound?: boolean;
  /** Voix off synthétisée par voice.mjs (fichiers dans public/). */
  voice?: { file?: string; at?: number | null }[];
};

export const globeQuizSeconds = (p: GlobeQuizProps) => HOOK_S + p.rounds.length * ROUND_S + OUTRO_S;

type Topo = Parameters<typeof feature>[0] & { objects: { countries: Parameters<typeof feature>[1] } };
const topo = world as unknown as Topo;
const countries = (feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry>).features;
const byId = new Map(countries.map((f) => [String(f.id), f]));
const borders = mesh(topo as never, topo.objects.countries as never, (a, b) => a !== b);
const coasts = mesh(topo as never, topo.objects.countries as never, (a, b) => a === b);

const W = 1080;
const H = 1920;
const GLOBE_Y = 960;
const GLOBE_R = 470;
const LIGHT = (() => {
  const v = [-0.55, 0.5, 0.67];
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
})();

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

// Zoom pour qu'un petit pays reste lisible : ~proportionnel à 1/√surface,
// plafonné pour que la texture reste nette (les micro-pays ont une cible).
const zoomFor = (f: Feature<Geometry> | undefined) =>
  f ? Math.min(4.5, Math.max(1, 1.3 * Math.sqrt(0.02 / geoArea(f)))) : 1;

// ---------------------------------------------------------------------------
// Terre : projection orthographique pixel par pixel de la texture Blue Marble.

type Texture = { data: Uint8ClampedArray; w: number; h: number };
let texture: Texture | null = null;
let texturePromise: Promise<Texture> | null = null;
const loadTexture = () =>
  (texturePromise ??= new Promise<Texture>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      texture = { data: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
      resolve(texture);
    };
    img.onerror = () => reject(new Error('earth.jpg introuvable'));
    img.src = staticFile('earth.jpg');
  }));

function drawEarth(ctx: CanvasRenderingContext2D, tex: Texture, center: [number, number], R: number) {
  const out = ctx.createImageData(W, H);
  const px = out.data;
  const lam0 = (center[0] * Math.PI) / 180;
  const phi0 = (center[1] * Math.PI) / 180;
  const sinP = Math.sin(phi0);
  const cosP = Math.cos(phi0);
  const { data, w: tw, h: th } = tex;
  const x0 = Math.max(0, Math.floor(W / 2 - R));
  const x1 = Math.min(W, Math.ceil(W / 2 + R));
  const y0 = Math.max(0, Math.floor(GLOBE_Y - R));
  const y1 = Math.min(H, Math.ceil(GLOBE_Y + R));
  for (let py = y0; py < y1; py++) {
    const y = (GLOBE_Y - py - 0.5) / R;
    for (let qx = x0; qx < x1; qx++) {
      const x = (qx + 0.5 - W / 2) / R;
      const r2 = x * x + y * y;
      if (r2 >= 1) continue;
      const z = Math.sqrt(1 - r2);
      const lat = Math.asin(z * sinP + y * cosP);
      const lon = lam0 + Math.atan2(x, z * cosP - y * sinP);
      let u = ((lon / (2 * Math.PI) + 0.5) % 1) * tw;
      if (u < 0) u += tw;
      const v = Math.min(th - 1.001, Math.max(0, (0.5 - lat / Math.PI) * th));
      // Échantillonnage bilinéaire.
      const ua = Math.floor(u);
      const va = Math.floor(v);
      const fu = u - ua;
      const fv = v - va;
      const ub = (ua + 1) % tw;
      const i00 = (va * tw + ua) * 4;
      const i10 = (va * tw + ub) * 4;
      const i01 = ((va + 1) * tw + ua) * 4;
      const i11 = ((va + 1) * tw + ub) * 4;
      // Éclairage doux + bord de l'atmosphère bleuté.
      const diffuse = Math.max(0, x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]);
      const light = 0.42 + 0.78 * diffuse;
      const rim = (1 - z) ** 2.5 * 0.75;
      const o = (py * W + qx) * 4;
      for (let k = 0; k < 3; k++) {
        const top = data[i00 + k] * (1 - fu) + data[i10 + k] * fu;
        const bottom = data[i01 + k] * (1 - fu) + data[i11 + k] * fu;
        const c = (top * (1 - fv) + bottom * fv) * light;
        const tint = k === 0 ? 90 : k === 1 ? 160 : 255;
        px[o + k] = c * (1 - rim) + tint * rim;
      }
      // Bord antialiasé.
      px[o + 3] = Math.min(1, (1 - Math.sqrt(r2)) * R) * 255;
    }
  }
  ctx.putImageData(out, 0, 0);
}

function Earth({ center, R }: { center: [number, number]; R: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tex, setTex] = useState<Texture | null>(texture);
  const [handle] = useState(() => (texture ? null : delayRender('Texture de la Terre')));
  useLayoutEffect(() => {
    if (!tex) {
      loadTexture().then(setTex);
      return;
    }
    drawEarth(ref.current!.getContext('2d')!, tex, center, R);
    if (handle !== null) continueRender(handle);
  }, [tex, center[0], center[1], R]);
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', inset: 0 }} />;
}

// ---------------------------------------------------------------------------
// Décor et effets.

function Stars({ t }: { t: number }) {
  return (
    <AbsoluteFill>
      {Array.from({ length: 140 }, (_, i) => {
        const size = 1.5 + random(`ss${i}`) ** 3 * 4;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: ((random(`sx${i}`) * W - t * 6 * size) % W + W) % W,
              top: random(`sy${i}`) * H,
              width: size,
              height: size,
              borderRadius: 9,
              background: '#fff',
              boxShadow: size > 3.5 ? '0 0 8px #9cc4ff' : undefined,
              opacity: (0.2 + random(`so${i}`) * 0.6) * (0.75 + 0.25 * Math.sin(t * (1 + random(`st${i}`) * 3) + i)),
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

// Fuite de lumière chaude qui balaie l'écran pendant les transitions.
function LightLeak({ p, seed }: { p: number; seed: number }) {
  if (p <= 0 || p >= 1) return null;
  const a = Math.sin(Math.PI * p);
  const x = -20 + 140 * p;
  const y = 20 + 50 * random(`ly${seed}`);
  return (
    <AbsoluteFill
      style={{
        mixBlendMode: 'screen',
        opacity: 0.65 * a,
        background: `radial-gradient(ellipse 55% 35% at ${x}% ${y}%, rgba(255,170,80,0.9), rgba(255,80,60,0.35) 45%, transparent 75%),
          radial-gradient(ellipse 40% 60% at ${100 - x}% ${100 - y}%, rgba(255,90,170,0.5), transparent 70%)`,
      }}
    />
  );
}

function Burst({ x, y, t, color, seed }: { x: number; y: number; t: number; color: string; seed: number }) {
  if (t < 0 || t > 1.1) return null;
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: x - 20,
          top: y - 20,
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: `6px solid ${color}`,
          transform: `scale(${1 + t * 14})`,
          opacity: 0.8 * (1 - t / 0.7),
        }}
      />
      {Array.from({ length: 34 }, (_, i) => {
        const angle = random(`ba${seed}-${i}`) * Math.PI * 2;
        const speed = 260 + random(`bs${seed}-${i}`) * 520;
        const d = speed * (1 - Math.exp(-t * 4)) / 1.6;
        const size = 6 + random(`bz${seed}-${i}`) * 10;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x + Math.cos(angle) * d - size / 2,
              top: y + Math.sin(angle) * d + 120 * t * t - size / 2,
              width: size,
              height: size,
              borderRadius: i % 3 ? '50%' : 2,
              background: i % 4 ? color : '#fff',
              boxShadow: `0 0 12px ${color}`,
              opacity: 1 - t / 1.1,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

const LEVEL_COLORS: Record<string, string> = {
  FACILE: '#2fb36b',
  EASY: '#2fb36b',
  MOYEN: '#e09a2a',
  MEDIUM: '#e09a2a',
  EXPERT: '#e5532a',
  HARD: '#e5532a',
  IMPOSSIBLE: '#a83cff',
};

const goldText = {
  background: 'linear-gradient(180deg, #fff6dc 10%, #f5b942 90%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
} as const;

// ---------------------------------------------------------------------------

export const GlobeQuiz = (props: GlobeQuizProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { rounds } = props;
  const total = globeQuizSeconds(props);
  const roundsEnd = HOOK_S + rounds.length * ROUND_S;

  const roundIndex = Math.floor((t - HOOK_S) / ROUND_S);
  const inRounds = t >= HOOK_S && roundIndex < rounds.length;
  const outro = t >= roundsEnd;
  const rt = inRounds ? t - HOOK_S - roundIndex * ROUND_S : 0;

  const features = rounds.map((r) => byId.get(r.id));
  const centroid = (f: Feature<Geometry> | undefined) => (f ? (geoCentroid(f) as [number, number]) : ([0, 20] as [number, number]));
  const centers = features.map(centroid);
  const teaser = byId.get(props.teaser ?? rounds[rounds.length - 1]?.id ?? '');
  const teaserCenter = centroid(teaser);

  // Caméra (centre, zoom) à un instant donné : accroche sur le pays teaser,
  // puis vol d'un pays à l'autre, puis recul pour la fin.
  const camera = (time: number): { center: [number, number]; zoom: number } => {
    const zt = zoomFor(teaser);
    if (time < HOOK_S) {
      return { center: [teaserCenter[0] + 4 - time * 1.5, teaserCenter[1]], zoom: zt * (0.92 + 0.05 * time) };
    }
    const i = Math.min(rounds.length - 1, Math.floor((time - HOOK_S) / ROUND_S));
    const local = time - HOOK_S - i * ROUND_S;
    const from: [number, number] = i === 0 ? [teaserCenter[0] + 4 - HOOK_S * 1.5, teaserCenter[1]] : centers[i - 1];
    const z0 = i === 0 ? zt * (0.92 + 0.05 * HOOK_S) : zoomFor(features[i - 1]);
    const z1 = zoomFor(features[i]);
    if (time >= roundsEnd) {
      const ot = time - roundsEnd;
      return {
        center: [centers[i][0] + 40 * ease(clamp01(ot / 1.2)) + ot * 8, centers[i][1] * (1 - ease(clamp01(ot / 1.2))) + 10],
        zoom: interpolate(ot, [0, 1.2], [z1, 0.82], { extrapolateRight: 'clamp', easing: ease }),
      };
    }
    const k = ease(clamp01(local / TURN_S));
    const center = geoInterpolate(from, centers[i])(k) as [number, number];
    // Recul au milieu du vol, comme une caméra qui prend de la hauteur, puis
    // léger travelling avant pendant le compte à rebours.
    const zoom = (z0 + (z1 - z0) * k) * (1 - 0.35 * Math.sin(Math.PI * k)) * (1 + 0.04 * clamp01((local - TURN_S) / COUNT_S));
    return { center, zoom };
  };

  const cam = camera(t);
  const prev = camera(Math.max(0, t - 1 / fps));
  const R = GLOBE_R * cam.zoom;
  // Flou de mouvement : vitesse à l'écran (distance angulaire × rayon).
  const angular = Math.acos(
    Math.min(
      1,
      Math.sin((cam.center[1] * Math.PI) / 180) * Math.sin((prev.center[1] * Math.PI) / 180) +
        Math.cos((cam.center[1] * Math.PI) / 180) * Math.cos((prev.center[1] * Math.PI) / 180) * Math.cos(((cam.center[0] - prev.center[0]) * Math.PI) / 180),
    ),
  );
  const blur = Math.min(7, angular * R * 0.09 + Math.abs(cam.zoom - prev.zoom) * GLOBE_R * 0.05);

  const counting = inRounds && rt >= TURN_S && rt < TURN_S + COUNT_S;
  const countT = counting ? (rt - TURN_S) / COUNT_S : 0;
  const revealT = inRounds ? rt - TURN_S - COUNT_S : -1;
  const round = inRounds ? rounds[roundIndex] : undefined;
  const isImpossible = round?.level === 'IMPOSSIBLE';

  // Pays éclairé et couleur d'accent : rouge pendant l'accroche, or pendant
  // le compte à rebours, vert à la révélation.
  let highlight: Feature<Geometry> | undefined;
  let accent = C.gold;
  let draw = 1;
  if (t < HOOK_S) {
    highlight = teaser;
    accent = C.red;
    draw = clamp01((t - 0.15) / 0.7);
  } else if (inRounds && rt >= TURN_S * 0.75) {
    highlight = features[roundIndex];
    accent = revealT >= 0 ? C.green : C.gold;
    draw = clamp01((rt - TURN_S * 0.75) / 0.6);
  }
  const dim = highlight ? 0.5 * clamp01(draw * 2) : 0;

  const projection = geoOrthographic()
    .rotate([-cam.center[0], -cam.center[1]])
    .scale(R)
    .translate([W / 2, GLOBE_Y])
    .clipAngle(90)
    .precision(0.3);
  const path = geoPath(projection);
  const sphere = path({ type: 'Sphere' }) ?? '';
  const hlPath = highlight ? path(highlight) ?? '' : '';
  const hlPoint = highlight ? projection(geoCentroid(highlight)) : null;
  const hlArea = highlight ? path.area(highlight) : 0;
  const pulse = 0.5 + 0.5 * Math.sin(t * 9);

  // Secousse : accroche et dernière seconde du pays « impossible ».
  const shakeAmp = (t < 0.35 ? 14 * (1 - t / 0.35) : 0) + (isImpossible && counting && countT > 0.5 ? 7 * (countT - 0.5) * 2 : 0);
  const shakeX = shakeAmp * (random(`kx${frame}`) - 0.5) * 2;
  const shakeY = shakeAmp * (random(`ky${frame}`) - 0.5) * 2;
  // « Punch » du globe à la révélation.
  const punch = revealT >= 0 ? 1 + 0.05 * Math.exp(-revealT * 6) * Math.cos(revealT * 22) : 1;

  // Dernière réponse révélée : reste lisible pendant le vol suivant.
  const shownIndex = revealT >= 0 ? roundIndex : inRounds && roundIndex > 0 && rt < TURN_S * 0.6 ? roundIndex - 1 : -1;
  const shownAt = HOOK_S + shownIndex * ROUND_S + TURN_S + COUNT_S;
  const shownOut = shownIndex >= 0 && shownIndex !== roundIndex ? clamp01(rt / (TURN_S * 0.6)) : 0;
  const sfx = (name: string) => staticFile(`sfx/${name}.wav`);
  const roundStart = (i: number) => HOOK_S + i * ROUND_S;

  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 48%, #0d1b38, ${C.space} 72%)`, overflow: 'hidden' }}>
      <Stars t={t} />

      <AbsoluteFill
        style={{
          transform: `translate(${shakeX}px, ${shakeY}px) scale(${punch})`,
          transformOrigin: `50% ${GLOBE_Y}px`,
          filter: blur > 0.4 ? `blur(${blur.toFixed(2)}px)` : undefined,
        }}
      >
        {/* Halo de l'atmosphère */}
        <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <radialGradient id="halo" gradientUnits="userSpaceOnUse" cx={W / 2} cy={GLOBE_Y} r={R * 1.2}>
              <stop offset={0.8} stopColor="#6fb4ff" stopOpacity={0.55} />
              <stop offset={0.86} stopColor="#3d7fe0" stopOpacity={0.22} />
              <stop offset={1} stopColor="#1b3c80" stopOpacity={0} />
            </radialGradient>
          </defs>
          <circle cx={W / 2} cy={GLOBE_Y} r={R * 1.2} fill="url(#halo)" />
        </svg>
        <Earth center={cam.center} R={R} />
        <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation={6 + 6 * pulse} result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <mask id="spot">
              <rect width={W} height={H} fill="#fff" />
              {hlPath ? <path d={hlPath} fill="#000" /> : null}
            </mask>
          </defs>
          <path d={path(coasts) ?? ''} fill="none" stroke="#fff" strokeOpacity={0.12} strokeWidth={1} />
          <path d={path(borders) ?? ''} fill="none" stroke="#fff" strokeOpacity={0.22} strokeWidth={1.1} />
          {/* Projecteur : tout s'assombrit sauf le pays */}
          <path d={sphere} fill="#000814" opacity={dim} mask="url(#spot)" />
          {hlPath ? (
            <>
              <path d={hlPath} fill={accent} fillOpacity={0.28 * draw} />
              <path
                d={hlPath}
                pathLength={1}
                fill="none"
                stroke={accent}
                strokeWidth={4.5}
                strokeLinejoin="round"
                strokeDasharray={1}
                strokeDashoffset={1 - draw}
                filter="url(#glow)"
              />
            </>
          ) : null}
          {/* Cible autour des micro-pays pour qu'on les voie */}
          {hlPoint && hlArea < 4000 ? (
            <g opacity={draw}>
              <circle cx={hlPoint[0]} cy={hlPoint[1]} r={70 + 10 * pulse} fill="none" stroke={accent} strokeWidth={4} strokeDasharray="22 14" transform={`rotate(${t * 60} ${hlPoint[0]} ${hlPoint[1]})`} />
              <circle cx={hlPoint[0]} cy={hlPoint[1]} r={105 + 30 * ((t * 1.2) % 1)} fill="none" stroke={accent} strokeWidth={3} opacity={1 - ((t * 1.2) % 1)} />
            </g>
          ) : null}
        </svg>
      </AbsoluteFill>

      {/* Transitions : fuite de lumière, flash et éclats */}
      {rounds.map((_, i) => (
        <LightLeak key={i} seed={i} p={(t - roundStart(i) + 0.15) / (TURN_S + 0.2)} />
      ))}
      {revealT >= 0 && revealT < 0.4 ? <AbsoluteFill style={{ background: '#fff', opacity: 0.4 * Math.exp(-revealT * 12) }} /> : null}
      {revealT >= 0 && hlPoint ? <Burst x={hlPoint[0]} y={hlPoint[1]} t={revealT} color={C.green} seed={roundIndex} /> : null}

      {/* Vignette cinéma */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 75% 60% at 50% 50%, transparent 55%, rgba(0,0,0,0.75) 100%)' }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 22%, transparent 70%, rgba(0,0,0,0.7) 100%)' }} />

      {/* Barre de progression */}
      <div style={{ position: 'absolute', top: 0, left: 0, height: 10, width: `${(100 * t) / total}%`, background: `linear-gradient(90deg, ${C.gold}, ${C.red})`, boxShadow: `0 0 16px ${C.gold}` }} />

      {/* Accroche : visible dès la première image */}
      {t < HOOK_S ? (
        <AbsoluteFill style={{ alignItems: 'center', paddingTop: 250, gap: 22, opacity: interpolate(t, [HOOK_S - 0.25, HOOK_S], [1, 0], { extrapolateLeft: 'clamp' }), transform: `translateY(${-80 * clamp01((t - HOOK_S + 0.25) / 0.25)}px)` }}>
          {props.hook.map((line, li) => (
            <div key={li} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 20, maxWidth: 940, padding: '0 40px' }}>
              {line.split(' ').map((w, wi) => {
                const at = li === 0 ? wi * 0.03 - 0.6 : 0.9 + wi * 0.12;
                const s = spring({ frame: frame - at * fps, fps, config: { damping: 11, mass: 0.5 } });
                return (
                  <span
                    key={wi}
                    style={{
                      fontFamily: li === 0 ? display : sans,
                      fontWeight: 800,
                      fontSize: li === 0 ? 104 : 62,
                      lineHeight: 1.1,
                      ...(li === 0 ? goldText : { color: '#fff' }),
                      transform: `scale(${0.4 + 0.6 * s}) translateY(${(1 - s) * 40}px)`,
                      opacity: clamp01(s * 1.5),
                      filter: 'drop-shadow(0 6px 24px rgba(0,0,0,0.8))',
                    }}
                  >
                    {w}
                  </span>
                );
              })}
            </div>
          ))}
        </AbsoluteFill>
      ) : null}

      {/* Bandeau de manche */}
      {round ? (
        <AbsoluteFill style={{ alignItems: 'center', paddingTop: 225, gap: 24 }}>
          <div
            style={{
              transform: `scale(${spring({ frame: frame - roundStart(roundIndex) * fps, fps, config: { damping: 10 } })})`,
              padding: '12px 32px',
              borderRadius: 999,
              background: `linear-gradient(135deg, ${LEVEL_COLORS[round.level] ?? C.gold}, rgba(0,0,0,0.35))`,
              border: '2px solid rgba(255,255,255,0.35)',
              color: '#fff',
              fontFamily: sans,
              fontWeight: 800,
              fontSize: 38,
              letterSpacing: 4,
              boxShadow: `0 0 40px ${LEVEL_COLORS[round.level] ?? C.gold}88`,
            }}
          >
            {roundIndex + 1}/{rounds.length} · {round.level}
          </div>
          <div style={{ fontFamily: display, fontWeight: 800, fontSize: 80, color: C.parchment, filter: 'drop-shadow(0 6px 24px rgba(0,0,0,0.85))' }}>
            {props.question}
          </div>
          {/* Minuteur qui se vide */}
          <div style={{ width: 620, height: 14, borderRadius: 7, background: 'rgba(255,255,255,0.15)', overflow: 'hidden', opacity: rt >= TURN_S * 0.5 ? 1 : 0 }}>
            <div
              style={{
                height: '100%',
                width: `${100 * (revealT >= 0 ? 0 : 1 - countT)}%`,
                borderRadius: 7,
                background: countT > 0.66 ? C.red : `linear-gradient(90deg, ${C.gold}, #ffd98a)`,
                boxShadow: `0 0 18px ${countT > 0.66 ? C.red : C.gold}`,
              }}
            />
          </div>
        </AbsoluteFill>
      ) : null}

      {/* Compte à rebours */}
      {counting ? (
        (() => {
          const n = Math.min(3, Math.floor(countT * 3));
          const nt = countT * 3 - n;
          const color = n === 2 ? C.red : '#fff';
          return (
            <AbsoluteFill style={{ alignItems: 'center', top: 1420 }}>
              <div
                style={{
                  fontFamily: sans,
                  fontWeight: 800,
                  fontSize: 170,
                  color,
                  transform: `scale(${1.6 - 0.6 * ease(clamp01(nt * 3))})`,
                  opacity: 1 - clamp01((nt - 0.75) * 4),
                  textShadow: `0 0 40px ${color === C.red ? C.red : 'rgba(120,180,255,0.9)'}, 0 8px 30px rgba(0,0,0,0.8)`,
                }}
              >
                {3 - n}
              </div>
            </AbsoluteFill>
          );
        })()
      ) : null}

      {/* Réponse : drapeau + nom, lettre par lettre */}
      {shownIndex >= 0 ? (
        <AbsoluteFill style={{ alignItems: 'center', top: 1410, opacity: 1 - shownOut, transform: `translateY(${-60 * shownOut}px)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '18px 44px', borderRadius: 32, background: 'rgba(3,10,25,0.72)', border: `3px solid ${C.green}`, boxShadow: `0 0 50px ${C.green}66, 0 20px 50px rgba(0,0,0,0.6)`, transform: `scale(${spring({ frame: frame - shownAt * fps, fps, config: { damping: 9, mass: 0.6 } })})` }}>
            <span style={{ fontSize: 96 }}>{rounds[shownIndex].flag}</span>
            <span style={{ display: 'flex' }}>
              {[...rounds[shownIndex].name].map((ch, ci) => {
                const s = spring({ frame: frame - (shownAt + 0.05 + ci * 0.03) * fps, fps, config: { damping: 10, mass: 0.4 } });
                return (
                  <span key={ci} style={{ fontFamily: display, fontWeight: 800, fontSize: Math.min(92, 1040 / rounds[shownIndex].name.length), whiteSpace: 'pre', ...goldText, display: 'inline-block', transform: `translateY(${(1 - s) * 50}px)`, opacity: clamp01(s * 1.5) }}>
                    {ch}
                  </span>
                );
              })}
            </span>
          </div>
        </AbsoluteFill>
      ) : null}

      {/* Fin : score en commentaire + appli */}
      {outro ? (
        (() => {
          const s = spring({ frame: frame - roundsEnd * fps, fps, config: { damping: 10 } });
          const s2 = spring({ frame: frame - (roundsEnd + 0.6) * fps, fps, config: { damping: 12 } });
          return (
            <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 36, background: `rgba(3,6,15,${0.55 * s})` }}>
              <div style={{ fontFamily: display, fontWeight: 800, fontSize: 116, ...goldText, transform: `scale(${s})`, textAlign: 'center', filter: 'drop-shadow(0 8px 30px rgba(0,0,0,0.8))' }}>
                {props.outro}
              </div>
              <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 56, color: '#fff', transform: `scale(${s})` }}>{props.outroSub}</div>
              <div
                style={{
                  marginTop: 50,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 26,
                  padding: '20px 40px 20px 20px',
                  borderRadius: 36,
                  background: 'rgba(255,255,255,0.1)',
                  border: '2px solid rgba(255,255,255,0.25)',
                  transform: `translateY(${(1 - s2) * 80}px)`,
                  opacity: s2,
                }}
              >
                <Img src={staticFile(props.icon)} style={{ width: 110, height: 110, borderRadius: 26 }} />
                <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 44, color: '#fff' }}>{props.cta}</div>
              </div>
            </AbsoluteFill>
          );
        })()
      ) : null}

      {props.sound === false ? null : (
        <>
          <Audio
            src={sfx('music')}
            volume={(f) =>
              interpolate(f, [0, 6, (total - 1) * fps, total * fps], [0, 1, 1, 0], { extrapolateRight: 'clamp' }) *
              ((props.voice ?? []).some((l) => l.file) ? 0.22 : 0.45)
            }
          />
          {(props.voice ?? []).map((line, i) =>
            line.file ? (
              <Sequence key={`v${i}`} from={Math.round((line.at ?? 0) * fps)} layout="none">
                <Audio src={staticFile(line.file)} />
              </Sequence>
            ) : null,
          )}
          <Audio src={sfx('boom')} volume={0.9} />
          <Sequence from={Math.round((HOOK_S - 1.2) * fps)} layout="none">
            <Audio src={sfx('riser')} volume={0.45} />
          </Sequence>
          {rounds.map((r, i) => (
            <Sequence key={i} from={Math.round(roundStart(i) * fps)} layout="none">
              <Audio src={sfx('whoosh')} volume={0.55} />
              {[0, 1, 2].map((k) => (
                <Sequence key={k} from={Math.round((TURN_S + (k * COUNT_S) / 3) * fps)} layout="none">
                  <Audio src={sfx('tick')} volume={0.9} />
                </Sequence>
              ))}
              {r.level === 'IMPOSSIBLE' ? (
                <Sequence from={Math.round((TURN_S + COUNT_S - 1.2) * fps)} layout="none">
                  <Audio src={sfx('riser')} volume={0.5} />
                </Sequence>
              ) : null}
              <Sequence from={Math.round((TURN_S + COUNT_S) * fps)} layout="none">
                <Audio src={sfx('ding')} volume={0.7} />
                <Audio src={sfx('pop')} volume={0.5} />
                {r.level === 'IMPOSSIBLE' ? <Audio src={sfx('boom')} volume={0.7} /> : null}
              </Sequence>
            </Sequence>
          ))}
          <Sequence from={Math.round(roundsEnd * fps)} layout="none">
            <Audio src={sfx('whoosh')} volume={0.5} />
            <Audio src={sfx('pop')} volume={0.8} />
          </Sequence>
        </>
      )}
    </AbsoluteFill>
  );
};
