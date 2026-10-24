/**
 * « À l'échelle » version atlas, d'après l'écran de l'app (src/screens/ScaleGame.tsx) :
 * deux pays côte à côte, celui de gauche à la vraie échelle, celui de droite
 * trop grand ou trop petit. Le curseur glisse (le joueur dépasse, revient),
 * « Valider », puis les pointillés verts montrent la vraie taille avec l'écart
 * et les points. Deux bons réglages, puis la chute : deux fois à côté.
 * Trois paires de 5,6 s : environ 20 s avant la carte de fin.
 */
import { AbsoluteFill, Audio, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

import { C, EndCard, FPS, Hook, Paper, Progress, Sfx, Stamp, VoiceTrack, app, clamp, flag, mono, musicVolume, serif, sfx, type VoiceLine } from './kit';

export type EcCountry = { cc: string; name: string; area: string; d: string; width: number; height: number };
export type EcRound = { left: EcCountry; right: EcCountry; unit: number; start: number; guess: number; over: number; points: number; verdict: string };
export type EchelleProps = {
  hook: string[];
  title: string;
  pairLabel: string;
  hint: string;
  truthHint: string;
  slider: string;
  submit: string;
  fail: string;
  rounds: EcRound[];
  total: number;
  max: number;
  outro: string;
  outroSub: string;
  cta: string;
  icon: string;
  lang?: string;
  voice?: VoiceLine[];
};

const TX = {
  fr: { endTitle: 'À l’échelle : le nouveau mode', ctaSub: 'Lien dans la bio' },
  en: { endTitle: 'To Scale: the new mode', ctaSub: 'Link in bio' },
};
const txOf = (lang?: string) => (lang === 'en' ? TX.en : TX.fr);

// Mêmes durées que concepts.mjs (placement de la voix off).
export const EC = { START: 0.3, PAIR: 5.6, MOVE: 0.7, OVER: 1.75, SETTLE: 2.4, SUBMIT: 2.75, REVEAL: 3.3, OUTRO: 2.6 };
const pairAt = (i: number) => EC.START + i * EC.PAIR;
const endAt = (p: EchelleProps) => pairAt(p.rounds.length - 1) + EC.PAIR + EC.OUTRO;
export const echelleSeconds = (p: EchelleProps) => endAt(p) + 4;

// Plateau de l'app (src/lib/scale.ts) en unités du viewBox, affiché sur 980 px.
const BOARD_W = 200;
const BOARD_H = 140;
const LEFT_W = 80;
const K = 980 / BOARD_W;
const CARD_X = 50;
const CARD_Y = 250;
const SVG_Y = 120; // dans la carte, sous les noms
const SLIDER_Y = 1290;
const TRACK_X0 = 200;
const TRACK_X1 = 880;
// Plage visuelle du curseur, en zoom (log) : la réponse n'est pas au milieu.
const Z_MIN = 1 / 3;
const Z_MAX = 3.2;
const trackX = (z: number) => TRACK_X0 + ((TRACK_X1 - TRACK_X0) * Math.log(z / Z_MIN)) / Math.log(Z_MAX / Z_MIN);

const ease = (x: number) => x * x * (3 - 2 * x);
/** Zoom du pays de droite à `lt` secondes dans la paire : départ, dépassement, réglage. */
function zoomAt(r: EcRound, lt: number) {
  const lg = (z: number) => Math.log(z);
  if (lt < EC.MOVE) return r.start;
  if (lt < EC.OVER) return Math.exp(lg(r.start) + (lg(r.over) - lg(r.start)) * ease((lt - EC.MOVE) / (EC.OVER - EC.MOVE)));
  if (lt < EC.SETTLE) return Math.exp(lg(r.over) + (lg(r.guess) - lg(r.over)) * ease((lt - EC.OVER) / (EC.SETTLE - EC.OVER)));
  return r.guess;
}

/** Un pays dessiné à `px` pixels par unité de projection, centré en (cx, cy). */
function Shape({ c, px, cx, cy, fill, stroke, dash, opacity = 1 }: { c: EcCountry; px: number; cx: number; cy: number; fill: string; stroke?: string; dash?: string; opacity?: number }) {
  return (
    <g transform={`translate(${cx - (c.width * px) / 2} ${cy - (c.height * px) / 2}) scale(${px})`} opacity={opacity}>
      <path d={c.d} fill={fill} stroke={stroke ?? 'none'} strokeWidth={stroke ? 7 : 0} strokeDasharray={dash} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </g>
  );
}

export function EchelleConcept(p: EchelleProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const tx = txOf(p.lang);
  const n = p.rounds.length;
  if (!n) return <Paper />;
  const end = endAt(p);
  const cur = Math.max(0, Math.min(n - 1, Math.floor((t - EC.START) / EC.PAIR)));
  const lt = t - pairAt(cur);
  const r = p.rounds[cur];
  const last = cur === n - 1;
  const outro = t >= pairAt(n - 1) + EC.PAIR;
  const revealed = lt >= EC.REVEAL;
  const failAt = pairAt(n - 1) + EC.REVEAL;

  const z = zoomAt(r, lt);
  const W = BOARD_W * K;
  const H = BOARD_H * K;
  const px = r.unit * K;
  const lx = (LEFT_W / 2) * K;
  const rx = (LEFT_W + (BOARD_W - LEFT_W) / 2) * K;
  const cy = H / 2;

  // La première paire est en place dès la première image (rien de vide à l'écran).
  const arrive = cur === 0 ? 1 : spring({ frame: Math.round(lt * fps), fps, config: { damping: 14, stiffness: 160 } });
  const reveal = spring({ frame: Math.round((lt - EC.REVEAL) * fps), fps, config: { damping: 12, stiffness: 170 } });
  const truthDraw = interpolate(lt, [EC.REVEAL, EC.REVEAL + 0.5], [0, 1], clamp);
  const pressed = lt >= EC.SUBMIT && lt < EC.SUBMIT + 0.25;
  const shake = t >= failAt && t < failAt + 0.5 ? Math.sin(t * 90) * 22 * (1 - (t - failAt) / 0.5) : 0;
  const done = p.rounds.slice(0, cur).reduce((a, x) => a + x.points, 0);
  const shownPts = Math.round(r.points * interpolate(lt, [EC.REVEAL + 0.15, EC.REVEAL + 0.85], [0, 1], clamp));
  const score = done + shownPts;
  const good = r.points >= 140;
  const hookOn = interpolate(t, [1.5, 1.9], [1, 0], clamp);
  const dragging = lt >= EC.MOVE && lt < EC.SETTLE;

  return (
    <AbsoluteFill>
      <Paper drift={1.5}>
        {!outro ? (
          <>
            {/* En-tête comme dans l'app : nom du mode, paire, score. */}
            <div style={{ position: 'absolute', top: 60, left: 50, right: 50, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 1 - hookOn }}>
              <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 60, color: C.sepia }}>📏 {p.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, border: `4px solid ${C.tan}`, borderRadius: 24, padding: '8px 26px', background: C.card, fontFamily: mono, fontWeight: 700, fontSize: 46 }}>
                <span style={{ color: C.vermilion }}>{cur + 1}/{n}</span>
                <span style={{ width: 3, height: 44, background: C.tan }} />
                <span style={{ color: C.green }}>{score}</span>
              </div>
            </div>
            <div style={{ position: 'absolute', top: 168, left: 0, right: 0, textAlign: 'center', fontFamily: serif, fontWeight: 900, fontSize: 56, color: C.vermilion, letterSpacing: 2, opacity: 1 - hookOn }}>
              {p.pairLabel} {cur + 1}/{n}
            </div>

            {/* Le plateau : deux colonnes, séparées par des pointillés. */}
            <div
              style={{
                position: 'absolute', left: CARD_X + shake + (1 - arrive) * 1100, top: CARD_Y, width: W, height: 1000,
                background: C.parchmentDark, border: `5px solid ${revealed ? (good ? C.green : C.red) : C.tan}`, borderRadius: 48,
                boxShadow: '0 18px 40px rgba(44,24,16,0.18)', overflow: 'hidden',
              }}
            >
              {[{ c: r.left, x: lx }, { c: r.right, x: rx }].map(({ c, x }) => (
                <div key={c.cc} style={{ position: 'absolute', top: 34, left: x - 300, width: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
                  <Img src={flag(c.cc)} style={{ width: 66, height: 50, borderRadius: 8, objectFit: 'cover', boxShadow: '0 4px 0 rgba(44,24,16,0.25)' }} />
                  <span style={{ fontFamily: serif, fontWeight: 900, fontSize: c.name.length > 12 ? 44 : 56, color: C.vermilion, whiteSpace: 'nowrap' }}>{c.name}</span>
                </div>
              ))}
              <svg width={W} height={H} style={{ position: 'absolute', left: -5, top: SVG_Y }}>
                <defs>
                  <clipPath id="ec-l"><rect x={0} y={0} width={LEFT_W * K} height={H} /></clipPath>
                  <clipPath id="ec-r"><rect x={LEFT_W * K} y={0} width={W - LEFT_W * K} height={H} /></clipPath>
                </defs>
                <g clipPath="url(#ec-l)"><Shape c={r.left} px={px} cx={lx} cy={cy} fill={C.vermilion} /></g>
                <g clipPath="url(#ec-r)">
                  <Shape c={r.right} px={px * z} cx={rx} cy={cy} fill={C.vermilion} opacity={revealed ? 1 - 0.45 * reveal : 1} />
                  {revealed ? (
                    <Shape c={r.right} px={px} cx={rx} cy={cy} fill="none" stroke={C.green} dash="22 14" opacity={truthDraw} />
                  ) : null}
                </g>
                <line x1={LEFT_W * K} x2={LEFT_W * K} y1={40} y2={H - 40} stroke={C.tan} strokeWidth={4} strokeDasharray="10 10" />
              </svg>
              {/* Superficies et rappel de la règle (puis des pointillés). */}
              {[{ c: r.left, x: lx }, { c: r.right, x: rx }].map(({ c, x }) => (
                <div key={`a${c.cc}`} style={{ position: 'absolute', top: SVG_Y + H + 12, left: x - 200, width: 400, textAlign: 'center', fontFamily: mono, fontSize: 38, color: C.brown, opacity: reveal }}>
                  {c.area}
                </div>
              ))}
              <div style={{ position: 'absolute', left: 50, right: 50, top: revealed ? SVG_Y + H + 70 : SVG_Y + H + 20, textAlign: 'center', fontFamily: mono, fontSize: revealed ? 34 : 31, lineHeight: 1.35, color: revealed ? C.green : C.brown }}>
                {revealed ? p.truthHint : p.hint}
              </div>
            </div>

            {/* Curseur − ─●─ + */}
            <div style={{ position: 'absolute', top: SLIDER_Y, left: 0, right: 0, height: 120 }}>
              {(['−', '+'] as const).map((s, k) => (
                <div key={s} style={{ position: 'absolute', left: k ? 920 : 50, top: 10, width: 100, height: 100, borderRadius: 26, border: `5px solid ${C.vermilion}`, color: C.vermilion, fontFamily: mono, fontWeight: 700, fontSize: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.card }}>{s}</div>
              ))}
              <div style={{ position: 'absolute', left: TRACK_X0, width: TRACK_X1 - TRACK_X0, top: 50, height: 20, borderRadius: 10, background: C.tan }} />
              <div style={{ position: 'absolute', left: TRACK_X0, width: trackX(z) - TRACK_X0, top: 50, height: 20, borderRadius: 10, background: C.vermilion }} />
              <div
                style={{
                  position: 'absolute', left: trackX(z) - 50, top: 10, width: 100, height: 100, borderRadius: 50, background: '#fff',
                  border: `7px solid ${C.vermilion}`, boxShadow: dragging ? '0 0 0 18px rgba(192,74,26,0.22)' : '0 6px 14px rgba(44,24,16,0.25)',
                  transform: `scale(${dragging ? 1.12 : 1})`,
                }}
              />
            </div>
            <div style={{ position: 'absolute', top: SLIDER_Y + 140, left: 0, right: 0, textAlign: 'center', fontFamily: mono, fontSize: 36, color: C.brown }}>◀ {p.slider} ▶</div>

            {/* Valider, puis le verdict de la paire. */}
            {!revealed ? (
              <div
                style={{
                  position: 'absolute', left: 50, right: 50, top: 1530, height: 170, borderRadius: 34, background: C.green, color: C.parchment,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontWeight: 700, fontSize: 64, letterSpacing: 4,
                  transform: `scale(${pressed ? 0.95 : 1}) translateY(${pressed ? 8 : 0}px)`, boxShadow: pressed ? 'none' : '0 10px 0 #1b4a2a',
                  opacity: lt >= EC.SUBMIT ? interpolate(lt, [EC.SUBMIT + 0.3, EC.REVEAL], [1, 0.4], clamp) : 1,
                }}
              >
                {p.submit}
              </div>
            ) : (
              <div
                style={{
                  position: 'absolute', left: 50, right: 50, top: 1500, height: 230, borderRadius: 40, border: `6px solid ${good ? C.green : C.red}`,
                  background: good ? 'rgba(42,110,63,0.12)' : 'rgba(139,26,26,0.12)', textAlign: 'center',
                  transform: `scale(${0.8 + 0.2 * reveal})`, opacity: Math.min(1, reveal * 2),
                }}
              >
                <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 84, color: C.sepia, marginTop: 30 }}>{r.verdict}</div>
                <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 52, color: good ? C.green : C.red, marginTop: 6 }}>+{shownPts} / 200</div>
              </div>
            )}

            {t >= failAt ? <Stamp text={p.fail} at={failAt + 0.2} color={C.red} rotate={-10} size={150} top={1170} /> : null}
          </>
        ) : (
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: 60, textAlign: 'center' }}>
            <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 200, color: C.vermilion }}>{p.total}</div>
            <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 56, color: C.brown }}>/ {p.max} pts</div>
            <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 104, color: C.sepia, lineHeight: 1.1, marginTop: 40 }}>{p.outro}</div>
            <div style={{ fontFamily: mono, fontSize: 42, color: C.vermilion, marginTop: 30 }}>{p.outroSub}</div>
          </AbsoluteFill>
        )}

        {hookOn > 0 ? (
          <div style={{ opacity: hookOn, position: 'absolute', inset: 0 }}>
            <Hook lines={p.hook} y={24} size={86} />
          </div>
        ) : null}
        <Progress total={end} />
      </Paper>
      <EndCard title={tx.endTitle} cta={p.cta} ctaSub={tx.ctaSub} icon={p.icon} start={end} />

      <Audio src={sfx('music')} volume={(f) => musicVolume(p.voice, f / FPS, 0.45, end)} />
      <VoiceTrack voice={p.voice} />
      <Sfx at={0} src={sfx('hit')} volume={0.6} />
      {p.rounds.map((x, i) => {
        const s0 = pairAt(i);
        const ok = x.points >= 140;
        return [
          <Sfx key={`w${i}`} at={s0} src={sfx('whoosh')} volume={0.5} />,
          ...[0, 1, 2, 3, 4].map((k) => <Sfx key={`k${i}${k}`} at={s0 + EC.MOVE + k * 0.34} src={app('tick')} volume={0.45} />),
          <Sfx key={`t${i}`} at={s0 + EC.SUBMIT} src={app('tap')} volume={0.8} />,
          <Sfx key={`r${i}`} at={s0 + EC.SUBMIT + 0.1} src={sfx('drumroll')} volume={0.35} />,
          ok
            ? <Sfx key={`v${i}`} at={s0 + EC.REVEAL} src={sfx(`coin${Math.min(8, i + 3)}`)} volume={0.8} />
            : <Sfx key={`v${i}`} at={s0 + EC.REVEAL} src={sfx('gameover')} volume={0.8} />,
        ];
      })}
      <Sfx at={failAt + 0.2} src={app('stamp')} volume={0.9} />
      <Sfx at={end} src={app('win')} volume={0.7} />
    </AbsoluteFill>
  );
}
