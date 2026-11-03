/**
 * Boîte à outils des concepts « atlas » : la charte de l'app (parchemin,
 * Playfair Display, Space Mono, vermillon / vert forêt / bleu océan), un fond
 * de carte ancienne qui respire, l'accroche mot par mot et la carte de fin.
 * Les bruitages viennent de l'app elle-même (public/app-sfx, copiés par
 * concepts.mjs) et la musique de sounds.mjs (public/sfx).
 */
import { loadFont } from '@remotion/fonts';
import mono400 from '@fontsource/space-mono/files/space-mono-latin-400-normal.woff2';
import mono700 from '@fontsource/space-mono/files/space-mono-latin-700-normal.woff2';
import playfair700 from '@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff2';
import playfair900 from '@fontsource/playfair-display/files/playfair-display-latin-900-normal.woff2';
import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

export const serif = 'Playfair Display';
export const mono = 'Space Mono';
loadFont({ family: serif, url: playfair700, weight: '700' });
loadFont({ family: serif, url: playfair900, weight: '900' });
loadFont({ family: mono, url: mono400, weight: '400' });
loadFont({ family: mono, url: mono700, weight: '700' });

export const FPS = 30;

// Mêmes valeurs que src/theme/colors.ts de l'app.
export const C = {
  parchment: '#f2e8d0',
  parchmentDark: '#e8d9b8',
  card: '#f7efdc',
  sepia: '#2c1810',
  brown: '#735735',
  tan: '#c4a87a',
  vermilion: '#c04a1a',
  green: '#2a6e3f',
  success: '#10B981',
  ocean: '#1a4a7a',
  sand: '#c4872a',
  red: '#8b1a1a',
};

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const sfx = (n: string) => staticFile(`sfx/${n}.wav`);
export const app = (n: string) => staticFile(`app-sfx/${n}.mp3`);
export const flag = (cc: string) => staticFile(`flags/${cc}.svg`);

/**
 * Ambiance sonore complète (packs.mjs) : musique et bruitages assortis. Sans
 * pack, chaque concept garde ses sons d'origine. `gain` égalise la musique
 * (mesurée en LUFS) avec celle d'origine.
 */
const PACK_GAIN: Record<string, number> = { lofi: 1.4, hype: 0.85, tele: 1.5 };
export const packOf = (name?: string) =>
  name
    ? {
        music: sfx(`${name}-music`),
        gain: PACK_GAIN[name] ?? 1,
        hit: sfx(`${name}-hit`),
        whoosh: sfx(`${name}-whoosh`),
        tick: sfx(`${name}-tick`),
        step: (i: number) => sfx(`${name}-step${Math.max(1, Math.min(8, i))}`),
        found: sfx(`${name}-found`),
        stamp: sfx(`${name}-stamp`),
        submit: sfx(`${name}-submit`),
        roll: sfx(`${name}-roll`),
        good: sfx(`${name}-good`),
        fail: sfx(`${name}-fail`),
        win: sfx(`${name}-win`),
      }
    : null;

/** Un son à `at` secondes (Sequence + Audio). */
export const Sfx = ({ at, src, volume = 0.8 }: { at: number; src: string; volume?: number }) => (
  <Sequence from={Math.round(at * FPS)} durationInFrames={FPS * 4} layout="none">
    <Audio src={src} volume={volume} />
  </Sequence>
);

/** Fond parchemin : grain, méridiens et parallèles qui dérivent, vignette sépia. */
export const Paper = ({ children, drift = 1 }: { children?: ReactNode; drift?: number }) => {
  const frame = useCurrentFrame();
  const off = (frame * 0.35 * drift) % 120;
  return (
    <AbsoluteFill style={{ background: C.parchment }}>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0, opacity: 0.22 }}>
        {Array.from({ length: 12 }, (_, i) => (
          <path
            key={`m${i}`}
            d={`M ${i * 120 - 120 + off} -20 Q ${i * 120 + 60 + off} 960 ${i * 120 - 120 + off} 1940`}
            stroke={C.brown}
            strokeWidth={1.4}
            fill="none"
          />
        ))}
        {Array.from({ length: 18 }, (_, i) => (
          <line key={`p${i}`} x1={0} x2={1080} y1={i * 120 - off / 2} y2={i * 120 - off / 2} stroke={C.brown} strokeWidth={1} strokeDasharray="2 10" />
        ))}
      </svg>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(84,52,20,0.32) 100%)' }} />
      {children}
    </AbsoluteFill>
  );
};

/** Accroche mot par mot, dernier mot en vermillon souligné. */
export const Hook = ({ lines, y = 170, size = 92, delay = 0 }: { lines: string[]; y?: number; size?: number; delay?: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = lines.flatMap((l, li) => l.split(' ').map((w) => ({ w, li })));
  return (
    <div style={{ position: 'absolute', top: y, left: 50, right: 50, textAlign: 'center', fontFamily: serif, fontWeight: 900, fontSize: size, lineHeight: 1.08, color: C.sepia }}>
      {lines.map((_, li) => (
        <div key={li}>
          {words.map((x, i) => {
            if (x.li !== li) return null;
            // Sans délai, l'accroche est entière et lisible dès la première image
            // (c'est elle qui décide du swipe) : les mots ne font qu'un petit rebond.
            const s = delay === 0
              ? 0.85 + 0.15 * spring({ frame: frame - i, fps, config: { damping: 9, stiffness: 220 } })
              : spring({ frame: frame - delay - i * 3, fps, config: { damping: 11, stiffness: 180 } });
            const last = i === words.length - 1;
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  margin: '0 12px',
                  transform: `translateY(${(1 - s) * 50}px) scale(${0.6 + 0.4 * s})`,
                  opacity: Math.min(1, s * 1.5),
                  color: last ? C.vermilion : C.sepia,
                  fontStyle: last ? 'italic' : 'normal',
                }}
              >
                {x.w}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** Petite étiquette Space Mono en capitales (« QUESTION 1/5 », « MOYEN »…). */
export const Tag = ({ children, color = C.vermilion, style }: { children: ReactNode; color?: string; style?: CSSProperties }) => (
  <span
    style={{
      fontFamily: mono,
      fontWeight: 700,
      fontSize: 30,
      letterSpacing: 4,
      color,
      border: `3px solid ${color}`,
      borderRadius: 12,
      padding: '6px 18px',
      textTransform: 'uppercase',
      ...style,
    }}
  >
    {children}
  </span>
);

/** Tampon qui s'écrase sur la page (bonne réponse, score…). */
export const Stamp = ({ text, at, color = C.green, rotate = -8, size = 120, top = 820 }: { text: string; at: number; color?: string; rotate?: number; size?: number; top?: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame - at * fps;
  if (t < 0) return null;
  const s = spring({ frame: t, fps, config: { damping: 9, stiffness: 260 } });
  return (
    <div style={{ position: 'absolute', top, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          transform: `rotate(${rotate}deg) scale(${interpolate(s, [0, 1], [2.6, 1])})`,
          opacity: Math.min(1, s * 2),
          border: `10px solid ${color}`,
          borderRadius: 24,
          padding: '10px 40px',
          color,
          fontFamily: serif,
          fontWeight: 900,
          fontSize: size,
          background: 'rgba(242,232,208,0.85)',
          boxShadow: '0 20px 60px rgba(44,24,16,0.25)',
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** Badges App Store et Google Play, dessinés (pas d'image à télécharger). */
const StoreBadge = ({ store, lang }: { store: 'apple' | 'google'; lang?: string }) => {
  const en = lang === 'en';
  const top = store === 'apple' ? (en ? 'Download on the' : 'Télécharger dans') : en ? 'GET IT ON' : 'DISPONIBLE SUR';
  const name = store === 'apple' ? 'App Store' : 'Google Play';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, background: '#000', color: '#fff', borderRadius: 22, padding: '16px 30px 16px 22px', border: '3px solid #a6a6a6', minWidth: 380 }}>
      {store === 'apple' ? (
        <svg width={62} height={74} viewBox="0 0 84 100">
          <path fill="#fff" d="M69 53c0-12 10-18 10-18-6-8-15-9-18-9-8-1-15 4-19 4s-10-4-17-4C16 26 5 34 5 52c0 11 4 23 9 31 5 7 10 15 17 15s9-4 17-4 10 4 17 4 12-8 16-15c5-8 7-15 7-16 0 0-19-7-19-14z" />
          <path fill="#fff" d="M57 15c4-5 6-11 5-15-5 0-12 3-16 8-3 4-6 10-5 15 6 0 12-3 16-8z" />
        </svg>
      ) : (
        <svg width={62} height={68} viewBox="0 0 90 100">
          <path fill="#00d7fe" d="M4 3l47 47L4 97c-2-1-3-3-3-6V9c0-3 1-5 3-6z" />
          <path fill="#ffce00" d="M66 35l17 10c5 3 5 7 0 10L66 65 51 50z" />
          <path fill="#ff3a44" d="M66 65L51 50 4 97c2 1 5 1 8-1z" />
          <path fill="#00f076" d="M66 35L12 4C9 2 6 2 4 3l47 47z" />
        </svg>
      )}
      <div style={{ textAlign: 'left', lineHeight: 1.05 }}>
        <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 24, letterSpacing: store === 'google' ? 1 : 0 }}>{top}</div>
        <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontWeight: 700, fontSize: 48 }}>{name}</div>
      </div>
    </div>
  );
};

/**
 * Carte de fin, pensée pour faire venir dans l'app (relevé Instagram du 03/11 :
 * 1,2 % des vues vont au profil mais 36 % de ces visites ouvrent le lien) :
 * « Joue à la suite gratuitement », GeoG en grand avec les badges des stores,
 * « Cherche GeoG » (TikTok n'a pas de lien en bio) et « lien en bio » (Instagram).
 * La même vidéo part sur toutes les plateformes, d'où les deux appels.
 * `title`, `cta` et `ctaSub` restent acceptés pour les anciens appels mais ne s'affichent plus.
 */
export const EndCard = ({ icon, start, lang }: { title?: string; sub?: string; cta?: string; ctaSub?: string; icon: string; start: number; lang?: string }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame - start * fps;
  if (t < 0) return null;
  const en = lang === 'en';
  const s = spring({ frame: t, fps, config: { damping: 10 } });
  const iconS = spring({ frame: t - 6, fps, config: { damping: 7, stiffness: 160 } });
  const badges = spring({ frame: t - 14, fps, config: { damping: 11 } });
  const pulse = 1 + 0.05 * Math.sin((t / fps) * Math.PI * 3);
  const bob = Math.sin((t / fps) * Math.PI * 2) * 10;
  return (
    <AbsoluteFill style={{ opacity: Math.min(1, s * 2) }}>
      <Paper drift={2}>
        {Array.from({ length: 30 }, (_, i) => {
          const x = random(`x${i}`) * 1080;
          const fall = ((t * (3 + random(`v${i}`) * 5) + random(`y${i}`) * 1900) % 2100) - 100;
          const colors = [C.vermilion, C.green, C.ocean, C.sand];
          return <div key={i} style={{ position: 'absolute', left: x, top: fall, width: 18, height: 30, background: colors[i % 4], transform: `rotate(${t * 6 + i * 40}deg)`, opacity: 0.5, borderRadius: 3 }} />;
        })}
        <div style={{ position: 'absolute', top: 200, left: 0, right: 0, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 92, color: C.sepia, lineHeight: 1.08, padding: '0 70px', transform: `translateY(${(1 - s) * 40}px)` }}>
            {en ? 'Play the next one free' : 'Joue à la suite gratuitement'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 36, marginTop: 60 }}>
            <Img src={staticFile(icon)} style={{ width: 210, height: 210, borderRadius: 48, transform: `scale(${iconS}) rotate(${(1 - iconS) * -30}deg)`, boxShadow: '0 30px 80px rgba(44,24,16,0.35)' }} />
            <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 190, color: C.sepia, lineHeight: 1 }}>GeoG</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, marginTop: 60, opacity: badges, transform: `translateY(${(1 - badges) * 60}px)` }}>
            <StoreBadge store="apple" lang={lang} />
            <StoreBadge store="google" lang={lang} />
          </div>
          <div
            style={{
              marginTop: 56, background: C.vermilion, color: '#fff', fontFamily: mono, fontWeight: 700, fontSize: 52,
              padding: '24px 50px', borderRadius: 26, transform: `scale(${pulse})`, boxShadow: '0 16px 0 #8a3210',
            }}
          >
            {en ? 'Search “GeoG” 🔍' : 'Cherche « GeoG » 🔍'}
          </div>
          <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 44, color: C.brown, marginTop: 50, transform: `translateY(${bob}px)` }}>
            {en ? 'or link in bio 👆' : 'ou lien en bio 👆'}
          </div>
        </div>
      </Paper>
    </AbsoluteFill>
  );
};

export type VoiceLine = { file?: string; at?: number | null; seconds?: number };

/** Voix off (fichiers posés par voice.mjs). */
export const VoiceTrack = ({ voice }: { voice?: VoiceLine[] }) => (
  <>
    {(voice ?? []).map((v, i) => (v.file && v.at != null ? <Sfx key={`v${i}`} at={v.at} src={staticFile(v.file)} volume={1} /> : null))}
  </>
);

/** Vrai pendant une réplique de voix off : la musique baisse dessous. */
export const speaking = (voice: VoiceLine[] | undefined, s: number) =>
  (voice ?? []).some((v) => v.file && v.at != null && s >= v.at - 0.1 && s <= v.at + (v.seconds ?? 1.5) + 0.1);

/** Volume de musique : fondu d'entrée/sortie, plus bas sous la voix. */
export const musicVolume = (voice: VoiceLine[] | undefined, s: number, base: number, end: number) => {
  const v = interpolate(s, [0, 0.3, end + 3, end + 4], [0, base, base, 0], clamp);
  return speaking(voice, s) ? v * 0.35 : v;
};

/** Barre de progression fine en haut, couleur vermillon. */
export const Progress = ({ total }: { total: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, height: 12, width: `${interpolate(frame, [0, total * fps], [0, 100], clamp)}%`, background: C.vermilion }} />
  );
};
