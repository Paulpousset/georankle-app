/**
 * Un short 9:16 : accroche en haut, la vraie partie filmée sur l'app native au
 * centre dans un cadre de téléphone, sous-titres ponctuels, carte de fin.
 *
 * Zones sûres TikTok / Reels / Shorts : le haut (onglets) et le bas (légende,
 * boutons) sont recouverts par l'interface des apps, la colonne de droite par
 * les boutons j'aime / commenter. L'accroche commence donc sous 200 px et rien
 * d'important ne descend sous 1 650 px.
 *
 * Voix off optionnelle (ElevenLabs, voir voice.mjs). Pas de musique ici : un
 * son tendance ajouté dans l'app au moment de poster pousse plus la portée
 * qu'une piste figée au montage (le garder bas sous la voix).
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
  cta: string;
  ctaSub?: string;
  /** Icône de l'app dans public/, pour la carte de fin. */
  icon: string;
  /** Répliques de voix off déjà synthétisées (voice.mjs). */
  voice?: VoiceLine[];
  /** Durée de la carte de fin, allongée par voice.mjs pour la réplique finale. */
  endCardSeconds?: number;
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

export const Short = (p: ShortProps) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const endStart = durationInFrames - Math.round(endCardSeconds(p) * fps);
  const inEnd = frame >= endStart;

  const hookIn = spring({ frame, fps, config: { damping: 12, mass: 0.6 } });
  const subIn = spring({ frame: frame - 12, fps, config: { damping: 14 } });
  const phoneIn = spring({ frame: frame - 4, fps, config: { damping: 16 } });
  const endIn = spring({ frame: frame - endStart, fps, config: { damping: 13 } });
  const gameOpacity = interpolate(frame, [endStart - 6, endStart + 6], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Temps « partie » en secondes, pour caler les sous-titres sur la vidéo brute.
  const gameT = (frame / fps) * p.speed;
  const caption = (p.captions ?? []).find((c) => gameT >= c.at && gameT < c.at + (c.seconds ?? 1.6));

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 35%, ${C.nightNavy} 0%, ${C.nightDeep} 70%)`,
        fontFamily: sans,
      }}
    >
      <Graticule frame={frame} />

      {(p.voice ?? []).map((line, i) =>
        line.file ? (
          <Sequence key={i} from={line.atEnd ? endStart : Math.round((line.at ?? 0) * fps)}>
            <Audio src={staticFile(line.file)} />
          </Sequence>
        ) : null,
      )}

      <AbsoluteFill style={{ opacity: gameOpacity }}>
        {/* Accroche */}
        <div
          style={{
            position: 'absolute',
            top: 200,
            left: 70,
            right: 70,
            textAlign: 'center',
            transform: `scale(${0.6 + 0.4 * hookIn})`,
            opacity: hookIn,
          }}
        >
          <span
            style={{
              display: 'inline',
              fontFamily: display,
              fontWeight: 800,
              fontSize: 76,
              lineHeight: 1.34,
              color: C.nightDeep,
              background: C.parchment,
              padding: "4px 22px 10px",
              boxDecorationBreak: 'clone',
              WebkitBoxDecorationBreak: 'clone',
              borderRadius: 14,
            }}
          >
            {p.hook}
          </span>
          {p.subhook ? (
            <div
              style={{
                marginTop: 26,
                fontSize: 44,
                fontWeight: 600,
                color: C.parchment,
                opacity: subIn,
                transform: `translateY(${(1 - subIn) * 20}px)`,
              }}
            >
              {p.subhook}
            </div>
          ) : null}
        </div>

        {/* Téléphone */}
        <div
          style={{
            position: 'absolute',
            top: PHONE_TOP,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            transform: `translateY(${(1 - phoneIn) * 120}px)`,
            opacity: phoneIn,
          }}
        >
          <div
            style={{
              height: PHONE_H,
              aspectRatio: SCREEN_RATIO,
              borderRadius: 52,
              border: `14px solid #05080f`,
              boxShadow: `0 0 0 3px ${C.nightBorder}, 0 40px 90px rgba(0,0,0,0.55)`,
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
          </div>
        </div>

        {/* Sous-titre ponctuel, à cheval sur le haut du téléphone */}
        {caption ? <CaptionChip key={caption.at} text={caption.text} at={caption.at} speed={p.speed} /> : null}
      </AbsoluteFill>

      {/* Carte de fin */}
      {inEnd ? (
        <AbsoluteFill
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            gap: 34,
            opacity: endIn,
            transform: `scale(${0.85 + 0.15 * endIn})`,
          }}
        >
          <Img src={staticFile(p.icon)} style={{ width: 260, height: 260, borderRadius: 58 }} />
          <div style={{ fontFamily: display, fontWeight: 800, fontSize: 92, color: C.parchment }}>GeoG</div>
          <div style={{ fontSize: 50, fontWeight: 800, color: C.parchment, textAlign: 'center', padding: '0 80px' }}>
            {p.cta}
          </div>
          {p.ctaSub ? (
            <div
              style={{
                marginTop: 10,
                fontSize: 44,
                fontWeight: 800,
                color: '#fff',
                background: C.vermilion,
                padding: '18px 44px',
                borderRadius: 999,
              }}
            >
              {p.ctaSub}
            </div>
          ) : null}
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

const CaptionChip = ({ text, at, speed }: { text: string; at: number; speed: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - Math.round((at / speed) * fps), fps, config: { damping: 10, mass: 0.5 } });
  return (
    <div
      style={{
        position: 'absolute',
        top: PHONE_TOP - 40,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          fontSize: 58,
          fontWeight: 800,
          color: '#fff',
          background: C.forestGreen,
          border: `4px solid ${C.parchment}`,
          padding: '12px 36px',
          borderRadius: 24,
          transform: `scale(${pop}) rotate(${(1 - pop) * -6}deg)`,
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** Méridiens et parallèles qui dérivent lentement : rappel discret du globe. */
const Graticule = ({ frame }: { frame: number }) => {
  const shift = (frame * 0.6) % 120;
  return (
    <svg width={1080} height={1920} style={{ position: 'absolute', opacity: 0.09 }}>
      {Array.from({ length: 12 }, (_, i) => (
        <line key={`v${i}`} x1={i * 120 - shift} y1={0} x2={i * 120 - shift} y2={1920} stroke={C.sand} strokeWidth={2} />
      ))}
      {Array.from({ length: 17 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={i * 120} x2={1080} y2={i * 120} stroke={C.sand} strokeWidth={2} />
      ))}
    </svg>
  );
};
