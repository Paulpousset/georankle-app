/**
 * Vidéo d'aperçu pour les portails web (CrazyGames : paysage 16:9 et portrait
 * 2:3, 20 s max, lue sans le son au survol de la vignette).
 *
 * Écran d'intro qui liste les modes de jeu, puis un extrait rapide de chaque
 * mode filmé dans le build portail (scripts : voir guide-portails-web.md),
 * puis une carte de fin. Pas de son : le portail coupe l'audio des aperçus.
 * La mise en page s'adapte au format de la composition (paysage ou portrait).
 */
import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

import { C, clamp, mono, serif } from './kit';

export type PortalMode = { title: string; cat: 'map' | 'recognize' | 'compare' };
export type PortalClip = { file: string; title: string; cat: PortalMode['cat'] };
export type PortalTrailerProps = {
  name: string;
  tagline: string;
  modes: PortalMode[];
  clips: PortalClip[];
  cta: string;
};

export const INTRO_S = 3.3;
export const CLIP_S = 2.0;
export const END_S = 1.7;
export const portalTrailerSeconds = (p: PortalTrailerProps) => INTRO_S + p.clips.length * CLIP_S + END_S;

const CAT: Record<PortalMode['cat'], { color: string; label: string }> = {
  map: { color: C.ocean, label: 'ON THE MAP' },
  recognize: { color: C.vermilion, label: 'RECOGNIZE' },
  compare: { color: C.green, label: 'COMPARE' },
};

/** Fond parchemin aux méridiens qui dérivent, à n'importe quelle taille. */
function Backdrop({ drift = 1 }: { drift?: number }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const step = Math.round(Math.min(width, height) / 9);
  const off = (frame * 0.6 * drift) % step;
  return (
    <AbsoluteFill style={{ background: C.parchment }}>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0, opacity: 0.2 }}>
        {Array.from({ length: Math.ceil(width / step) + 2 }, (_, i) => (
          <line key={`m${i}`} x1={i * step - step + off} x2={i * step - step + off} y1={0} y2={height} stroke={C.brown} strokeWidth={1.4} />
        ))}
        {Array.from({ length: Math.ceil(height / step) + 2 }, (_, i) => (
          <line key={`p${i}`} x1={0} x2={width} y1={i * step - off / 2} y2={i * step - off / 2} stroke={C.brown} strokeWidth={1} strokeDasharray="2 10" />
        ))}
      </svg>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(84,52,20,0.30) 100%)' }} />
    </AbsoluteFill>
  );
}

/** Le globe doré de la marque (même dessin que les couvertures). */
function Globe({ size, spin = 0 }: { size: number; spin?: number }) {
  const rx = 78 + 40 * Math.sin(spin);
  return (
    <svg width={size} height={size} viewBox="0 0 400 400">
      <defs>
        <radialGradient id="pg" cx="40%" cy="35%">
          <stop offset="0" stopColor="#3a78b8" />
          <stop offset="1" stopColor="#173257" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="180" fill="url(#pg)" stroke="#e0a93a" strokeWidth="8" />
      <ellipse cx="200" cy="200" rx={Math.abs(rx)} ry="180" fill="none" stroke="#e0a93a" strokeWidth="4" />
      <ellipse cx="200" cy="200" rx={Math.abs(rx) + 62} ry="180" fill="none" stroke="#e0a93a" strokeWidth="2.5" opacity=".6" />
      <line x1="20" y1="200" x2="380" y2="200" stroke="#e0a93a" strokeWidth="4" />
      <path d="M44 112 Q200 150 356 112" fill="none" stroke="#e0a93a" strokeWidth="3.5" />
      <path d="M44 288 Q200 250 356 288" fill="none" stroke="#e0a93a" strokeWidth="3.5" />
      <g transform="translate(262 96)">
        <path d="M0 0 C-22 0 -34 18 -34 32 C-34 54 0 84 0 84 C0 84 34 54 34 32 C34 18 22 0 0 0Z" fill="#e8552e" stroke="#f4ead2" strokeWidth="4" />
        <circle cx="0" cy="32" r="11" fill="#f4ead2" />
      </g>
    </svg>
  );
}

function Intro({ p }: { p: PortalTrailerProps }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const land = width > height;
  const u = Math.min(width, height) / 1080; // unité : 1 px à 1080 de petit côté
  const titleS = spring({ frame, fps, config: { damping: 11, stiffness: 160 } });
  const out = interpolate(t, [INTRO_S - 0.35, INTRO_S], [1, 0], clamp);
  const zoom = interpolate(t, [INTRO_S - 0.35, INTRO_S], [1, 1.12], clamp);
  const cols = land ? 5 : 3;
  const gap = 18 * u;
  const gridW = land ? width * 0.86 : width * 0.9;
  const cellW = (gridW - gap * (cols - 1)) / cols;
  const cellH = (land ? 124 : 132) * u;
  const font = (land ? 40 : 40) * u;
  return (
    <AbsoluteFill style={{ opacity: out, transform: `scale(${zoom})` }}>
      <div style={{ position: 'absolute', top: (land ? 46 : 110) * u, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26 * u, transform: `scale(${0.7 + 0.3 * titleS})`, opacity: Math.min(1, titleS * 1.5) }}>
          <Globe size={(land ? 150 : 170) * u} spin={t * 2.2} />
          <div style={{ fontFamily: serif, fontWeight: 900, fontSize: (land ? 150 : 160) * u, color: C.sepia, letterSpacing: -2, lineHeight: 1 }}>{p.name}</div>
        </div>
        <div style={{ marginTop: 18 * u, fontFamily: mono, fontWeight: 700, fontSize: 34 * u, letterSpacing: 6 * u, color: C.vermilion, opacity: interpolate(t, [0.25, 0.6], [0, 1], clamp) }}>
          {p.tagline}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          top: (land ? 350 : 480) * u,
          left: (width - gridW) / 2,
          width: gridW,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap,
        }}
      >
        {p.modes.map((m, i) => {
          const s = spring({ frame: frame - 10 - i * 2.2, fps, config: { damping: 12, stiffness: 190 } });
          const c = CAT[m.cat].color;
          return (
            <div
              key={m.title}
              style={{
                width: cellW,
                height: cellH,
                boxSizing: 'border-box',
                background: C.parchmentDark,
                border: `${3 * u}px solid ${C.tan}`,
                borderBottom: `${8 * u}px solid ${c}`,
                borderRadius: 20 * u,
                display: 'flex',
                alignItems: 'center',
                gap: 14 * u,
                padding: `0 ${20 * u}px`,
                transform: `translateY(${(1 - s) * 60 * u}px) scale(${0.6 + 0.4 * s})`,
                opacity: Math.min(1, s * 1.4),
                boxShadow: `0 ${8 * u}px ${20 * u}px rgba(44,24,16,0.12)`,
              }}
            >
              <div style={{ width: 16 * u, height: 16 * u, borderRadius: 99, background: c, flexShrink: 0 }} />
              <div style={{ fontFamily: serif, fontWeight: 900, fontSize: font, color: C.sepia, lineHeight: 1.05 }}>{m.title}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function Clip({ c, i, n }: { c: PortalClip; i: number; n: number }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const land = width > height;
  const u = Math.min(width, height) / 1080;
  const s = spring({ frame, fps, config: { damping: 15, stiffness: 170 } });
  const labelS = spring({ frame: frame - 3, fps, config: { damping: 12, stiffness: 220 } });
  const outT = interpolate(frame, [CLIP_S * fps - 5, CLIP_S * fps], [0, 1], clamp);
  // Fenêtre de jeu : 16:9 en paysage, 2:3 en portrait, sous l'étiquette.
  const top = (land ? 150 : 190) * u;
  const maxH = height - top - (land ? 40 : 50) * u;
  const ratio = land ? 16 / 9 : 2 / 3;
  const vw = Math.min(width * (land ? 0.8 : 0.86), maxH * ratio);
  const vh = vw / ratio;
  const cat = CAT[c.cat];
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: (land ? 34 : 50) * u, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 22 * u, transform: `translateX(${(1 - labelS) * 140 * u}px)`, opacity: labelS * (1 - outT) }}>
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 26 * u, letterSpacing: 4 * u, color: cat.color, border: `${3 * u}px solid ${cat.color}`, borderRadius: 12 * u, padding: `${4 * u}px ${14 * u}px` }}>
          {String(i + 1).padStart(2, '0')}/{String(n).padStart(2, '0')}
        </span>
        <span style={{ fontFamily: serif, fontWeight: 900, fontSize: (land ? 76 : 80) * u, color: C.sepia, lineHeight: 1 }}>{c.title}</span>
      </div>
      <div
        style={{
          position: 'absolute',
          top,
          left: (width - vw) / 2,
          width: vw,
          height: vh,
          borderRadius: 28 * u,
          overflow: 'hidden',
          border: `${5 * u}px solid ${C.sepia}`,
          boxShadow: `0 ${26 * u}px ${70 * u}px rgba(44,24,16,0.35), 0 0 0 ${10 * u}px ${cat.color}`,
          transform: `translateX(${(1 - s) * width * 0.6 - outT * width * 0.25}px) rotate(${(1 - s) * 4}deg) scale(${1 + 0.03 * Math.exp(-frame / 6)})`,
          opacity: 1 - outT,
          background: '#000',
        }}
      >
        <OffthreadVideo src={staticFile(c.file)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    </AbsoluteFill>
  );
}

function End({ p }: { p: PortalTrailerProps }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const land = width > height;
  const u = Math.min(width, height) / 1080;
  const s = spring({ frame, fps, config: { damping: 10 } });
  const btn = spring({ frame: frame - 8, fps, config: { damping: 9, stiffness: 180 } });
  const pulse = 1 + 0.04 * Math.sin((frame / fps) * Math.PI * 4);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: land ? 'row' : 'column', gap: 50 * u }}>
      <div style={{ transform: `scale(${s}) rotate(${(1 - s) * -40}deg)` }}>
        <Globe size={(land ? 330 : 380) * u} spin={frame / fps * 2.5} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: land ? 'flex-start' : 'center', gap: 34 * u }}>
        <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 170 * u, color: C.sepia, lineHeight: 1, transform: `translateY(${(1 - s) * 50 * u}px)`, opacity: s }}>{p.name}</div>
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 32 * u, letterSpacing: 5 * u, color: C.brown, opacity: s }}>{p.tagline}</div>
        <div
          style={{
            background: C.vermilion,
            color: '#fff',
            fontFamily: mono,
            fontWeight: 700,
            fontSize: 56 * u,
            padding: `${22 * u}px ${54 * u}px`,
            borderRadius: 26 * u,
            boxShadow: `0 ${14 * u}px 0 #8a3210`,
            transform: `scale(${btn * pulse})`,
          }}
        >
          {p.cta}
        </div>
      </div>
    </AbsoluteFill>
  );
}

export function PortalTrailer(p: PortalTrailerProps) {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const t = frame / fps;
  const clipsEnd = INTRO_S + p.clips.length * CLIP_S;
  return (
    <AbsoluteFill>
      <Backdrop drift={t > INTRO_S && t < clipsEnd ? 3 : 1} />
      <Sequence durationInFrames={Math.round(INTRO_S * fps)}>
        <Intro p={p} />
      </Sequence>
      {p.clips.map((c, i) => (
        <Sequence key={c.file} from={Math.round((INTRO_S + i * CLIP_S) * fps)} durationInFrames={Math.round(CLIP_S * fps)}>
          <Clip c={c} i={i} n={p.clips.length} />
        </Sequence>
      ))}
      <Sequence from={Math.round(clipsEnd * fps)}>
        <End p={p} />
      </Sequence>
    </AbsoluteFill>
  );
}
