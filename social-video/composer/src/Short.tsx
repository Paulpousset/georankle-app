/**
 * Un short 9:16 : la vraie partie filmée sur l'app native, en grand et
 * lisible, avec l'accroche en haut, des sous-titres ponctuels et une carte de
 * fin.
 *
 * Zones sûres TikTok / Reels / Shorts : le haut (onglets) et le bas (légende,
 * boutons) sont recouverts par l'interface des apps, la colonne de droite par
 * les boutons j'aime / commenter. L'accroche commence donc sous 190 px et rien
 * d'important ne descend sous 1 650 px.
 *
 * Rendu « pro » : tout est en place dès la première image (accroche lisible,
 * écran déjà là), fond = la partie elle-même floutée (plan.mjs), écran qui
 * flotte en 3D, petit travelling à chaque question (`beats`), flash et fuite
 * de lumière aux sauts du montage serré (`jumps`), grain, vignette, carte de
 * fin dans le style du quiz globe. Musique et bruitages synthétisés par
 * sounds.mjs (public/sfx), voix off optionnelle (voice.mjs) par-dessus : la
 * musique se baisse quand il y a une voix.
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
import { ArcadeShort, MemeShort, SuspenseShort } from './formats';

export const FPS = 30;
export const END_CARD_SECONDS = 2.5;

// Polices embarquées dans le bundle (pas de Google Fonts au rendu : la CI et
// les machines derrière un proxy n'y ont pas toujours accès).
const display = 'Playfair Display';
const sans = 'Montserrat';
loadFont({ family: display, url: playfair800, weight: '800' });
loadFont({ family: sans, url: montserrat600, weight: '600' });
loadFont({ family: sans, url: montserrat800, weight: '800' });

const C = {
  space: '#050a16',
  parchment: '#f2e8d0',
  gold: '#f5b942',
  red: '#ff3b4a',
  green: '#2fbf71',
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
  /** Vidéo de la partie dans public/ (montée par plan.mjs, copiée par render.mjs). */
  clip: string;
  /** Même partie floutée en basse définition pour le fond (plan.mjs). */
  background?: string;
  /** Durée de la vidéo, mesurée par plan.mjs (ffprobe). */
  clipSeconds: number;
  /** Secondes coupées au début de la vidéo. */
  trimStart: number;
  /** Vitesse de lecture (plan.mjs accélère déjà la partie : 1 par défaut). */
  speed: number;
  hook: string;
  subhook?: string;
  captions?: Caption[];
  /** Changements de question (secondes), détectés par plan.mjs. */
  beats?: number[];
  /** Sauts du montage serré (secondes) : questions coupées. */
  jumps?: number[];
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
  /** Style du montage : cinema (défaut), immersif, neon, ou les concepts de formats.tsx (meme, suspense, arcade). */
  look?: Look;
}

/**
 * - cinema : écran qui flotte en 3D sur la partie floutée, tons dorés.
 * - immersif : l'app plein écran, sous-titres géants façon TikTok.
 * - neon : écran cerclé de néon sur une grille qui défile, effets arcade.
 */
export type Look = 'cinema' | 'immersif' | 'neon' | 'meme' | 'suspense' | 'arcade';

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

// Vidéo brute de l'émulateur : 720×1136, barre d'état en haut (coupée).
const RAW_W = 720;
const RAW_H = 1136;
const STATUS_BAR = 52;
// Écran affiché : 864 px de large (×1,2) sous l'accroche, ou toute la
// largeur (×1,5) en immersif ; du haut de l'app au bas de la vidéo.
const geometry = (look: 'cinema' | 'immersif' | 'neon') => {
  const scale = look === 'immersif' ? 1.5 : 1.2;
  const top = look === 'immersif' ? 330 : 385;
  return { scale, top, w: RAW_W * scale, h: Math.min((RAW_H - STATUS_BAR) * scale - 40, 1920 - top) };
};
const NEON = ['#00e5ff', '#ff2bd6'];

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Sous-titre « raté » : on le joue en rouge, avec secousse et boum. */
const isFail = (text: string) => /😬|💀|❌|😭|oh no|ah\.|raté|perdu/i.test(text);

/** 0 → 1 → 0 sur `len` images après `start` : impulsion pour zooms et flashs. */
const pulse = (frame: number, start: number, len: number) =>
  frame < start || frame > start + len ? 0 : Math.sin((Math.PI * (frame - start)) / len);

/** 1 au moment `start`, décroît ensuite (exponentielle). */
const decay = (frame: number, start: number, rate: number) => (frame < start ? 0 : Math.exp(-(frame - start) / rate));

const goldText = {
  background: 'linear-gradient(180deg, #fff6dc 10%, #f5b942 90%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
} as const;

export const Short = (p: ShortProps) => {
  if (p.look === 'meme') return <MemeShort {...p} />;
  if (p.look === 'suspense') return <SuspenseShort {...p} />;
  if (p.look === 'arcade') return <ArcadeShort {...p} />;
  return <ClassicShort {...p} />;
};

const ClassicShort = (p: ShortProps) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const endStart = durationInFrames - Math.round(endCardSeconds(p) * fps);
  const inEnd = frame >= endStart;
  const sound = p.sound !== false;
  const look = (p.look ?? 'cinema') as 'cinema' | 'immersif' | 'neon';
  const g = geometry(look);
  const hasVoice = (p.voice ?? []).some((l) => l.file);

  // Moments clés en images de la vidéo montée.
  const toFrame = (gameSeconds: number) => Math.round((gameSeconds / p.speed) * fps);
  const beatFrames = (p.beats ?? []).map(toFrame).filter((f) => f > fps && f < endStart - fps);
  const jumpFrames = (p.jumps ?? []).map(toFrame).filter((f) => f > 0 && f < endStart);
  const captionFrames = (p.captions ?? []).map((c) => ({ ...c, frame: toFrame(c.at), fail: isFail(c.text) }));
  const failFrame = captionFrames.find((c) => c.fail)?.frame;

  // Caméra : léger recul au départ, travelling lent, petit zoom à chaque
  // question et coup de zoom aux sauts du montage.
  const settle = 1 + 0.06 * decay(frame, 0, 6);
  const slowZoom = interpolate(frame, [0, endStart], [1, 1.04], clamp);
  const beatZoom = beatFrames.reduce((s, b) => s + 0.035 * pulse(frame, b, 14), 0);
  const jumpZoom = jumpFrames.reduce((s, j) => s + 0.12 * decay(frame, j, 4), 0);
  const zoom = settle * slowZoom + beatZoom + jumpZoom;
  // Flou de mouvement pendant les coups de zoom.
  const motionBlur = Math.min(6, jumpFrames.reduce((s, j) => s + 8 * decay(frame, j, 3), 0) + beatFrames.reduce((s, b) => s + 1.5 * pulse(frame, b, 6), 0));

  const shake = captionFrames
    .filter((c) => c.fail)
    .reduce((s, c) => s + (frame >= c.frame && frame < c.frame + 16 ? 1 - (frame - c.frame) / 16 : 0), 0);
  const shakeX = shake * 22 * (random(`sx${frame}`) - 0.5) * 2;
  const shakeY = shake * 14 * (random(`sy${frame}`) - 0.5) * 2;
  const glow = beatFrames.reduce((s, b) => s + pulse(frame, b, 14), 0);
  // Écran qui flotte : rotation 3D lente.
  const tiltY = look === 'immersif' ? 0 : 3.5 * Math.sin(frame / 38);
  const tiltX = look === 'immersif' ? 0 : 2 + 1.5 * Math.sin(frame / 51);
  // Néon : décalage rouge / bleu (aberration chromatique) aux sauts et au raté.
  const rgb = look === 'neon' ? Math.min(14, jumpFrames.reduce((s, j) => s + 14 * decay(frame, j, 4), 0) + shake * 12) : 0;
  const neon = NEON[Math.floor(frame / 45) % 2];
  const frameStyle =
    look === 'immersif'
      ? { borderRadius: 0, boxShadow: '0 -30px 60px rgba(0,0,0,0.5)' }
      : look === 'neon'
        ? {
            borderRadius: 36,
            boxShadow: `0 0 0 4px ${neon}, 0 0 ${30 + 60 * glow}px ${6 + 14 * glow}px ${neon}aa, inset 0 0 30px ${neon}55, 0 50px 120px rgba(0,0,0,0.8)`,
          }
        : {
            borderRadius: 44,
            boxShadow: `0 0 0 2px rgba(255,255,255,0.25), 0 0 ${40 + 80 * glow}px ${8 + 16 * glow}px rgba(245,185,66,${0.18 + 0.4 * glow}), 0 50px 120px rgba(0,0,0,0.75)`,
          };
  const filters = [
    motionBlur > 0.3 ? `blur(${motionBlur.toFixed(2)}px)` : '',
    rgb > 0.5 ? `drop-shadow(${rgb.toFixed(1)}px 0 0 rgba(255,0,80,0.75)) drop-shadow(${(-rgb).toFixed(1)}px 0 0 rgba(0,220,255,0.75))` : '',
  ].join(' ').trim();

  // Avant la carte de fin : la partie grossit et part dans un flash.
  const outro = interpolate(frame, [endStart - 10, endStart], [0, 1], clamp);
  const flash = Math.max(
    interpolate(frame, [endStart - 3, endStart, endStart + 6], [0, 1, 0], clamp),
    ...jumpFrames.map((j) => 0.7 * decay(frame, j, 3)),
    ...captionFrames.map((c) => (c.fail ? 0 : 0.25 * pulse(frame, c.frame, 6))),
  );
  const redFlash = failFrame == null ? 0 : 0.55 * decay(frame, failFrame, 8);

  const gameT = (frame / fps) * p.speed;
  const caption = captionFrames.find((c) => gameT >= c.at && gameT < c.at + (c.seconds ?? 1.6));

  const musicVolume = (f: number) =>
    (hasVoice ? 0.18 : 0.5) *
    interpolate(f, [0, 4, durationInFrames - 20, durationInFrames - 1], [0, 1, 1, 0], clamp);

  return (
    <AbsoluteFill style={{ background: C.space, fontFamily: sans, overflow: 'hidden' }}>
      {look === 'neon' ? <NeonBackdrop frame={frame} /> : <Backdrop p={p} frame={frame} />}

      {sound ? (
        <>
          <Audio src={staticFile('sfx/music.wav')} volume={musicVolume} />
          <Audio src={staticFile('sfx/boom.wav')} volume={0.7} />
          {beatFrames.map((b) => (
            <Sequence key={`b${b}`} from={b} durationInFrames={30}>
              <Audio src={staticFile('sfx/whoosh.wav')} volume={0.3} />
            </Sequence>
          ))}
          {jumpFrames.map((j) => (
            <Sequence key={`j${j}`} from={Math.max(0, j - 4)} durationInFrames={40}>
              <Audio src={staticFile('sfx/whoosh.wav')} volume={0.7} />
            </Sequence>
          ))}
          {captionFrames.map((c) => (
            <Sequence key={`c${c.frame}`} from={c.frame} durationInFrames={40}>
              <Audio src={staticFile(c.fail ? 'sfx/boom.wav' : 'sfx/pop.wav')} volume={c.fail ? 0.9 : 0.6} />
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

      <AbsoluteFill
        style={{
          opacity: 1 - outro,
          transform: `scale(${1 + outro * 0.35}) translate(${shakeX}px, ${shakeY}px)`,
          filter: outro > 0 ? `blur(${outro * 12}px)` : undefined,
        }}
      >
        {/* Écran de l'app */}
        <div style={{ position: 'absolute', top: g.top, left: 0, right: 0, display: 'flex', justifyContent: 'center', perspective: 2200 }}>
          <div
            style={{
              position: 'relative',
              width: g.w,
              height: g.h,
              overflow: 'hidden',
              background: '#000',
              transform: `rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(${zoom})`,
              transformOrigin: '50% 30%',
              filter: filters || undefined,
              ...frameStyle,
            }}
          >
            <OffthreadVideo
              src={staticFile(p.clip)}
              trimBefore={Math.round(p.trimStart * fps)}
              playbackRate={p.speed}
              muted
              style={{ position: 'absolute', left: 0, top: -STATUS_BAR * g.scale, width: g.w, height: RAW_H * g.scale }}
            />
            {/* Reflet de vitre fixe + reflet qui balaie l'écran au départ */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(255,255,255,0.12) 0%, transparent 28%, transparent 70%, rgba(0,0,0,0.18) 100%)' }} />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.35) 50%, transparent 60%)',
                transform: `translateX(${interpolate(frame, [4, 26], [-120, 120], clamp)}%)`,
              }}
            />
          </div>
        </div>

        {caption ? <CaptionChip key={caption.frame} text={caption.text} start={caption.frame} fail={caption.fail} look={look} top={g.top} /> : null}
        {captionFrames.map((c) =>
          frame >= c.frame && frame < c.frame + 36 ? (
            <Sparks key={c.frame} start={c.frame} seed={c.frame} top={g.top} color={c.fail ? C.red : look === 'neon' ? neon : C.gold} />
          ) : null,
        )}

        {/* Bandeau sombre derrière l'accroche, puis l'accroche */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: look === 'immersif' ? 470 : 520, background: 'linear-gradient(180deg, rgba(3,6,15,0.92) 0%, rgba(3,6,15,0.75) 55%, transparent 100%)' }} />
        <Hook text={p.hook} look={look} />
      </AbsoluteFill>

      {/* Fuites de lumière aux sauts et à la première image */}
      {look === 'neon'
        ? null
        : [0, ...jumpFrames].map((j, i) => <LightLeak key={`l${j}`} p={(frame - j + 4) / 22} seed={i} />)}

      {/* Vignette cinéma + grain */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 80% 65% at 50% 50%, transparent 55%, rgba(0,0,0,0.65) 100%)' }} />
      {redFlash > 0.01 ? (
        <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 60% at 50% 50%, transparent 30%, rgba(255,30,50,${redFlash}) 100%)` }} />
      ) : null}
      <Grain frame={frame} />

      {inEnd ? <EndCard p={p} frame={frame - endStart} /> : null}

      <ProgressBar frame={frame} total={durationInFrames} />
      {flash > 0.01 ? <AbsoluteFill style={{ background: '#fff', opacity: flash }} /> : null}
    </AbsoluteFill>
  );
};

/** Accroche : lisible dès la première image, les mots arrivent en cascade rapide. */
const Hook = ({ text, look }: { text: string; look: Look }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Ponctuation et émojis restent collés au mot d'avant (« dessus ? 🤔 »).
  const words = text.split(' ').reduce<string[]>((acc, w) => {
    if (acc.length && !/[\p{L}\p{N}]/u.test(w)) acc[acc.length - 1] += ` ${w}`;
    else acc.push(w);
    return acc;
  }, []);
  const breathe = 1 + 0.012 * Math.sin(frame / 9);
  const size = (text.length > 30 ? 72 : 84) * (look === 'cinema' ? 1 : 0.92);
  return (
    <div
      style={{
        position: 'absolute',
        top: 190,
        left: 50,
        right: 50,
        height: 180,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `scale(${breathe})`,
      }}
    >
      <div style={{ textAlign: 'center', textWrap: 'balance', maxWidth: 960 }}>
      {words.map((w, i) => {
        // Tous les mots sont déjà lisibles à la première image.
        const s = spring({ frame: frame - i * 1.2 + 12, fps, config: { damping: 11, mass: 0.45 } });
        const accent = i === words.length - 1;
        return (
          <span
            key={i}
            style={{
              fontFamily: look === 'cinema' ? display : sans,
              fontWeight: 800,
              fontSize: size,
              lineHeight: 1.12,
              display: 'inline-block',
              margin: '0 9px',
              ...(look === 'cinema'
                ? accent
                  ? goldText
                  : { color: '#fff' }
                : look === 'neon'
                  ? { color: '#fff', textTransform: 'uppercase' as const, textShadow: `0 0 18px ${accent ? NEON[1] : NEON[0]}, 0 0 4px ${accent ? NEON[1] : NEON[0]}` }
                  : { color: accent ? '#ffe14a' : '#fff', textTransform: 'uppercase' as const, WebkitTextStroke: '3px #000', paintOrder: 'stroke fill' }),
              opacity: Math.min(1, s * 1.6),
              transform: `translateY(${(1 - s) * 40}px) scale(${0.6 + 0.4 * s})`,
              filter: 'drop-shadow(0 6px 22px rgba(0,0,0,0.9))',
            }}
          >
            {w}
          </span>
        );
      })}
      </div>
    </div>
  );
};

const CaptionChip = ({ text, start, fail, look, top }: { text: string; start: number; fail: boolean; look: Look; top: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - start, fps, config: { damping: 9, mass: 0.5 } });
  const color = fail ? C.red : look === 'neon' ? NEON[0] : C.gold;
  if (look === 'immersif') {
    // Sous-titre géant, sans cadre, contour noir épais.
    return (
      <div style={{ position: 'absolute', top: top + 420, left: 40, right: 40, display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            fontFamily: sans,
            fontSize: 150,
            fontWeight: 800,
            textTransform: 'uppercase',
            color: fail ? '#ff3b4a' : '#ffe14a',
            WebkitTextStroke: '10px #000',
            paintOrder: 'stroke fill',
            textAlign: 'center',
            transform: `scale(${0.3 + 0.75 * pop}) rotate(${(1 - pop) * -10}deg)`,
            opacity: Math.min(1, pop * 2),
            filter: 'drop-shadow(0 12px 0 rgba(0,0,0,0.45))',
          }}
        >
          {text}
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', top: top + 470, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          fontFamily: look === 'neon' ? sans : display,
          fontSize: 92,
          textTransform: look === 'neon' ? 'uppercase' : undefined,
          fontWeight: 800,
          color: '#fff',
          background: 'rgba(5,10,22,0.78)',
          border: `4px solid ${color}`,
          padding: '12px 56px 20px',
          borderRadius: 30,
          transform: `scale(${0.5 + 0.55 * pop}) rotate(${(1 - pop) * -8}deg)`,
          opacity: Math.min(1, pop * 2),
          boxShadow: `0 0 60px ${color}88, 0 24px 60px rgba(0,0,0,0.6)`,
          textShadow: `0 0 30px ${color}`,
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** Éclats lumineux autour du sous-titre. */
const Sparks = ({ start, seed, color, top }: { start: number; seed: number; color: string; top: number }) => {
  const frame = useCurrentFrame();
  const t = (frame - start) / 30;
  const cx = 540;
  const cy = top + 540;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: cx - 40,
          top: cy - 40,
          width: 80,
          height: 80,
          borderRadius: '50%',
          border: `6px solid ${color}`,
          transform: `scale(${1 + t * 16})`,
          opacity: Math.max(0, 0.8 * (1 - t / 0.6)),
        }}
      />
      {Array.from({ length: 26 }, (_, i) => {
        const angle = random(`a${seed}-${i}`) * Math.PI * 2;
        const speed = 300 + random(`s${seed}-${i}`) * 600;
        const d = (speed * (1 - Math.exp(-t * 4))) / 1.6;
        const size = 6 + random(`z${seed}-${i}`) * 10;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: cx + Math.cos(angle) * d - size / 2,
              top: cy + Math.sin(angle) * d * 0.8 + 200 * t * t - size / 2,
              width: size,
              height: size,
              borderRadius: '50%',
              background: i % 4 ? color : '#fff',
              boxShadow: `0 0 12px ${color}`,
              opacity: Math.max(0, 1 - t / 1.2),
            }}
          />
        );
      })}
    </>
  );
};

// Fuite de lumière chaude qui balaie l'écran.
const LightLeak = ({ p, seed }: { p: number; seed: number }) => {
  if (p <= 0 || p >= 1) return null;
  const a = Math.sin(Math.PI * p);
  const x = -20 + 140 * ease(p);
  const y = 20 + 50 * random(`ly${seed}`);
  return (
    <AbsoluteFill
      style={{
        mixBlendMode: 'screen',
        opacity: 0.6 * a,
        background: `radial-gradient(ellipse 55% 35% at ${x}% ${y}%, rgba(255,170,80,0.9), rgba(255,80,60,0.35) 45%, transparent 75%),
          radial-gradient(ellipse 40% 60% at ${100 - x}% ${100 - y}%, rgba(255,90,170,0.5), transparent 70%)`,
      }}
    />
  );
};

/** Grain de pellicule, différent à chaque image. */
const Grain = ({ frame }: { frame: number }) => (
  <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0, opacity: 0.07, mixBlendMode: 'overlay' }}>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={frame % 50} />
    </filter>
    <rect width="100%" height="100%" filter="url(#grain)" />
  </svg>
);

const ProgressBar = ({ frame, total }: { frame: number; total: number }) => (
  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 10, background: 'rgba(255,255,255,0.1)' }}>
    <div
      style={{
        width: `${(frame / (total - 1)) * 100}%`,
        height: '100%',
        background: `linear-gradient(90deg, ${C.gold}, ${C.red})`,
        boxShadow: `0 0 16px ${C.gold}`,
      }}
    />
  </div>
);

const EndCard = ({ p, frame }: { p: ShortProps; frame: number }) => {
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 10, mass: 0.7 } });
  const s2 = spring({ frame: frame - 8, fps, config: { damping: 12 } });
  const btn = 1 + 0.05 * Math.sin(frame / 4);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 34, background: `rgba(3,6,15,${0.6 * s})` }}>
      {/* Halo qui tourne derrière l'icône */}
      <div
        style={{
          position: 'absolute',
          width: 1600,
          height: 1600,
          top: 960 - 800 - 220,
          left: 540 - 800,
          background: `repeating-conic-gradient(from ${frame * 1.2}deg, rgba(245,185,66,0.16) 0deg 8deg, transparent 8deg 16deg)`,
          maskImage: 'radial-gradient(circle, black 10%, transparent 55%)',
          WebkitMaskImage: 'radial-gradient(circle, black 10%, transparent 55%)',
          opacity: s,
        }}
      />
      <Img
        src={staticFile(p.icon)}
        style={{
          width: 260,
          height: 260,
          borderRadius: 58,
          transform: `scale(${s})`,
          boxShadow: `0 0 ${60 + 30 * Math.sin(frame / 5)}px rgba(245,185,66,0.65), 0 20px 50px rgba(0,0,0,0.6)`,
        }}
      />
      <div style={{ fontFamily: display, fontWeight: 800, fontSize: 112, ...goldText, transform: `scale(${s})`, filter: 'drop-shadow(0 8px 30px rgba(0,0,0,0.8))' }}>
        GeoG
      </div>
      <div style={{ fontSize: 50, fontWeight: 800, color: '#fff', textAlign: 'center', padding: '0 80px', opacity: s2, transform: `translateY(${(1 - s2) * 40}px)` }}>
        {p.cta}
      </div>
      {p.ctaSub ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 44,
            fontWeight: 800,
            color: '#1a1206',
            background: `linear-gradient(180deg, #ffd98a, ${C.gold})`,
            padding: '20px 54px',
            borderRadius: 999,
            transform: `scale(${s2 * btn})`,
            boxShadow: `0 0 0 ${6 + 6 * Math.sin(frame / 4)}px rgba(245,185,66,0.3), 0 12px 30px rgba(0,0,0,0.5)`,
          }}
        >
          {p.ctaSub} 👆
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** Fond : la partie elle-même, floutée et assombrie (plan.mjs), sinon un dégradé. */
const Backdrop = ({ p, frame }: { p: ShortProps; frame: number }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 40%, #13244a, ${C.space} 75%)` }}>
      {p.background ? (
        <OffthreadVideo
          src={staticFile(p.background)}
          trimBefore={Math.round(p.trimStart * fps)}
          playbackRate={p.speed}
          muted
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${1.25 + 0.03 * Math.sin(frame / 60)})`,
            filter: 'blur(18px) brightness(0.42) saturate(1.3)',
          }}
        />
      ) : null}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(5,10,22,0.35), rgba(5,10,22,0.15) 40%, rgba(5,10,22,0.6))' }} />
    </AbsoluteFill>
  );
};

/** Fond néon : grille en perspective qui défile vers le spectateur. */
const NeonBackdrop = ({ frame }: { frame: number }) => {
  const shift = (frame * 4) % 80;
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 35%, #1a0b3a, #05020f 75%)', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: -540,
          right: -540,
          top: 1000,
          height: 1400,
          transform: 'perspective(600px) rotateX(62deg)',
          transformOrigin: '50% 0%',
          backgroundImage: `linear-gradient(${NEON[1]}88 2px, transparent 2px), linear-gradient(90deg, ${NEON[1]}88 2px, transparent 2px)`,
          backgroundSize: '80px 80px',
          backgroundPosition: `0 ${shift}px`,
          maskImage: 'linear-gradient(180deg, transparent, black 30%)',
          WebkitMaskImage: 'linear-gradient(180deg, transparent, black 30%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: -540,
          right: -540,
          top: -480,
          height: 1400,
          transform: 'perspective(600px) rotateX(-62deg)',
          transformOrigin: '50% 100%',
          backgroundImage: `linear-gradient(${NEON[0]}66 2px, transparent 2px), linear-gradient(90deg, ${NEON[0]}66 2px, transparent 2px)`,
          backgroundSize: '80px 80px',
          backgroundPosition: `0 ${-shift}px`,
          maskImage: 'linear-gradient(0deg, transparent, black 40%)',
          WebkitMaskImage: 'linear-gradient(0deg, transparent, black 40%)',
          opacity: 0.6,
        }}
      />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 960, height: 4, background: NEON[1], boxShadow: `0 0 40px 12px ${NEON[1]}` }} />
    </AbsoluteFill>
  );
};
