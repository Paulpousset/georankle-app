/**
 * Format « plus ou moins », style plateau TV : fond noir mat quadrillé, deux
 * cartes en verre (drapeau net, nom, continent, chiffre, barre de
 * comparaison). On parie PLUS ou MOINS, la valeur du pays du bas défile
 * jusqu'au vrai chiffre, les barres se recalent, la série monte… et casse à
 * la dernière manche. Aucune capture de l'app : tout est dessiné ici
 * (plusmoins.mjs fournit les pays et les chiffres ; render.mjs copie les
 * drapeaux dans public/flags).
 *
 * La première image montre déjà le jeu : l'accroche remplace l'en-tête le
 * temps de la première manche.
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

export const PLUS_FPS = 30;
// Mêmes durées dans plusmoins.mjs (placement de la voix off).
const HOOK_S = 0;
const HOOK_SHOW_S = 3;
const ROUND_S = 6.2;
const SLIDE_S = 0.6;
const PICK_S = 4.0;
const COUNT_S = 0.9;
const OUTRO_S = 3.5;

export type Card = { name: string; flag: string; cc?: string; region?: string; value: number; display: string };
export type PlusRound = { higher: boolean; pick: boolean };

export type PlusOuMoinsProps = {
  hook: string[];
  label: string;
  category?: string;
  categoryIcon?: string;
  categoryTitle?: string;
  streakTitle?: string;
  moreSub?: string;
  lessSub?: string;
  has?: string;
  hasQ?: string;
  more: string;
  less: string;
  streak: string;
  fail: string;
  cards: Card[];
  rounds: PlusRound[];
  outro: string;
  outroSub: string;
  cta: string;
  icon: string;
  sound?: boolean;
  voice?: { file?: string; at?: number | null }[];
};

export const plusOuMoinsSeconds = (p: PlusOuMoinsProps) => HOOK_S + p.rounds.length * ROUND_S + OUTRO_S;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const easeInOut = (x: number) => {
  const k = clamp01(x);
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
};

// Le chiffre qui défile garde le format de display (« 68,5 M », « 643 801 »).
function rolling(card: Card, k: number) {
  if (k >= 1) return card.display;
  const v = card.value * easeOut(k);
  const m = card.display.match(/^([\d\s.,]+)(.*)$/);
  if (!m) return card.display;
  const target = m[1].trim();
  const decimals = (target.split(/[.,]/)[1] ?? '').length;
  const sep = target.includes(',') ? ',' : '.';
  const scaleOf = card.value / (Number(target.replace(/\s/g, '').replace(',', '.')) || 1);
  const shown = v / scaleOf;
  const grouped = target.includes(' ') || (target.length > 4 && !/[.,]/.test(target));
  let text = decimals ? shown.toFixed(decimals).replace('.', sep) : Math.round(shown).toString();
  if (grouped) text = Math.round(shown).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
  return `${text}${card.display.slice(m[1].trimEnd().length)}`;
}

const CARD_H = 400;
const TOP_Y = 420;
const BOTTOM_Y = 900;

// Carte en verre : drapeau, nom, continent, chiffre, barre.
const CardView = ({
  card,
  y,
  opacity,
  value,
  label,
  state,
  scale,
  bar,
  hidden,
}: {
  card: Card;
  y: number;
  opacity: number;
  value: string;
  label: string;
  state: 'idle' | 'ok' | 'ko';
  scale: number;
  bar: number;
  hidden: boolean;
}) => {
  const accent = state === 'ok' ? C.green : state === 'ko' ? C.red : null;
  const nameSize = Math.min(72, 950 / Math.max(6, card.name.length));
  return (
    <div
      style={{
        position: 'absolute',
        left: 70,
        width: 940,
        top: y,
        height: CARD_H,
        opacity,
        transform: `scale(${scale})`,
        borderRadius: 36,
        background: accent
          ? `linear-gradient(180deg, ${accent}33, #0f121a), #0f121a`
          : 'linear-gradient(180deg, #181c26, #0f121a)',
        border: `2px solid ${accent ?? 'rgba(255,255,255,0.14)'}`,
        boxShadow: accent
          ? `0 0 70px ${accent}66, inset 0 1px 0 rgba(255,255,255,0.15)`
          : 'inset 0 1px 0 rgba(255,255,255,0.15), 0 30px 80px rgba(0,0,0,0.5)',
        padding: '44px 48px',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
        <div style={{ width: 200, height: 150, borderRadius: 18, overflow: 'hidden', flexShrink: 0, boxShadow: '0 10px 30px rgba(0,0,0,0.5), 0 0 0 2px rgba(255,255,255,0.15)', background: '#1e293b' }}>
          {card.cc ? (
            <Img src={staticFile(`flags/${card.cc}.svg`)} style={{ width: 200, height: 150, objectFit: 'cover' }} />
          ) : (
            <div style={{ fontSize: 120, lineHeight: '150px', textAlign: 'center' }}>{card.flag}</div>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: nameSize, letterSpacing: -1, lineHeight: 1.05, color: '#fff', whiteSpace: 'nowrap' }}>{card.name}</div>
          {card.region ? <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 28, color: C.muted, letterSpacing: 3, marginTop: 10 }}>{card.region}</div> : null}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginTop: 40 }}>
        <span
          style={{
            fontFamily: num,
            fontWeight: 900,
            fontSize: 120,
            letterSpacing: -4,
            lineHeight: 1,
            color: hidden ? C.blue : '#fff',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {hidden ? '? ? ?' : value}
        </span>
        <span style={{ fontFamily: sans, fontWeight: 500, fontSize: 38, color: C.muted }}>{label}</span>
      </div>
      <div style={{ marginTop: 26, height: 16, borderRadius: 8, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        {hidden ? (
          <div style={{ width: '100%', height: '100%', background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.12) 0 12px, transparent 12px 24px)' }} />
        ) : (
          <div style={{ width: `${100 * bar}%`, height: '100%', borderRadius: 8, background: accent ?? C.blue, boxShadow: `0 0 20px ${accent ?? C.blue}` }} />
        )}
      </div>
    </div>
  );
};

const Button = ({
  text,
  sub,
  arrow,
  color,
  filled,
  active,
  dim,
  pulse,
}: {
  text: string;
  sub?: string;
  arrow: string;
  color: string;
  filled: boolean;
  active: number;
  dim: boolean;
  pulse: number;
}) => {
  const solid = filled || active > 0;
  return (
    <div
      style={{
        flex: 1,
        height: 150,
        borderRadius: 28,
        background: solid ? color : 'transparent',
        border: `2.5px solid ${color}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: sans,
        fontWeight: 700,
        fontSize: 52,
        letterSpacing: 2,
        color: solid ? '#04130a' : color,
        opacity: dim ? 0.3 : 1,
        transform: `scale(${1 + 0.08 * active + 0.02 * pulse})`,
        boxShadow: active > 0 ? `0 0 60px ${color}aa` : 'none',
      }}
    >
      <span>
        {arrow} {text}
      </span>
      {sub ? <span style={{ fontSize: 24, letterSpacing: 4, opacity: 0.75, fontWeight: 500 }}>{sub}</span> : null}
    </div>
  );
};

export const PlusOuMoins = (props: PlusOuMoinsProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { cards, rounds } = props;
  const total = plusOuMoinsSeconds(props);
  const roundsEnd = HOOK_S + rounds.length * ROUND_S;
  const inRounds = t >= HOOK_S && t < roundsEnd;
  const r = Math.min(rounds.length - 1, Math.max(0, Math.floor((t - HOOK_S) / ROUND_S)));
  const rt = t < HOOK_S ? -1 : t >= roundsEnd ? ROUND_S : t - HOOK_S - r * ROUND_S;
  const round = rounds[r];
  const correct = round.pick === round.higher;
  const roundStart = (i: number) => HOOK_S + i * ROUND_S;

  // Série affichée : manches gagnées, jusqu'au verdict de la manche en cours.
  const verdictAt = PICK_S + 0.1 + COUNT_S;
  const won = rounds.filter((x, i) => x.pick === x.higher && (i < r || (i === r && rt >= verdictAt))).length;
  const broken = r === rounds.length - 1 && !correct && rt >= verdictAt;

  // Au début d'une manche (sauf la première), la carte du bas monte à la place de celle du haut.
  const slide = r > 0 ? easeInOut(rt / SLIDE_S) : 1;
  const pickT = rt - PICK_S;
  const countK = (rt - PICK_S - 0.1) / COUNT_S;
  const state: 'idle' | 'ok' | 'ko' = rt >= verdictAt ? (correct ? 'ok' : 'ko') : 'idle';
  const verdictT = rt - verdictAt;
  const bump = verdictT >= 0 ? 1 + 0.05 * Math.exp(-verdictT * 7) * Math.cos(verdictT * 20) : 1;
  const shake = state === 'ko' && verdictT < 0.6 ? 18 * (1 - verdictT / 0.6) : 0;
  const sx = shake * (random(`sx${frame}`) - 0.5) * 2;
  const sy = shake * (random(`sy${frame}`) - 0.5) * 2;

  // Barres : avant le verdict, celle du haut est à 60 % ; pendant le
  // décompte, les deux se recalent sur le plus grand des deux chiffres.
  const a = cards[r].value;
  const b = cards[r + 1].value;
  const max = Math.max(a, b);
  const barK = easeOut(countK);
  const topBar = 0.6 + (a / max - 0.6) * barK;
  const bottomBar = (b / max) * barK;

  const outroT = t - roundsEnd;
  const outroIn = outroT >= 0 ? spring({ frame: frame - Math.round(roundsEnd * fps), fps, config: { damping: 13 } }) : 0;
  const gameOut = clamp01(outroT / 0.5);
  const hookOut = clamp01((t - (HOOK_SHOW_S - 0.4)) / 0.4);
  const thinking = inRounds && rt < PICK_S ? 1 - clamp01((rt - SLIDE_S) / (PICK_S - SLIDE_S)) : 0;
  const secondsLeft = thinking > 0 ? PICK_S - Math.max(rt, SLIDE_S) : 0;
  const sfx = (name: string) => staticFile(`sfx/${name}.wav`);
  const vsTop = (TOP_Y + CARD_H + BOTTOM_Y) / 2 - 70;

  return (
    <AbsoluteFill style={{ background: C.bg, overflow: 'hidden' }}>
      {/* Quadrillage qui défile lentement, et halo qui prend la couleur du verdict. */}
      <div
        style={{
          position: 'absolute',
          inset: -60,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          transform: `translateY(${(t * 12) % 60}px)`,
          maskImage: 'radial-gradient(circle at 50% 45%, #000 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(circle at 50% 45%, #000 30%, transparent 75%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 1000,
          height: 1000,
          left: 40,
          top: 360,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${state === 'ok' ? 'rgba(34,197,94,0.22)' : state === 'ko' ? 'rgba(244,63,94,0.25)' : 'rgba(56,189,248,0.2)'}, transparent 65%)`,
          transform: `scale(${1 + 0.04 * Math.sin(t * 1.5)})`,
        }}
      />

      <div style={{ position: 'absolute', inset: 0, opacity: 1 - gameOut, transform: `translate(${sx}px, ${sy}px)`, filter: gameOut > 0 ? `blur(${14 * gameOut}px)` : undefined }}>
        {/* En-tête : l'accroche les 3 premières secondes, puis la catégorie ; la série à droite. */}
        <div style={{ position: 'absolute', top: 150, left: 70, right: 70, height: 110 }}>
          {t < HOOK_SHOW_S ? (
            <div style={{ position: 'absolute', left: 0, top: 0, opacity: 1 - hookOut }}>
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 64, lineHeight: 1.05, color: '#fff', whiteSpace: 'nowrap' }}>{props.hook[0]}</div>
              {props.hook[1] ? <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 36, color: C.blueSoft, marginTop: 8, whiteSpace: 'nowrap' }}>{props.hook[1]}</div> : null}
            </div>
          ) : null}
          <div style={{ position: 'absolute', left: 0, top: 0, display: 'flex', alignItems: 'center', gap: 22, opacity: hookOut, transform: `translateX(${(1 - hookOut) * -30}px)` }}>
            <div style={{ width: 96, height: 96, borderRadius: 24, background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52 }}>{props.categoryIcon ?? '📊'}</div>
            <div>
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 26, letterSpacing: 6, color: C.blueSoft }}>{props.categoryTitle ?? ''}</div>
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 60, lineHeight: 1, color: '#fff' }}>{props.category ?? props.label}</div>
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
                transform: `scale(${state === 'ok' && verdictT < 0.6 ? 1 + 0.35 * Math.exp(-verdictT * 6) : 1})`,
                transformOrigin: 'right center',
              }}
            >
              🔥 {won}
            </div>
          </div>
        </div>

        {/* Les cartes. */}
        {r > 0 && slide < 1 ? (
          <CardView card={cards[r - 1]} y={TOP_Y - slide * 480} opacity={1 - slide} value={cards[r - 1].display} label={props.label} state="idle" scale={1} bar={0.6} hidden={false} />
        ) : null}
        <CardView
          card={cards[r]}
          y={r > 0 ? BOTTOM_Y + (TOP_Y - BOTTOM_Y) * slide : TOP_Y}
          opacity={1}
          value={cards[r].display}
          label={props.label}
          state="idle"
          scale={1}
          bar={topBar}
          hidden={false}
        />
        <CardView
          card={cards[r + 1]}
          y={BOTTOM_Y + (1 - slide) * 260}
          opacity={slide}
          value={countK > 0 ? rolling(cards[r + 1], countK) : '?'}
          label={props.label}
          state={state}
          scale={bump}
          bar={bottomBar}
          hidden={countK <= 0}
        />

        {/* VS / verdict. */}
        <div
          style={{
            position: 'absolute',
            left: 540 - 70,
            top: vsTop,
            width: 140,
            height: 140,
            borderRadius: 70,
            background: state === 'ok' ? C.green : state === 'ko' ? C.red : C.bg,
            border: `2px solid ${state === 'idle' ? 'rgba(255,255,255,0.25)' : 'transparent'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: sans,
            fontWeight: 700,
            fontSize: state === 'idle' ? 44 : 70,
            color: '#fff',
            transform: `scale(${bump * (state === 'idle' ? 1 : 1.1) * (0.6 + 0.4 * slide)})`,
            opacity: slide,
            boxShadow: state === 'idle' ? 'none' : `0 0 50px ${state === 'ok' ? C.green : C.red}`,
            zIndex: 2,
          }}
        >
          {state === 'ok' ? '✓' : state === 'ko' ? '✗' : 'VS'}
        </div>

        {/* PLUS / MOINS. */}
        <div style={{ position: 'absolute', top: 1450, left: 70, right: 70, display: 'flex', gap: 30 }}>
          <Button
            text={props.more}
            sub={props.moreSub}
            arrow="▲"
            color={C.green}
            filled
            active={round.pick && pickT >= 0 ? easeOut(pickT / 0.15) : 0}
            dim={!round.pick && pickT >= 0}
            pulse={pickT < 0 && rt > SLIDE_S ? Math.sin(rt * 10) : 0}
          />
          <Button
            text={props.less}
            sub={props.lessSub}
            arrow="▼"
            color={C.red}
            filled={false}
            active={!round.pick && pickT >= 0 ? easeOut(pickT / 0.15) : 0}
            dim={round.pick && pickT >= 0}
            pulse={pickT < 0 && rt > SLIDE_S ? Math.sin(rt * 10 + Math.PI) : 0}
          />
        </div>

        {/* Chrono. */}
        <div style={{ position: 'absolute', top: 1636, left: 70, right: 70, display: 'flex', alignItems: 'center', gap: 20, fontFamily: sans, fontWeight: 500, fontSize: 28, color: C.muted, opacity: thinking > 0 ? 1 : 0.35 }}>
          <span>⏱</span>
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.1)' }}>
            <div style={{ width: `${100 * thinking}%`, height: '100%', borderRadius: 4, background: thinking < 0.3 ? C.red : C.blue }} />
          </div>
          <span style={{ width: 80, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{secondsLeft.toFixed(1).replace('.', ',')} s</span>
        </div>

        {/* « Raté ! » */}
        {state === 'ko' ? (
          <div
            style={{
              position: 'absolute',
              top: vsTop - 20,
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'center',
              zIndex: 3,
              transform: `rotate(-6deg) scale(${spring({ frame: frame - Math.round((roundStart(r) + verdictAt) * fps), fps, config: { damping: 9 } })})`,
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
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 30, letterSpacing: 8, color: C.muted, transform: `scale(${outroIn})` }}>{(props.streakTitle ?? props.streak).toUpperCase()}</div>
          <div style={{ fontFamily: num, fontWeight: 900, fontSize: 220, lineHeight: 1, color: '#fff', letterSpacing: -6, transform: `scale(${outroIn})` }}>
            🔥 {rounds.filter((x) => x.pick === x.higher).length}
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
                <Audio src={sfx('drumroll')} volume={0.35} />
              </Sequence>
              <Sequence from={Math.round(verdictAt * fps)} layout="none">
                {x.pick === x.higher ? (
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
