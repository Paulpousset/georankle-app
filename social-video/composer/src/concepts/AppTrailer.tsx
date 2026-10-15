/**
 * Bande-annonce de l'app : l'accroche, puis le téléphone qui fait défiler les
 * captures des stores, un mode par plan, de plus en plus vite sur la musique,
 * avec le nom du mode écrit au-dessus et un compteur « 03/12 ». Carte de fin.
 */
import { AbsoluteFill, Audio, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

import { C, EndCard, FPS, Hook, Paper, Progress, Sfx, Tag, app, clamp, mono, serif, sfx } from './kit';

export type TrailerShot = { file: string; title: string; sub?: string };
export type AppTrailerProps = {
  hook: string[];
  shots: TrailerShot[];
  outro: string;
  cta: string;
  ctaSub?: string;
  icon: string;
};

const START = 2.1;
// Les plans raccourcissent : la fin de la liste défile en rafale.
const DUR = [1.5, 1.5, 1.3, 1.15, 1.05, 1.0, 0.95, 0.55, 0.5, 0.5, 0.5, 0.9, 1.1, 1.4];
const dur = (i: number) => DUR[i] ?? 0.8;
const starts = (n: number) => Array.from({ length: n }, (_, i) => START + Array.from({ length: i }, (_, j) => dur(j)).reduce((a, b) => a + b, 0));
const END_S = 4;
export const appTrailerSeconds = (p: AppTrailerProps) => {
  const s = starts(p.shots.length);
  return s[s.length - 1] + dur(p.shots.length - 1) + END_S;
};

const PHONE_W = 600;
const PHONE_H = Math.round((PHONE_W * 2796) / 1290);

export function AppTrailer(p: AppTrailerProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const st = starts(p.shots.length);
  const endAt = st[st.length - 1] + dur(p.shots.length - 1);
  let cur = 0;
  st.forEach((s, i) => {
    if (t >= s) cur = i;
  });
  const sinceCut = t - st[cur];
  const phoneIn = spring({ frame: frame - (START - 1.3) * fps, fps, config: { damping: 13, stiffness: 120 } });
  const punch = t >= START ? 1 + 0.05 * Math.exp(-sinceCut * 9) : 1;
  const tilt = Math.sin(t * 1.4) * 7;
  const hookOut = interpolate(t, [START - 0.4, START], [1, 0], clamp);
  const shot = p.shots[cur];
  const prev = cur > 0 ? p.shots[cur - 1] : null;
  // Avant le premier plan, le téléphone arrive avec le premier écran déjà affiché.
  const slide = t < START ? 1 : interpolate(sinceCut, [0, 0.22], [0, 1], { ...clamp, easing: (x) => 1 - (1 - x) ** 3 });
  const labelS = spring({ frame: Math.round(sinceCut * fps), fps, config: { damping: 12, stiffness: 200 } });
  const rapid = cur >= 7 && cur <= 10;

  return (
    <AbsoluteFill>
      <Paper drift={rapid ? 4 : 1.2}>
        {/* Accroche, puis nom du mode au-dessus du téléphone */}
        <div style={{ opacity: hookOut }}>
          <Hook lines={p.hook} y={260} size={120} />
        </div>
        {t >= START ? (
          <div style={{ position: 'absolute', top: 70, left: 0, right: 0, textAlign: 'center' }}>
            <Tag style={{ background: C.parchment }}>GeoG</Tag>
            <div
              style={{
                fontFamily: serif,
                fontWeight: 900,
                fontSize: shot.title.length > 16 ? 76 : 96,
                color: C.sepia,
                marginTop: 20,
                transform: `translateX(${(1 - labelS) * 120}px)`,
                opacity: labelS,
              }}
            >
              {shot.title}
            </div>
            <div style={{ fontFamily: mono, fontSize: 36, color: C.vermilion, height: 50, opacity: labelS }}>{shot.sub ?? ''}</div>
          </div>
        ) : null}

        {/* Téléphone */}
        <div
          style={{
            position: 'absolute',
            left: (1080 - PHONE_W - 36) / 2,
            top: interpolate(phoneIn, [0, 1], [1950, 380]) + (t < START ? 300 : 0) * (1 - interpolate(t, [START - 0.4, START], [0, 1], clamp)),
            perspective: 1800,
          }}
        >
          <div
            style={{
              transform: `rotateY(${tilt}deg) rotateX(${2 + Math.cos(t) * 2}deg) scale(${punch})`,
              width: PHONE_W + 36,
              height: PHONE_H + 36,
              borderRadius: 96,
              background: C.sepia,
              padding: 18,
              boxShadow: '0 50px 120px rgba(44,24,16,0.45), inset 0 0 0 4px #5a3a28',
            }}
          >
            <div style={{ width: PHONE_W, height: PHONE_H, borderRadius: 80, overflow: 'hidden', position: 'relative', background: C.parchment }}>
              {prev ? (
                <Img src={staticFile(prev.file)} style={{ position: 'absolute', width: PHONE_W, height: PHONE_H, transform: `translateX(${-slide * PHONE_W * 0.35}px)`, opacity: 1 - slide * 0.6 }} />
              ) : null}
              <Img
                src={staticFile(shot.file)}
                style={{
                  position: 'absolute',
                  width: PHONE_W,
                  height: PHONE_H,
                  transform: `translateX(${(1 - slide) * PHONE_W}px) scale(${1 + sinceCut * 0.03})`,
                  boxShadow: '-20px 0 40px rgba(0,0,0,0.25)',
                }}
              />
              {/* Encoche */}
              <div style={{ position: 'absolute', top: 18, left: PHONE_W / 2 - 80, width: 160, height: 44, borderRadius: 22, background: C.sepia }} />
            </div>
          </div>
        </div>
        {/* Flash blanc à chaque coupe en rafale */}
        {rapid ? <AbsoluteFill style={{ background: '#fff', opacity: interpolate(sinceCut, [0, 0.12], [0.35, 0], clamp) }} /> : null}
        <Progress total={endAt} />
      </Paper>

      <EndCard title={p.outro === 'GeoG' ? 'Ta prochaine appli de géo' : p.outro} cta={p.cta} ctaSub={p.ctaSub} icon={p.icon} start={endAt} />

      <Audio src={sfx('music')} volume={(f) => interpolate(f / FPS, [0, 0.3, endAt + 3, endAt + 4], [0, 0.55, 0.55, 0], clamp)} />
      <Sfx at={0} src={sfx('boom')} volume={0.6} />
      {st.map((s, i) => (
        // Un seul souffle discret à l'arrivée du téléphone ; ensuite, un petit tap de l'app par coupe.
        <Sfx key={i} at={s} src={i === 0 ? sfx('whoosh') : app('tap')} volume={i === 0 ? 0.15 : 0.25} />
      ))}
      <Sfx at={endAt} src={app('win')} volume={0.7} />
    </AbsoluteFill>
  );
}
