/**
 * Trois concepts de montage pour les vidéos de l'app, chacun avec ses
 * propres textes, bruitages, musique, zooms et effets (choisis par `look`
 * dans Short.tsx) :
 *
 * - meme : l'app plein écran façon TikTok. « POV » en bandeau blanc,
 *   zooms secs sur les réponses, autocollants de réaction, « quelques
 *   questions plus tard… » aux sauts, image figée en noir et blanc +
 *   trombone triste au raté. Sons : vine boom, klaxon, scratch, clic.
 * - suspense : jeu télé. Bandes cinéma, image désaturée, battements de cœur
 *   qui accélèrent, lente poussée de caméra sur chaque question, roulement
 *   de tambour avant la question fatale, coup d'orchestre et « Perdu. »
 *   en grand. Musique : nappe sombre.
 * - arcade : borne d'arcade. Score et combo, pièces de plus en plus aiguës,
 *   +100 qui s'envolent, rebond en rythme sur la musique chiptune, « WARP »
 *   aux sauts, GAME OVER glitché, « INSERT COIN » à la fin.
 *
 * Les répliques de voix off (voice.mjs) restent celles de la fiche.
 */
import { loadFont } from '@remotion/fonts';
import anton400 from '@fontsource/anton/files/anton-latin-400-normal.woff2';
import cormorant700 from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-700-normal.woff2';
import cormorant600i from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-italic.woff2';
import pixel400 from '@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2';
import montserrat800 from '@fontsource/montserrat/files/montserrat-latin-800-normal.woff2';
import {
  AbsoluteFill,
  Audio,
  Freeze,
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
import type { ShortProps } from './Short';

const anton = 'Anton';
const serif = 'Cormorant Garamond';
const pixel = '"Press Start 2P"';
const sans = 'Montserrat';
loadFont({ family: anton, url: anton400, weight: '400' });
loadFont({ family: serif, url: cormorant700, weight: '700' });
loadFont({ family: serif, url: cormorant600i, weight: '600', style: 'italic' });
loadFont({ family: 'Press Start 2P', url: pixel400, weight: '400' });
loadFont({ family: sans, url: montserrat800, weight: '800' });

const RAW_W = 720;
const RAW_H = 1136;
const STATUS_BAR = 52;
// Points d'intérêt de l'écran de l'app (pixels de la vidéo brute).
const FOCUS_QUESTION = { x: 360, y: 200 };
const FOCUS_ANSWERS = { x: 360, y: 420 };

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const decay = (frame: number, start: number, rate: number) => (frame < start ? 0 : Math.exp(-(frame - start) / rate));
const isFail = (text: string) => /😬|💀|❌|😭|oh no|ah\.|raté|perdu/i.test(text);
const sfx = (name: string) => staticFile(`sfx/${name}.wav`);

/** Moments clés du montage, en images. */
function useTimeline(p: ShortProps, endCard: number) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const endStart = durationInFrames - Math.round(endCard * fps);
  const toFrame = (s: number) => Math.round((s / p.speed) * fps);
  const beats = (p.beats ?? []).map(toFrame).filter((f) => f > fps && f < endStart - fps);
  const jumps = (p.jumps ?? []).map(toFrame).filter((f) => f > 0 && f < endStart);
  const fail = (p.captions ?? []).filter((c) => isFail(c.text)).map((c) => toFrame(c.at))[0] ?? endStart - 3 * fps;
  // Nombre de bonnes réponses passées (changements de question).
  const combo = beats.filter((b) => frame >= b).length;
  const lastBeat = [...beats].reverse().find((b) => frame >= b);
  return { frame, fps, durationInFrames, endStart, beats, jumps, fail, combo, lastBeat };
}

/** L'écran de l'app recadré (sans barre d'état), avec caméra (zoom vers un point). */
function AppScreen({
  p,
  top,
  scale,
  height,
  zoom = 1,
  focus = FOCUS_ANSWERS,
  freezeAt,
  freezeFor = 0,
  style,
  videoFilter,
}: {
  p: ShortProps;
  top: number;
  scale: number;
  height: number;
  zoom?: number;
  focus?: { x: number; y: number };
  freezeAt?: number;
  freezeFor?: number;
  style?: React.CSSProperties;
  videoFilter?: string;
}) {
  const { fps } = useVideoConfig();
  const w = RAW_W * scale;
  const ox = focus.x * scale;
  const oy = (focus.y - STATUS_BAR) * scale;
  const video = (
    <OffthreadVideo
      src={staticFile(p.clip)}
      trimBefore={Math.round(p.trimStart * fps)}
      playbackRate={p.speed}
      muted
      style={{ position: 'absolute', left: 0, top: -STATUS_BAR * scale, width: w, height: RAW_H * scale, filter: videoFilter }}
    />
  );
  return (
    <div style={{ position: 'absolute', top, left: (1080 - w) / 2, width: w, height, overflow: 'hidden', background: '#000', ...style }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: `${ox}px ${oy}px` }}>
        {freezeAt != null ? (
          <Freeze frame={freezeAt} active={(f) => f >= freezeAt && f < freezeAt + freezeFor}>
            {video}
          </Freeze>
        ) : (
          video
        )}
      </div>
    </div>
  );
}

function Voice({ p, endStart }: { p: ShortProps; endStart: number }) {
  const { fps } = useVideoConfig();
  return (
    <>
      {(p.voice ?? []).map((line, i) =>
        line.file ? (
          <Sequence key={i} from={line.atEnd ? endStart : Math.round((line.at ?? 0) * fps)} layout="none">
            <Audio src={staticFile(line.file)} />
          </Sequence>
        ) : null,
      )}
    </>
  );
}

function Music({ name, volume, p }: { name: string; volume: number; p: ShortProps }) {
  const { durationInFrames } = useVideoConfig();
  const hasVoice = (p.voice ?? []).some((l) => l.file);
  return (
    <Audio
      src={sfx(name)}
      volume={(f) => volume * (hasVoice ? 0.45 : 1) * interpolate(f, [0, 4, durationInFrames - 20, durationInFrames - 1], [0, 1, 1, 0], clamp)}
    />
  );
}

const At = ({ frame, children, length = 90 }: { frame: number; children: React.ReactNode; length?: number }) =>
  frame >= 0 ? (
    <Sequence from={Math.max(0, Math.round(frame))} durationInFrames={length} layout="none">
      {children}
    </Sequence>
  ) : null;

const fr = (p: ShortProps) => (p.lang ?? 'fr') === 'fr';
const pick = <T,>(list: T[], key: string) => list[Math.floor(random(key) * list.length)];

// ===========================================================================
// MÈME
// ===========================================================================

export function MemeShort(p: ShortProps) {
  const { frame, fps, endStart, beats, jumps, fail } = useTimeline(p, p.endCardSeconds ?? 2.5);
  const top = 330;
  const scale = 1.5;
  // Zoom sec (coupé, pas animé) sur les réponses pendant 10 images après
  // une bonne réponse sur deux, et zoom écrasé au raté.
  const snapBeat = beats.find((b, i) => i % 2 === 0 && frame >= b && frame < b + 10);
  const failZoom = frame >= fail && frame < fail + 40;
  const zoom = failZoom ? 1.9 : snapBeat != null ? 1.45 : 1;
  const shake = frame >= fail && frame < fail + 14 ? 18 * (1 - (frame - fail) / 14) : 0;
  const sx = shake * (random(`mx${frame}`) - 0.5) * 2;
  const sy = shake * (random(`my${frame}`) - 0.5) * 2;
  const grey = frame >= fail && frame < fail + 40;
  const reactions = fr(p)
    ? ['EZ 😎', 'FACILE', 'GÉNIE 🧠', 'TROP FORT', 'OK OK 👀', 'IL EST CHAUD 🔥', 'RESPECT 🫡']
    : ['EZ 😎', 'TOO EASY', 'GENIUS 🧠', 'LET’S GO', 'OK OK 👀', 'ON FIRE 🔥', 'RESPECT 🫡'];
  const pov = fr(p)
    ? pick(['POV : tu te crois fort en géo 🤓', 'POV : « la géo c’est facile »', 'Moi qui pensais être bon en géo :'], p.clip)
    : pick(['POV: you think you’re good at geography 🤓', 'Me thinking geography is easy:'], p.clip);
  const later = fr(p) ? 'QUELQUES QUESTIONS PLUS TARD…' : 'A FEW QUESTIONS LATER…';

  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <Music name="music" volume={0.4} p={p} />
      <Voice p={p} endStart={endStart} />
      <Audio src={sfx('airhorn')} volume={0.35} />
      {beats.map((b, i) => (
        <At key={b} frame={b} length={30}>
          <Audio src={sfx(i % 2 === 0 ? 'snap' : 'pop')} volume={0.8} />
        </At>
      ))}
      {jumps.map((j) => (
        <At key={j} frame={j - 2} length={20}>
          <Audio src={sfx('scratch')} volume={0.8} />
        </At>
      ))}
      <At frame={fail} length={60}>
        <Audio src={sfx('vineboom')} volume={1} />
      </At>
      <At frame={fail + 20} length={90}>
        <Audio src={sfx('trombone')} volume={0.7} />
      </At>

      <div style={{ position: 'absolute', inset: 0, transform: `translate(${sx}px, ${sy}px)` }}>
        <AppScreen
          p={p}
          top={top}
          scale={scale}
          height={1920 - top}
          zoom={zoom}
          focus={failZoom ? { x: 360, y: 330 } : FOCUS_ANSWERS}
          freezeAt={fail}
          freezeFor={40}
          videoFilter={grey ? 'grayscale(1) contrast(1.3)' : undefined}
        />
      </div>

      {/* Bandeau « POV » blanc, texte noir */}
      <div style={{ position: 'absolute', top: 150, left: 0, right: 0, height: top - 150, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 50px' }}>
        <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 54, color: '#000', textAlign: 'center', lineHeight: 1.15 }}>{pov}</div>
      </div>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 150, background: '#fff' }} />

      {/* Autocollants de réaction */}
      {beats.map((b, i) => {
        const t = frame - b;
        if (t < 0 || t > 22) return null;
        const s = spring({ frame: t, fps, config: { damping: 8, mass: 0.4 } });
        return (
          <div
            key={b}
            style={{
              position: 'absolute',
              top: 820 + (i % 3) * 120,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontFamily: anton,
              fontSize: 140,
              color: '#fff',
              WebkitTextStroke: '8px #000',
              paintOrder: 'stroke fill',
              transform: `scale(${s}) rotate(${(i % 2 ? 1 : -1) * 8}deg)`,
              opacity: t > 18 ? 1 - (t - 18) / 4 : 1,
              textShadow: '0 10px 0 rgba(0,0,0,0.4)',
            }}
          >
            {reactions[i % reactions.length]}
          </div>
        );
      })}

      {/* « Quelques questions plus tard… » façon dessin animé */}
      {jumps.map((j) =>
        frame >= j - 3 && frame < j + 22 ? (
          <AbsoluteFill key={j} style={{ background: 'linear-gradient(135deg, #ffd23f, #ff8c1a)', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
            <div style={{ fontFamily: anton, fontSize: 120, color: '#2b1a00', textAlign: 'center', lineHeight: 1.05, transform: `rotate(-4deg) scale(${1 + 0.02 * Math.sin(frame)})`, WebkitTextStroke: '3px #fff4c2' }}>
              {later}
            </div>
          </AbsoluteFill>
        ) : null,
      )}

      {/* Raté : 💀 géant + texte */}
      {frame >= fail && frame < fail + 40 ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 300, transform: `scale(${spring({ frame: frame - fail, fps, config: { damping: 7 } })})` }}>💀</div>
          <div style={{ fontFamily: anton, fontSize: 110, color: '#fff', WebkitTextStroke: '7px #000', paintOrder: 'stroke fill', marginTop: 20 }}>
            {fr(p) ? 'C’ÉTAIT ÉVIDENT…' : 'IT WAS OBVIOUS…'}
          </div>
        </AbsoluteFill>
      ) : null}

      {frame >= endStart ? (
        <AbsoluteFill style={{ background: '#fff', alignItems: 'center', justifyContent: 'center', gap: 40, padding: 60 }}>
          <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 70, color: '#000', textAlign: 'center' }}>{fr(p) ? 'Tu ferais mieux ? 🤨' : 'Think you can do better? 🤨'}</div>
          <Img src={staticFile(p.icon)} style={{ width: 240, height: 240, borderRadius: 54, transform: `scale(${spring({ frame: frame - endStart, fps, config: { damping: 8 } })})` }} />
          <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 52, color: '#000' }}>GeoG · {p.cta}</div>
          {p.ctaSub ? <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 46, color: '#fff', background: '#000', padding: '18px 44px', borderRadius: 16 }}>{p.ctaSub} 👆</div> : null}
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
}

// ===========================================================================
// SUSPENSE
// ===========================================================================

export function SuspenseShort(p: ShortProps) {
  const { frame, fps, endStart, beats, jumps, fail, lastBeat } = useTimeline(p, p.endCardSeconds ?? 2.5);
  const BAR = 230;
  const top = 380;
  // Lente poussée sur la question depuis le dernier changement, et poussée
  // plus forte sur les réponses dans les 2,5 s avant la question fatale.
  const since = frame - (lastBeat ?? 0);
  const preFail = interpolate(frame, [fail - 2.5 * fps, fail], [0, 1], clamp);
  let zoom = 1 + 0.12 * Math.min(1, since / (3 * fps));
  if (preFail > 0) zoom = Math.max(zoom, 1 + 0.4 * ease(preFail));
  const postFail = frame >= fail ? interpolate(frame, [fail, fail + 45], [1.4, 1.05], { ...clamp, easing: ease }) : null;
  if (postFail != null) zoom = postFail;
  // Battements de cœur : de plus en plus rapprochés vers la fin.
  const hearts: number[] = [];
  for (let f = 0.5 * fps, gap = 1.1 * fps; f < fail; ) {
    hearts.push(Math.round(f));
    const k = f / fail;
    gap = (1.1 - 0.6 * k * k) * fps;
    f += gap;
  }
  const heartPulse = hearts.reduce((s, h) => s + decay(frame, h, 5), 0);
  const dip = Math.max(0, ...beats.map((b) => 1 - Math.abs(frame - b) / 4), ...jumps.map((j) => 1 - Math.abs(frame - j) / 8));
  const lines = fr(p)
    ? { hook: 'Une question de trop.', mid: 'Ça se complique…', last: 'Celle-ci… ?', lost: 'Perdu.', later: 'Plus tard…', end: 'Et toi, jusqu’où ?' }
    : { hook: 'One question too many.', mid: 'It gets harder…', last: 'This one…?', lost: 'Game over.', later: 'Later…', end: 'How far would you get?' };
  const midAt = beats[Math.floor(beats.length / 2)] ?? fail - 6 * fps;
  const caption =
    frame >= fail - 2.5 * fps && frame < fail ? lines.last : frame >= midAt && frame < midAt + 2 * fps ? lines.mid : frame < 2.5 * fps ? lines.hook : null;
  const captionStart = frame >= fail - 2.5 * fps ? fail - 2.5 * fps : frame >= midAt ? midAt : 0;
  const red = frame >= fail ? 0.5 * decay(frame, fail, 20) : 0;

  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <Music name="tension" volume={0.7} p={p} />
      <Voice p={p} endStart={endStart} />
      <Audio src={sfx('hit')} volume={0.6} />
      {hearts.map((h) => (
        <At key={h} frame={h} length={30}>
          <Audio src={sfx('heartbeat')} volume={0.9} />
        </At>
      ))}
      <At frame={fail - 1.6 * fps} length={60}>
        <Audio src={sfx('drumroll')} volume={0.8} />
      </At>
      <At frame={fail} length={70}>
        <Audio src={sfx('hit')} volume={1} />
      </At>
      {jumps.map((j) => (
        <At key={j} frame={j - 4} length={30}>
          <Audio src={sfx('whoosh')} volume={0.4} />
        </At>
      ))}
      <At frame={endStart} length={60}>
        <Audio src={sfx('hit')} volume={0.5} />
      </At>

      <AppScreen
        p={p}
        top={top}
        scale={1.2}
        height={1260}
        zoom={zoom * (1 + 0.006 * heartPulse)}
        focus={preFail > 0 || frame >= fail ? FOCUS_ANSWERS : FOCUS_QUESTION}
        freezeAt={fail}
        freezeFor={45}
        style={{ borderRadius: 8, boxShadow: '0 0 80px rgba(0,0,0,0.9)' }}
        videoFilter={`saturate(${frame >= fail && frame < fail + 45 ? 0.2 : 0.55}) contrast(1.15) brightness(0.92)`}
      />

      {/* Vignette qui bat avec le cœur, voile rouge au raté, fondu aux coupes */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 55% at 50% 52%, transparent ${45 - 8 * heartPulse}%, rgba(0,0,0,${0.85 + 0.1 * heartPulse}) 100%)` }} />
      {red > 0.01 ? <AbsoluteFill style={{ background: `rgba(160,0,10,${red})`, mixBlendMode: 'multiply' }} /> : null}
      {dip > 0 ? <AbsoluteFill style={{ background: '#000', opacity: dip }} /> : null}

      {/* Bandes cinéma */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: BAR, background: '#000' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: BAR, background: '#000' }} />

      {caption ? (
        <div
          style={{
            position: 'absolute',
            top: 250,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: serif,
            fontStyle: 'italic',
            fontWeight: 600,
            fontSize: 86,
            color: '#f4ead2',
            letterSpacing: 1,
            opacity: interpolate(frame - captionStart, [0, 10], [0, 1], clamp),
            textShadow: '0 4px 30px rgba(0,0,0,0.9)',
          }}
        >
          {caption}
        </div>
      ) : null}
      {jumps.map((j) =>
        Math.abs(frame - j) < 14 ? (
          <AbsoluteFill key={j} style={{ alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontFamily: serif, fontStyle: 'italic', fontWeight: 600, fontSize: 90, color: '#f4ead2', opacity: 1 - Math.abs(frame - j) / 14 }}>{lines.later}</div>
          </AbsoluteFill>
        ) : null,
      )}
      {frame >= fail && frame < endStart ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              fontFamily: serif,
              fontWeight: 700,
              fontSize: 230,
              color: '#fff',
              letterSpacing: 8,
              transform: `scale(${interpolate(frame - fail, [0, 6, 40], [1.6, 1, 0.94], clamp)})`,
              opacity: interpolate(frame - fail, [0, 4], [0, 1], clamp),
              textShadow: '0 0 60px rgba(255,40,40,0.7)',
            }}
          >
            {lines.lost}
          </div>
        </AbsoluteFill>
      ) : null}

      {frame >= endStart ? (
        <AbsoluteFill style={{ background: '#000', alignItems: 'center', justifyContent: 'center', gap: 50 }}>
          <div style={{ fontFamily: serif, fontStyle: 'italic', fontWeight: 600, fontSize: 96, color: '#f4ead2', opacity: interpolate(frame - endStart, [0, 15], [0, 1], clamp) }}>{lines.end}</div>
          <Img src={staticFile(p.icon)} style={{ width: 200, height: 200, borderRadius: 46, opacity: interpolate(frame - endStart, [15, 30], [0, 1], clamp) }} />
          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 64, color: '#fff', letterSpacing: 6, opacity: interpolate(frame - endStart, [22, 37], [0, 1], clamp) }}>
            GeoG — {p.ctaSub ?? p.cta}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
}

// ===========================================================================
// ARCADE
// ===========================================================================

const ARCADE = { pink: '#ff2e88', cyan: '#2ef2ff', yellow: '#ffe600', green: '#39ff6a' };

export function ArcadeShort(p: ShortProps) {
  const { frame, fps, endStart, beats, jumps, fail, combo } = useTimeline(p, p.endCardSeconds ?? 2.5);
  const top = 430;
  // Rebond en rythme sur la musique (140 BPM).
  const beatLen = (60 / 140) * fps;
  const bounce = 1 + 0.018 * Math.exp(-(frame % beatLen) / 3);
  const punch = beats.reduce((s, b) => s + 0.06 * decay(frame, b, 4), 0);
  const shakeAmp = beats.reduce((s, b) => s + Math.min(14, 3 + combo * 1.5) * decay(frame, b, 3), 0);
  const sx = shakeAmp * (random(`ax${frame}`) - 0.5) * 2;
  const sy = shakeAmp * (random(`ay${frame}`) - 0.5) * 2;
  // Saut : l'écran sort par la gauche et revient par la droite.
  const warp = jumps.find((j) => Math.abs(frame - j) < 6);
  const warpX = warp != null ? (frame < warp ? -1 : 1) * (1 - Math.abs(frame - warp) / 6) * 1080 : 0;
  const glitch = frame >= fail && frame < fail + 30;
  const over = frame >= fail && frame < endStart;
  const score = combo * 100;
  const text = fr(p)
    ? { ready: 'JOUEUR 1', go: 'PRÊT ?', combo: 'COMBO', over: 'GAME OVER', cont: 'CONTINUER ?', coin: 'INSERT COIN', dl: 'GEOG · GRATUIT', warp: 'WARP >>' }
    : { ready: 'PLAYER 1', go: 'READY?', combo: 'COMBO', over: 'GAME OVER', cont: 'CONTINUE?', coin: 'INSERT COIN', dl: 'GEOG · FREE', warp: 'WARP >>' };
  const hue = (frame * 3) % 360;

  return (
    <AbsoluteFill style={{ background: '#07001a', overflow: 'hidden' }}>
      <Music name="chiptune" volume={0.55} p={p} />
      <Voice p={p} endStart={endStart} />
      <Audio src={sfx('powerup')} volume={0.6} />
      {beats.map((b, i) => (
        <At key={b} frame={b} length={20}>
          <Audio src={sfx(`coin${Math.min(8, i + 1)}`)} volume={0.6} />
        </At>
      ))}
      {jumps.map((j) => (
        <At key={j} frame={j - 5} length={20}>
          <Audio src={sfx('zap')} volume={0.7} />
        </At>
      ))}
      <At frame={fail} length={70}>
        <Audio src={sfx('gameover')} volume={0.8} />
      </At>
      <At frame={endStart} length={30}>
        <Audio src={sfx('coin8')} volume={0.6} />
      </At>

      {/* Étoiles en pixels qui défilent */}
      {Array.from({ length: 70 }, (_, i) => {
        const speed = 2 + random(`ps${i}`) * 10;
        const size = speed > 8 ? 8 : 4;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: random(`px${i}`) * 1080,
              top: (random(`py${i}`) * 1920 + frame * speed) % 1920,
              width: size,
              height: size * 3,
              background: i % 5 ? '#ffffff' : ARCADE.cyan,
              opacity: 0.5,
            }}
          />
        );
      })}

      <div style={{ position: 'absolute', inset: 0, transform: `translate(${sx + warpX}px, ${sy}px)`, filter: warp != null ? 'blur(6px)' : undefined }}>
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${bounce + punch})`, transformOrigin: `540px ${top + 500}px` }}>
          <AppScreen
            p={p}
            top={top}
            scale={1.15}
            height={1180}
            freezeAt={fail}
            freezeFor={30}
            style={{ border: `12px solid hsl(${hue}, 100%, 60%)`, boxShadow: `0 0 0 6px #000, 0 0 50px hsl(${hue}, 100%, 60%)`, borderRadius: 0 }}
            videoFilter={glitch ? `hue-rotate(${(frame * 47) % 360}deg) saturate(2)` : undefined}
          />
          {/* Glitch : bandes horizontales décalées */}
          {glitch
            ? Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: (random(`gx${frame}-${i}`) - 0.5) * 120,
                    top: top + random(`gy${frame}-${i}`) * 1100,
                    width: 1080,
                    height: 20 + random(`gh${frame}-${i}`) * 60,
                    background: i % 2 ? ARCADE.pink : ARCADE.cyan,
                    mixBlendMode: 'screen',
                    opacity: 0.6,
                  }}
                />
              ))
            : null}
        </div>
      </div>

      {/* Lignes de balayage CRT */}
      <AbsoluteFill style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.25) 0 2px, transparent 2px 5px)', pointerEvents: 'none' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 75% at 50% 50%, transparent 60%, rgba(0,0,0,0.8) 100%)' }} />

      {/* HUD : score et combo */}
      <div style={{ position: 'absolute', top: 200, left: 70, fontFamily: pixel, fontSize: 34, color: '#fff', lineHeight: 1.6 }}>
        <div style={{ color: ARCADE.pink }}>SCORE</div>
        <div>{String(score).padStart(6, '0')}</div>
      </div>
      <div style={{ position: 'absolute', top: 200, right: 70, fontFamily: pixel, fontSize: 34, textAlign: 'right', lineHeight: 1.6 }}>
        <div style={{ color: ARCADE.cyan }}>{text.combo}</div>
        <div
          style={{
            color: combo >= 4 ? ARCADE.yellow : '#fff',
            fontSize: 34 + Math.min(30, combo * 4),
            transform: `scale(${1 + 0.6 * beats.reduce((s, b) => s + decay(frame, b, 4), 0)})`,
            transformOrigin: '100% 50%',
            textShadow: combo >= 4 ? `0 0 20px ${ARCADE.yellow}` : undefined,
          }}
        >
          x{combo}
        </div>
      </div>

      {/* Départ : JOUEUR 1 PRÊT ? */}
      {frame < 2.2 * fps ? (
        <AbsoluteFill style={{ alignItems: 'center', top: 330 }}>
          <div style={{ fontFamily: pixel, fontSize: 40, color: ARCADE.yellow, opacity: Math.floor(frame / 6) % 2 ? 1 : 0.4 }}>
            {text.ready} {text.go}
          </div>
          <div style={{ fontFamily: pixel, fontSize: 26, color: '#fff', marginTop: 20, padding: '0 60px', textAlign: 'center', lineHeight: 1.6 }}>{p.hook.toUpperCase()}</div>
        </AbsoluteFill>
      ) : null}

      {/* +100 qui s'envolent */}
      {beats.map((b, i) => {
        const t = frame - b;
        if (t < 0 || t > 24) return null;
        return (
          <div
            key={b}
            style={{
              position: 'absolute',
              left: 300 + (i % 3) * 160,
              top: 1000 - t * 14,
              fontFamily: pixel,
              fontSize: 60,
              color: ARCADE.green,
              textShadow: `4px 4px 0 #000, 0 0 20px ${ARCADE.green}`,
              opacity: 1 - t / 24,
            }}
          >
            +100
          </div>
        );
      })}

      {warp != null ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: pixel, fontSize: 90, color: ARCADE.cyan, textShadow: `6px 6px 0 ${ARCADE.pink}` }}>{text.warp}</div>
        </AbsoluteFill>
      ) : null}

      {over ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 40, background: `rgba(7,0,26,${interpolate(frame - fail, [0, 10], [0, 0.55], clamp)})` }}>
          <div style={{ fontFamily: pixel, fontSize: 96, color: '#ff2a2a', textShadow: `6px 6px 0 #000, ${(random(`go${frame}`) - 0.5) * 16}px 0 0 ${ARCADE.cyan}`, transform: `scale(${spring({ frame: frame - fail, fps, config: { damping: 9 } })})` }}>
            {text.over}
          </div>
          <div style={{ fontFamily: pixel, fontSize: 40, color: '#fff' }}>
            {text.cont} {Math.max(0, 9 - Math.floor((frame - fail) / 10))}
          </div>
        </AbsoluteFill>
      ) : null}

      {frame >= endStart ? (
        <AbsoluteFill style={{ background: '#07001a', alignItems: 'center', justifyContent: 'center', gap: 50 }}>
          {/* Extinction d'écran CRT inversée : la carte s'ouvre depuis une ligne */}
          <div style={{ position: 'absolute', inset: 0, background: '#fff', transform: `scaleY(${interpolate(frame - endStart, [0, 5], [0.004, 0], clamp)})` }} />
          <div style={{ fontFamily: pixel, fontSize: 64, color: ARCADE.yellow, opacity: Math.floor((frame - endStart) / 8) % 2 ? 1 : 0.25 }}>{text.coin}</div>
          <Img src={staticFile(p.icon)} style={{ width: 220, height: 220, imageRendering: 'pixelated', border: `8px solid ${ARCADE.cyan}`, transform: `scale(${spring({ frame: frame - endStart - 4, fps, config: { damping: 10 } })})` }} />
          <div style={{ fontFamily: pixel, fontSize: 44, color: '#fff' }}>{text.dl}</div>
          {p.ctaSub ? <div style={{ fontFamily: pixel, fontSize: 30, color: ARCADE.pink }}>{p.ctaSub.toUpperCase()}</div> : null}
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
}
