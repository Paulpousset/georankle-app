/**
 * Quiz animés « plateau TV » (même habillage que PlusOuMoins) : un mode de
 * jeu de l'app (capitales, drapeaux, silhouettes), 6 questions à 4 choix.
 * Le joueur choisit au bout de 4 s, la bonne réponse s'allume, la série
 * monte… et casse à la dernière question. Tout est dessiné ici (quiz.mjs
 * fournit les questions ; render.mjs copie les drapeaux dans public/flags).
 *
 * La première image montre déjà le jeu : l'accroche remplace l'en-tête le
 * temps de la première question.
 */
import { loadFont } from '@remotion/fonts';
import grotesk500 from '@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff2';
import grotesk700 from '@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2';
import inter900 from '@fontsource/inter/files/inter-latin-900-normal.woff2';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const sans = 'Space Grotesk';
const num = 'Inter';
loadFont({ family: sans, url: grotesk500, weight: '500' });
loadFont({ family: sans, url: grotesk700, weight: '700' });
loadFont({ family: num, url: inter900, weight: '900' });

const C = {
  bg: '#07090f',
  blue: '#38bdf8',
  blueSoft: '#7dd3fc',
  muted: '#94a3b8',
  green: '#22c55e',
  red: '#f43f5e',
};

export const QUIZ_FPS = 30;
// Mêmes durées dans quiz.mjs (placement de la voix off).
const HOOK_SHOW_S = 3;
const ROUND_S = 6.4;
const SLIDE_S = 0.6;
const PICK_S = 4.0;
const REVEAL_S = 4.6;
const OUTRO_S = 3.5;

export type QuizRound = {
  country: string;
  cc: string;
  shape?: string;
  prompt: string;
  options: string[];
  answer: number;
  pick: number;
};

export type QuizTVProps = {
  mode: 'capitals' | 'flags' | 'silhouette' | string;
  hook: string[];
  category: string;
  categoryIcon?: string;
  categoryTitle?: string;
  streakTitle?: string;
  questionTitle?: string;
  fail: string;
  rounds: QuizRound[];
  outro: string;
  outroSub: string;
  cta: string;
  icon: string;
  sound?: boolean;
  voice?: { file?: string; at?: number | null }[];
};

export const quizTVSeconds = (p: QuizTVProps) => p.rounds.length * ROUND_S + OUTRO_S;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);

const glass = 'linear-gradient(180deg, #181c26, #0f121a)';
const glassShadow = 'inset 0 1px 0 rgba(255,255,255,0.15), 0 30px 80px rgba(0,0,0,0.5)';

// Ce qu'on demande : drapeau + nom (capitales), grand drapeau, ou silhouette.
const Subject = ({ mode, round, t }: { mode: string; round: QuizRound; t: number }) => {
  if (mode === 'flags') {
    return (
      <div style={{ width: 600, height: 400, borderRadius: 24, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 2px rgba(255,255,255,0.15)', transform: `scale(${1 + 0.01 * Math.sin(t * 2)})` }}>
        <Img src={staticFile(`flags/${round.cc}.svg`)} style={{ width: 600, height: 400, objectFit: 'cover' }} />
      </div>
    );
  }
  if (mode === 'silhouette' && round.shape) {
    return (
      <svg viewBox="0 0 600 600" width={420} height={420} style={{ overflow: 'visible', transform: `rotate(${Math.sin(t * 0.8) * 1.5}deg)` }}>
        <path d={round.shape} fill="rgba(56,189,248,0.2)" stroke={C.blue} strokeWidth={5} strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 18px ${C.blue})` }} />
      </svg>
    );
  }
  const nameSize = Math.min(96, 1300 / Math.max(6, round.country.length));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
      <div style={{ width: 300, height: 200, borderRadius: 20, overflow: 'hidden', boxShadow: '0 16px 50px rgba(0,0,0,0.6), 0 0 0 2px rgba(255,255,255,0.15)' }}>
        <Img src={staticFile(`flags/${round.cc}.svg`)} style={{ width: 300, height: 200, objectFit: 'cover' }} />
      </div>
      <div style={{ fontFamily: sans, fontWeight: 700, fontSize: nameSize, letterSpacing: -1, color: '#fff', textAlign: 'center', lineHeight: 1.05 }}>{round.country}</div>
    </div>
  );
};

const Option = ({ letter, text, state, delay }: { letter: string; text: string; state: 'idle' | 'picked' | 'right' | 'wrong' | 'dim'; delay: number }) => {
  const color = state === 'right' ? C.green : state === 'wrong' ? C.red : state === 'picked' ? C.blue : null;
  const size = text.length > 22 ? 38 : text.length > 16 ? 44 : 50;
  return (
    <div
      style={{
        height: 118,
        borderRadius: 28,
        background: color ? `linear-gradient(180deg, ${color}40, #0f121a), #0f121a` : glass,
        border: `2.5px solid ${color ?? 'rgba(255,255,255,0.14)'}`,
        boxShadow: color ? `0 0 50px ${color}66` : glassShadow,
        display: 'flex',
        alignItems: 'center',
        gap: 28,
        padding: '0 34px',
        opacity: (state === 'dim' ? 0.35 : 1) * clamp01(delay),
        transform: `translateX(${(1 - easeOut(delay)) * 80}px) scale(${state === 'right' || state === 'picked' ? 1.03 : 1})`,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          flexShrink: 0,
          background: color ?? 'rgba(255,255,255,0.08)',
          color: color ? '#04130a' : C.muted,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: sans,
          fontWeight: 700,
          fontSize: 34,
        }}
      >
        {state === 'right' ? '✓' : state === 'wrong' ? '✗' : letter}
      </div>
      <div style={{ fontFamily: sans, fontWeight: 700, fontSize: size, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</div>
    </div>
  );
};

export const QuizTV = (props: QuizTVProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { rounds } = props;
  const total = quizTVSeconds(props);
  const roundsEnd = rounds.length * ROUND_S;
  const inRounds = t < roundsEnd;
  const r = Math.min(rounds.length - 1, Math.floor(t / ROUND_S));
  const rt = t >= roundsEnd ? ROUND_S : t - r * ROUND_S;
  const round = rounds[r];
  const correct = round.pick === round.answer;
  const roundStart = (i: number) => i * ROUND_S;

  const won = rounds.filter((x, i) => x.pick === x.answer && (i < r || (i === r && rt >= REVEAL_S))).length;
  const revealed = rt >= REVEAL_S;
  const broken = r === rounds.length - 1 && !correct && revealed;
  const revealT = rt - REVEAL_S;
  const shake = revealed && !correct && revealT < 0.6 ? 18 * (1 - revealT / 0.6) : 0;
  const sx = shake * (random(`sx${frame}`) - 0.5) * 2;
  const sy = shake * (random(`sy${frame}`) - 0.5) * 2;

  // Entrée de chaque question (sauf la première, déjà là à la 1ʳᵉ image) et sortie.
  const enter = r === 0 ? 1 : easeOut(rt / SLIDE_S);
  const exit = clamp01((rt - (ROUND_S - 0.3)) / 0.3);
  const roundOpacity = enter * (1 - exit);

  const outroT = t - roundsEnd;
  const outroIn = outroT >= 0 ? spring({ frame: frame - Math.round(roundsEnd * fps), fps, config: { damping: 13 } }) : 0;
  const hookOut = clamp01((t - (HOOK_SHOW_S - 0.4)) / 0.4);
  const thinking = inRounds && rt < PICK_S ? 1 - clamp01((rt - SLIDE_S) / (PICK_S - SLIDE_S)) : 0;
  const secondsLeft = thinking > 0 ? PICK_S - Math.max(rt, SLIDE_S) : 0;
  const sfx = (name: string) => staticFile(`sfx/${name}.wav`);
  const glow = revealed ? (correct ? 'rgba(34,197,94,0.22)' : 'rgba(244,63,94,0.25)') : 'rgba(56,189,248,0.2)';

  const stateOf = (i: number): 'idle' | 'picked' | 'right' | 'wrong' | 'dim' => {
    if (rt < PICK_S) return 'idle';
    if (!revealed) return i === round.pick ? 'picked' : 'dim';
    if (i === round.answer) return 'right';
    if (i === round.pick) return 'wrong';
    return 'dim';
  };

  return (
    <AbsoluteFill style={{ background: C.bg, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: -60,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          transform: `translateY(${(t * 12) % 60}px)`,
          maskImage: 'radial-gradient(circle at 50% 40%, #000 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(circle at 50% 40%, #000 30%, transparent 75%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 1000,
          height: 1000,
          left: 40,
          top: 200,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${glow}, transparent 65%)`,
          transform: `scale(${1 + 0.04 * Math.sin(t * 1.5)})`,
        }}
      />

      <div style={{ position: 'absolute', inset: 0, opacity: 1 - clamp01(outroT / 0.5), transform: `translate(${sx}px, ${sy}px)`, filter: outroT > 0 ? `blur(${14 * clamp01(outroT / 0.5)}px)` : undefined }}>
        {/* En-tête : accroche puis mode ; série à droite. */}
        <div style={{ position: 'absolute', top: 150, left: 70, right: 70, height: 110 }}>
          {t < HOOK_SHOW_S ? (
            <div style={{ position: 'absolute', left: 0, top: 0, opacity: 1 - hookOut }}>
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 60, lineHeight: 1.05, color: '#fff', whiteSpace: 'nowrap' }}>{props.hook[0]}</div>
              {props.hook[1] ? <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 36, color: C.blueSoft, marginTop: 8, whiteSpace: 'nowrap' }}>{props.hook[1]}</div> : null}
            </div>
          ) : null}
          <div style={{ position: 'absolute', left: 0, top: 0, display: 'flex', alignItems: 'center', gap: 22, opacity: hookOut, transform: `translateX(${(1 - hookOut) * -30}px)` }}>
            <div style={{ width: 96, height: 96, borderRadius: 24, background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52 }}>{props.categoryIcon ?? '❓'}</div>
            <div>
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 26, letterSpacing: 6, color: C.blueSoft }}>{props.categoryTitle ?? ''}</div>
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 60, lineHeight: 1, color: '#fff' }}>{props.category}</div>
            </div>
          </div>
          <div style={{ position: 'absolute', right: 0, top: 0, textAlign: 'right', opacity: hookOut }}>
            <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 26, letterSpacing: 6, color: C.muted }}>{props.streakTitle ?? ''}</div>
            <div
              style={{
                fontFamily: sans,
                fontWeight: 700,
                fontSize: 60,
                lineHeight: 1,
                color: broken ? C.red : '#fff',
                transform: `scale(${revealed && correct && revealT < 0.6 ? 1 + 0.35 * Math.exp(-revealT * 6) : 1})`,
                transformOrigin: 'right center',
              }}
            >
              🔥 {won}
            </div>
          </div>
        </div>

        {/* Progression : QUESTION n/6 et pastilles. */}
        <div style={{ position: 'absolute', top: 300, left: 70, right: 70, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 26, letterSpacing: 6, color: C.muted }}>
            {props.questionTitle ?? 'QUESTION'} {r + 1}/{rounds.length}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {rounds.map((x, i) => {
              const done = i < r || (i === r && revealed);
              const ok = x.pick === x.answer;
              return (
                <div
                  key={i}
                  style={{
                    width: 46,
                    height: 10,
                    borderRadius: 5,
                    background: done ? (ok ? C.green : C.red) : i === r ? C.blue : 'rgba(255,255,255,0.12)',
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Question. */}
        <div style={{ position: 'absolute', inset: 0, opacity: roundOpacity, transform: `translateX(${(1 - enter) * 120 - exit * 120}px)` }}>
          <div
            style={{
              position: 'absolute',
              top: 350,
              left: 70,
              width: 940,
              height: 560,
              borderRadius: 36,
              background: glass,
              border: '2px solid rgba(255,255,255,0.14)',
              boxShadow: glassShadow,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 28,
              overflow: 'hidden',
            }}
          >
            <Subject mode={props.mode} round={round} t={t} />
            {props.mode !== 'capitals' ? null : (
              <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 34, color: C.muted }}>{round.prompt}</div>
            )}
          </div>
          {props.mode === 'capitals' ? null : (
            <div style={{ position: 'absolute', top: 935, left: 70, right: 70, textAlign: 'center', fontFamily: sans, fontWeight: 700, fontSize: 40, color: '#fff' }}>{round.prompt}</div>
          )}

          {/* Réponses. */}
          <div style={{ position: 'absolute', top: props.mode === 'capitals' ? 960 : 1010, left: 70, right: 70, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {round.options.map((o, i) => (
              <Option key={i} letter={'ABCD'[i]} text={o} state={stateOf(i)} delay={r === 0 ? 1 : (rt - 0.15 - i * 0.08) / 0.35} />
            ))}
          </div>
        </div>

        {/* Chrono. */}
        <div style={{ position: 'absolute', top: 1600, left: 70, right: 70, display: 'flex', alignItems: 'center', gap: 20, fontFamily: sans, fontWeight: 500, fontSize: 28, color: C.muted, opacity: thinking > 0 ? 1 : 0.35 }}>
          <span>⏱</span>
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.1)' }}>
            <div style={{ width: `${100 * thinking}%`, height: '100%', borderRadius: 4, background: thinking < 0.3 ? C.red : C.blue }} />
          </div>
          <span style={{ width: 80, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{secondsLeft.toFixed(1).replace('.', ',')} s</span>
        </div>

        {/* « Raté ! » */}
        {broken ? (
          <div
            style={{
              position: 'absolute',
              top: 380,
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'center',
              zIndex: 3,
              transform: `rotate(-6deg) scale(${spring({ frame: frame - Math.round((roundStart(r) + REVEAL_S) * fps), fps, config: { damping: 9 } })})`,
            }}
          >
            <div style={{ padding: '18px 56px', borderRadius: 24, background: C.red, color: '#fff', fontFamily: sans, fontWeight: 700, fontSize: 110, letterSpacing: 2, boxShadow: `0 0 80px ${C.red}, 0 20px 50px rgba(0,0,0,0.6)` }}>
              {props.fail}
            </div>
          </div>
        ) : null}
      </div>

      {/* Fin : la série et l'appel à jouer. */}
      {outroT >= 0 ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 30 }}>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 30, letterSpacing: 8, color: C.muted, transform: `scale(${outroIn})` }}>{props.streakTitle ?? ''}</div>
          <div style={{ fontFamily: num, fontWeight: 900, fontSize: 220, lineHeight: 1, color: '#fff', letterSpacing: -6, transform: `scale(${outroIn})` }}>
            🔥 {rounds.filter((x) => x.pick === x.answer).length}
          </div>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 100, color: C.blue, transform: `scale(${outroIn})`, textAlign: 'center', lineHeight: 1.05 }}>{props.outro}</div>
          <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 46, color: '#fff', transform: `scale(${outroIn})` }}>{props.outroSub}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 40, opacity: clamp01((outroT - 0.5) / 0.4) }}>
            <Img src={staticFile(props.icon)} style={{ width: 110, height: 110, borderRadius: 26 }} />
            <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 44, color: '#fff' }}>{props.cta}</div>
          </div>
        </AbsoluteFill>
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
          <Audio src={sfx('boom')} volume={0.8} />
          {rounds.map((x, i) => (
            <Sequence key={i} from={Math.round(roundStart(i) * fps)} layout="none">
              {i > 0 ? <Audio src={sfx('whoosh')} volume={0.5} /> : null}
              {[1.4, 2.2, 2.9, 3.5].map((k) => (
                <Sequence key={k} from={Math.round(k * fps)} layout="none">
                  <Audio src={sfx('tick')} volume={0.8} />
                </Sequence>
              ))}
              <Sequence from={Math.round(PICK_S * fps)} layout="none">
                <Audio src={sfx('pop')} volume={0.8} />
                <Audio src={sfx('drumroll')} volume={0.3} />
              </Sequence>
              <Sequence from={Math.round(REVEAL_S * fps)} layout="none">
                {x.pick === x.answer ? (
                  <>
                    <Audio src={sfx('ding')} volume={0.75} />
                    <Audio src={sfx(`coin${Math.min(8, i + 1)}`)} volume={0.6} />
                  </>
                ) : (
                  <>
                    <Audio src={sfx('gameover')} volume={0.8} />
                    <Audio src={sfx('boom')} volume={0.7} />
                  </>
                )}
              </Sequence>
            </Sequence>
          ))}
          <Sequence from={Math.round(roundsEnd * fps)} layout="none">
            <Audio src={sfx('whoosh')} volume={0.5} />
            <Audio src={sfx('powerup')} volume={0.6} />
          </Sequence>
        </>
      )}
    </AbsoluteFill>
  );
};
