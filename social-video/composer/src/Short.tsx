/**
 * Un short 9:16 : accroche en haut, la vraie partie filmée sur l'app native au
 * centre dans un cadre de téléphone, sous-titres ponctuels, carte de fin.
 *
 * Zones sûres TikTok / Reels / Shorts : le haut (onglets) et le bas (légende,
 * boutons) sont recouverts par l'interface des apps, la colonne de droite par
 * les boutons j'aime / commenter. L'accroche commence donc sous 200 px et rien
 * d'important ne descend sous 1 650 px.
 *
 * Rythme « TikTok » : accroche mot par mot, téléphone qui zoome et tape à
 * chaque nouvelle question (`beats`, détectés par plan.mjs), confettis et
 * flash sur les sous-titres, montée avant la carte de fin, rayons et
 * confettis sur la carte. Musique et bruitages synthétisés par sounds.mjs
 * (public/sfx), voix off optionnelle (voice.mjs) par-dessus : la musique se
 * baisse quand il y a une voix.
 */
import { loadFont } from '@remotion/fonts';
import playfair800 from '@fontsource/playfair-display/files/playfair-display-latin-800-normal.woff2';
import montserrat600 from '@fontsource/montserrat/files/montserrat-latin-600-normal.woff2';
import montserrat800 from '@fontsource/montserrat/files/montserrat-latin-800-normal.woff2';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export const FPS = 30;
export const END_CARD_SECONDS = 2.5;

// Polices embarquées dans le bundle (pas de Google Fonts au rendu : la CI et
// les machines derrière un proxy n'y ont pas toujours accès).
const display = 'Playfair Display';
const sans = 'Montserrat';
loadFont({ family: display, url: playfair800, weight: '800' });
loadFont({ family: sans, url: montserrat600, weight: '600' });
loadFont({ family: sans, url: montserrat800, weight: '800' });

// Palette de l'app (src/theme/colors.ts).
const C = {
  nightDeep: '#0a1628',
  nightNavy: '#132040',
  nightBorder: '#2d4a70',
  parchment: '#f2e8d0',
  sand: '#c4872a',
  vermilion: '#c04a1a',
  forestGreen: '#2a6e3f',
};

export interface Caption {
  /** Secondes depuis le début de la partie montée (après trimStart, avant speed). */
  at: number;
  text: string;
  /** Durée d'affichage, 1,6 s par défaut. */
  seconds?: number;
}

export interface ShortProps {
  [key: string]: unknown;
  /** Vidéo brute dans public/ (copiée par render.mjs). */
  clip: string;
  /** Durée de la vidéo brute, mesurée par render.mjs (ffprobe). */
  clipSeconds: number;
  /** Secondes coupées au début de la vidéo brute. */
  trimStart: number;
  /** Vitesse de lecture : 1,15 resserre une partie un peu lente. */
  speed: number;
  hook: string;
  subhook?: string;
  captions?: Caption[];
  /** Changements de question dans la vidéo brute (secondes), détectés par plan.mjs. */
  beats?: number[];
  cta: string;
  ctaSub?: string;
  /** Icône de l'app dans public/, pour la carte de fin. */
  icon: string;
  /** Répliques de voix off déjà synthétisées (voice.mjs). */
  voice?: VoiceLine[];
  /** Durée de la carte de fin, allongée par voice.mjs pour la réplique finale. */
  endCardSeconds?: number;
  /** Musique et bruitages (public/sfx, sounds.mjs). Faux pour un rendu muet. */
  sound?: boolean;
}

export interface VoiceLine {
  /** Fichier dans public/ ; une réplique sans fichier est ignorée. */
  file?: string;
  /** Secondes depuis le début de la vidéo montée. */
  at?: number | null;
  /** Lue au début de la carte de fin plutôt qu'à `at`. */
  atEnd?: boolean;
}

export const endCardSeconds = (p: Pick<ShortProps, 'endCardSeconds'>) =>
  p.endCardSeconds ?? END_CARD_SECONDS;

// Le haut de l'écran seulement : les modes filmés tiennent dans les deux tiers
// supérieurs, le bas restait vide. Cadre plus large, texte de l'app plus lisible.
const PHONE_H = 1090;
const PHONE_TOP = 560;
const SCREEN_RATIO = '9 / 14';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Sous-titre « raté » : on le joue en rouge, avec secousse et boum. */
const isFail = (text: string) => /😬|💀|❌|😭|oh no|ah\.|raté|perdu/i.test(text);

/** 0 → 1 → 0 sur `len` images après `start` : impulsion pour zooms et flashs. */
const pulse = (frame: number, start: number, len: number) =>
  frame < start || frame > start + len ? 0 : Math.sin((Math.PI * (frame - start)) / len);

export const Short = (p: ShortProps) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const endStart = durationInFrames - Math.round(endCardSeconds(p) * fps);
  const inEnd = frame >= endStart;
  const sound = p.sound !== false;
  const hasVoice = (p.voice ?? []).some((l) => l.file);

  // Moments clés en images de la vidéo montée.
  const toFrame = (gameSeconds: number) => Math.round((gameSeconds / p.speed) * fps);
  const beatFrames = (p.beats ?? []).map(toFrame).filter((f) => f > fps && f < endStart - fps);
  const captionFrames = (p.captions ?? []).map((c) => ({ ...c, frame: toFrame(c.at), fail: isFail(c.text) }));

  const phoneIn = spring({ frame: frame - 6, fps, config: { damping: 11, mass: 0.8 } });
  const endIn = spring({ frame: frame - endStart, fps, config: { damping: 10, mass: 0.7 } });

  // Zoom lent sur toute la partie + petit coup de zoom à chaque question.
  const slowZoom = interpolate(frame, [0, endStart], [1, 1.05], clamp);
  const punch =
    beatFrames.reduce((s, b) => s + 0.045 * pulse(frame, b, 8), 0) +
    captionFrames.reduce((s, c) => s + 0.06 * pulse(frame, c.frame, 10), 0);
  const shake = captionFrames
    .filter((c) => c.fail)
    .reduce((s, c) => s + (frame >= c.frame && frame < c.frame + 14 ? 1 - (frame - c.frame) / 14 : 0), 0);
  const shakeX = shake * 18 * Math.sin(frame * 2.7);
  const shakeY = shake * 12 * Math.cos(frame * 3.1);
  const glow = beatFrames.reduce((s, b) => s + pulse(frame, b, 12), 0);

  // Avant la carte de fin : la partie grossit et part dans un flash.
  const outro = interpolate(frame, [endStart - 10, endStart], [0, 1], clamp);
  const flash = Math.max(
    interpolate(frame, [0, 5], [0.9, 0], clamp),
    interpolate(frame, [endStart - 3, endStart, endStart + 6], [0, 1, 0], clamp),
    ...captionFrames.map((c) => 0.35 * pulse(frame, c.frame, 6)),
  );

  const gameT = (frame / fps) * p.speed;
  const caption = captionFrames.find((c) => gameT >= c.at && gameT < c.at + (c.seconds ?? 1.6));
  const question = beatFrames.filter((b) => frame >= b).length + 1;

  const musicVolume = (f: number) =>
    (hasVoice ? 0.18 : 0.5) *
    interpolate(f, [0, 8, durationInFrames - 20, durationInFrames - 1], [0, 1, 1, 0], clamp);

  return (
    <AbsoluteFill style={{ background: C.nightDeep, fontFamily: sans, overflow: 'hidden' }}>
      <Backdrop frame={frame} />

      {sound ? (
        <>
          <Audio src={staticFile('sfx/music.wav')} volume={musicVolume} />
          <Audio src={staticFile('sfx/whoosh.wav')} volume={0.5} />
          {beatFrames.map((b) => (
            <Sequence key={`b${b}`} from={b} durationInFrames={10}>
              <Audio src={staticFile('sfx/pop.wav')} volume={0.35} />
            </Sequence>
          ))}
          {captionFrames.map((c) => (
            <Sequence key={`c${c.frame}`} from={c.frame} durationInFrames={40}>
              <Audio src={staticFile(c.fail ? 'sfx/boom.wav' : 'sfx/pop.wav')} volume={c.fail ? 0.8 : 0.6} />
            </Sequence>
          ))}
          <Sequence from={Math.max(0, endStart - 36)} durationInFrames={40}>
            <Audio src={staticFile('sfx/riser.wav')} volume={0.45} />
          </Sequence>
          <Sequence from={endStart} durationInFrames={45}>
            <Audio src={staticFile('sfx/ding.wav')} volume={0.55} />
          </Sequence>
        </>
      ) : null}

      {(p.voice ?? []).map((line, i) =>
        line.file ? (
          <Sequence key={i} from={line.atEnd ? endStart : Math.round((line.at ?? 0) * fps)}>
            <Audio src={staticFile(line.file)} />
          </Sequence>
        ) : null,
      )}

      <ProgressBar frame={frame} total={durationInFrames} />

      <AbsoluteFill
        style={{
          opacity: 1 - outro,
          transform: `scale(${1 + outro * 0.35}) translate(${shakeX}px, ${shakeY}px)`,
          filter: outro > 0 ? `blur(${outro * 12}px)` : undefined,
        }}
      >
        <Hook text={p.hook} sub={p.subhook} />

        {/* Téléphone */}
        <div
          style={{
            position: 'absolute',
            top: PHONE_TOP,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            transform: `translateY(${(1 - phoneIn) * 500}px) rotate(${(1 - phoneIn) * 8}deg) scale(${slowZoom + punch})`,
            transformOrigin: '50% 0%',
          }}
        >
          <div
            style={{
              position: 'relative',
              height: PHONE_H,
              aspectRatio: SCREEN_RATIO,
              borderRadius: 52,
              border: `14px solid #05080f`,
              boxShadow: `0 0 0 3px ${C.nightBorder}, 0 0 ${30 + 70 * glow}px ${10 + 20 * glow}px rgba(196,135,42,${0.25 + 0.5 * glow}), 0 40px 90px rgba(0,0,0,0.55)`,
              overflow: 'hidden',
              background: '#000',
            }}
          >
            <OffthreadVideo
              src={staticFile(p.clip)}
              trimBefore={Math.round(p.trimStart * fps)}
              playbackRate={p.speed}
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
            />
            {/* Reflet qui balaie l'écran à l'entrée */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.35) 50%, transparent 60%)',
                transform: `translateX(${interpolate(frame, [10, 34], [-120, 120], clamp)}%)`,
              }}
            />
          </div>
        </div>

        {beatFrames.length && phoneIn > 0.9 ? (
          <QuestionBadge n={question} frame={frame} beat={beatFrames.filter((b) => frame >= b).pop()} />
        ) : null}

        {caption ? <CaptionChip key={caption.frame} text={caption.text} start={caption.frame} fail={caption.fail} /> : null}
        {captionFrames.map((c) =>
          frame >= c.frame && frame < c.frame + 40 ? (
            <Burst key={c.frame} start={c.frame} seed={c.frame} emojis={c.fail ? ['😬', '💀', '❌'] : ['✨', '🎉', '🔥']} />
          ) : null,
        )}
      </AbsoluteFill>

      {inEnd ? <EndCard p={p} frame={frame - endStart} endIn={endIn} /> : null}

      {flash > 0 ? <AbsoluteFill style={{ background: '#fff', opacity: flash }} /> : null}
    </AbsoluteFill>
  );
};

/** Accroche mot par mot, chaque mot saute en place. */
const Hook = ({ text, sub }: { text: string; sub?: string }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Ponctuation et émojis restent collés au mot d'avant (« dessus ? 🤔 »).
  const words = text.split(' ').reduce<string[]>((acc, w) => {
    if (acc.length && !/[\p{L}\p{N}]/u.test(w)) acc[acc.length - 1] += ` ${w}`;
    else acc.push(w);
    return acc;
  }, []);
  const subIn = spring({ frame: frame - (words.length * 3 + 8), fps, config: { damping: 14 } });
  // Respiration légère une fois l'accroche posée.
  const breathe = 1 + 0.015 * Math.sin(frame / 9);
  return (
    <div style={{ position: 'absolute', top: 200, left: 60, right: 60, textAlign: 'center', transform: `scale(${breathe})` }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px 14px' }}>
        {words.map((w, i) => {
          const s = spring({ frame: frame - i * 3, fps, config: { damping: 9, mass: 0.5 } });
          return (
            <span
              key={i}
              style={{
                fontFamily: display,
                fontWeight: 800,
                fontSize: 76,
                lineHeight: 1.2,
                color: C.nightDeep,
                background: i === words.length - 1 ? C.sand : C.parchment,
                padding: '4px 18px 10px',
                borderRadius: 14,
                display: 'inline-block',
                opacity: Math.min(1, s * 2),
                transform: `translateY(${(1 - s) * 60}px) scale(${0.4 + 0.6 * s}) rotate(${(1 - s) * (i % 2 ? 10 : -10)}deg)`,
                boxShadow: '0 10px 0 rgba(0,0,0,0.25)',
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
      {sub ? (
        <div
          style={{
            marginTop: 26,
            fontSize: 44,
            fontWeight: 800,
            color: C.parchment,
            opacity: subIn,
            transform: `translateY(${(1 - subIn) * 20}px)`,
            textShadow: '0 4px 16px rgba(0,0,0,0.6)',
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
};

/** Numéro de question qui saute à chaque nouvelle question. */
const QuestionBadge = ({ n, frame, beat }: { n: number; frame: number; beat?: number }) => {
  const { fps } = useVideoConfig();
  const s = beat == null ? 1 : spring({ frame: frame - beat, fps, config: { damping: 8, mass: 0.4 } });
  return (
    <div
      style={{
        position: 'absolute',
        top: PHONE_TOP + 40,
        right: 150,
        fontSize: 40,
        fontWeight: 800,
        color: '#fff',
        background: C.vermilion,
        padding: '10px 26px',
        borderRadius: 999,
        border: `3px solid ${C.parchment}`,
        transform: `scale(${0.7 + 0.3 * s}) rotate(6deg)`,
        boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
      }}
    >
      Q{n}
    </div>
  );
};

const CaptionChip = ({ text, start, fail }: { text: string; start: number; fail: boolean }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - start, fps, config: { damping: 8, mass: 0.5 } });
  const wobble = Math.sin((frame - start) / 3) * 3 * Math.max(0, 1 - (frame - start) / 30);
  return (
    <div style={{ position: 'absolute', top: PHONE_TOP + 330, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          fontSize: 72,
          fontWeight: 800,
          color: '#fff',
          background: fail ? C.vermilion : C.forestGreen,
          border: `5px solid ${C.parchment}`,
          padding: '14px 44px',
          borderRadius: 28,
          transform: `scale(${pop * 1.05}) rotate(${(1 - pop) * -14 + wobble}deg)`,
          boxShadow: '0 14px 0 rgba(0,0,0,0.3), 0 20px 50px rgba(0,0,0,0.45)',
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** Gerbe d'émojis qui jaillit autour du sous-titre. */
const Burst = ({ start, seed, emojis }: { start: number; seed: number; emojis: string[] }) => {
  const frame = useCurrentFrame();
  const t = (frame - start) / 30;
  return (
    <>
      {Array.from({ length: 14 }, (_, i) => {
        const angle = random(`a${seed}-${i}`) * Math.PI * 2;
        const speed = 500 + random(`s${seed}-${i}`) * 700;
        const x = 540 + Math.cos(angle) * speed * t;
        const y = PHONE_TOP + 380 + Math.sin(angle) * speed * t * 0.8 + 900 * t * t;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x - 30,
              top: y - 30,
              fontSize: 60,
              opacity: Math.max(0, 1 - t * 1.1),
              transform: `rotate(${t * 400 * (i % 2 ? 1 : -1)}deg) scale(${Math.min(1, t * 8)})`,
            }}
          >
            {emojis[i % emojis.length]}
          </div>
        );
      })}
    </>
  );
};

const ProgressBar = ({ frame, total }: { frame: number; total: number }) => (
  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 12, background: 'rgba(255,255,255,0.12)' }}>
    <div
      style={{
        width: `${(frame / (total - 1)) * 100}%`,
        height: '100%',
        background: `linear-gradient(90deg, ${C.sand}, ${C.vermilion})`,
        boxShadow: `0 0 16px ${C.sand}`,
      }}
    />
  </div>
);

const EndCard = ({ p, frame, endIn }: { p: ShortProps; frame: number; endIn: number }) => {
  const { fps } = useVideoConfig();
  const iconIn = spring({ frame, fps, config: { damping: 7, mass: 0.6 } });
  const btn = 1 + 0.06 * Math.sin(frame / 4);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 34 }}>
      {/* Rayons qui tournent derrière l'icône */}
      <div
        style={{
          position: 'absolute',
          width: 1800,
          height: 1800,
          top: 960 - 900 - 240,
          left: 540 - 900,
          background: `repeating-conic-gradient(from ${frame * 1.5}deg, rgba(196,135,42,0.22) 0deg 10deg, transparent 10deg 20deg)`,
          maskImage: 'radial-gradient(circle, black 15%, transparent 60%)',
          WebkitMaskImage: 'radial-gradient(circle, black 15%, transparent 60%)',
          opacity: endIn,
        }}
      />
      <Img
        src={staticFile(p.icon)}
        style={{
          width: 280,
          height: 280,
          borderRadius: 62,
          transform: `scale(${iconIn}) rotate(${(1 - iconIn) * -25}deg)`,
          boxShadow: `0 0 ${60 + 30 * Math.sin(frame / 5)}px rgba(196,135,42,0.7)`,
        }}
      />
      <div style={{ fontFamily: display, fontWeight: 800, fontSize: 104, color: C.parchment, transform: `scale(${endIn})` }}>
        GeoG
      </div>
      <div
        style={{
          fontSize: 52,
          fontWeight: 800,
          color: C.parchment,
          textAlign: 'center',
          padding: '0 80px',
          opacity: endIn,
          transform: `translateY(${(1 - endIn) * 40}px)`,
        }}
      >
        {p.cta}
      </div>
      {p.ctaSub ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 46,
            fontWeight: 800,
            color: '#fff',
            background: C.vermilion,
            padding: '20px 50px',
            borderRadius: 999,
            transform: `scale(${endIn * btn})`,
            boxShadow: `0 0 0 ${6 + 6 * Math.sin(frame / 4)}px rgba(192,74,26,0.35), 0 12px 30px rgba(0,0,0,0.4)`,
          }}
        >
          {p.ctaSub} 👆
        </div>
      ) : null}
      <Confetti frame={frame} />
    </AbsoluteFill>
  );
};

/** Pluie de confettis aux couleurs de l'app. */
const Confetti = ({ frame }: { frame: number }) => {
  const colors = [C.sand, C.vermilion, C.parchment, C.forestGreen, '#4f8fd6'];
  return (
    <>
      {Array.from({ length: 60 }, (_, i) => {
        const x = random(`cx${i}`) * 1080;
        const delay = random(`cd${i}`) * 20;
        const fall = 6 + random(`cf${i}`) * 10;
        const y = -60 + (frame - delay) * fall;
        if (y < -60) return null;
        const sway = Math.sin((frame + i * 7) / 8) * 30;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x + sway,
              top: y,
              width: 18,
              height: 30,
              background: colors[i % colors.length],
              borderRadius: 4,
              transform: `rotate(${frame * (5 + (i % 7))}deg) scaleX(${Math.cos((frame + i) / 4)})`,
            }}
          />
        );
      })}
    </>
  );
};

/** Fond : dégradé nuit, taches de lumière qui dérivent, méridiens et parallèles. */
const Backdrop = ({ frame }: { frame: number }) => {
  const blobs = [
    { c: 'rgba(196,135,42,0.35)', x: 200, y: 400, r: 520, sx: 0.013, sy: 0.009 },
    { c: 'rgba(192,74,26,0.28)', x: 900, y: 1300, r: 600, sx: 0.011, sy: 0.015 },
    { c: 'rgba(79,143,214,0.25)', x: 700, y: 300, r: 480, sx: 0.017, sy: 0.012 },
  ];
  const shift = (frame * 0.6) % 120;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 35%, ${C.nightNavy} 0%, ${C.nightDeep} 75%)` }}>
      {blobs.map((b, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: b.x + Math.sin(frame * b.sx + i) * 160 - b.r / 2,
            top: b.y + Math.cos(frame * b.sy + i) * 160 - b.r / 2,
            width: b.r,
            height: b.r,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${b.c} 0%, transparent 70%)`,
          }}
        />
      ))}
      <svg width={1080} height={1920} style={{ position: 'absolute', opacity: 0.09 }}>
        {Array.from({ length: 12 }, (_, i) => (
          <line key={`v${i}`} x1={i * 120 - shift} y1={0} x2={i * 120 - shift} y2={1920} stroke={C.sand} strokeWidth={2} />
        ))}
        {Array.from({ length: 17 }, (_, i) => (
          <line key={`h${i}`} x1={0} y1={i * 120} x2={1080} y2={i * 120} stroke={C.sand} strokeWidth={2} />
        ))}
      </svg>
    </AbsoluteFill>
  );
};
