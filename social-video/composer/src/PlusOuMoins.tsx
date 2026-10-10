/**
 * Format « plus ou moins » : deux pays l'un sous l'autre, une statistique
 * (population, superficie…). On parie PLUS ou MOINS, la valeur du second
 * défile jusqu'au vrai chiffre, la série monte… et casse à la dernière
 * manche. Aucune capture de l'app : tout est dessiné ici (plusmoins.mjs
 * fournit les pays et les chiffres).
 *
 * Zones sûres : rien d'important au-dessus de 200 px, sous 1 650 px, ni dans
 * la colonne de droite (boutons des apps).
 */
import { loadFont } from '@remotion/fonts';
import playfair800 from '@fontsource/playfair-display/files/playfair-display-latin-800-normal.woff2';
import montserrat600 from '@fontsource/montserrat/files/montserrat-latin-600-normal.woff2';
import montserrat800 from '@fontsource/montserrat/files/montserrat-latin-800-normal.woff2';
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

const display = 'Playfair Display';
const sans = 'Montserrat';
loadFont({ family: display, url: playfair800, weight: '800' });
loadFont({ family: sans, url: montserrat600, weight: '600' });
loadFont({ family: sans, url: montserrat800, weight: '800' });

const C = {
  night: '#060a18',
  card: '#101a33',
  parchment: '#f2e8d0',
  gold: '#f5b942',
  red: '#ff3b4a',
  green: '#3ddc84',
};

export const PLUS_FPS = 30;
// Mêmes durées dans plusmoins.mjs (placement de la voix off).
const HOOK_S = 2.8;
const ROUND_S = 3.6;
const SLIDE_S = 0.5;
const PICK_S = 1.9;
const COUNT_S = 0.9;
const OUTRO_S = 3.5;

export type Card = { name: string; flag: string; value: number; display: string };
export type PlusRound = { higher: boolean; pick: boolean };

export type PlusOuMoinsProps = {
  hook: string[];
  label: string;
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
const goldText = {
  background: `linear-gradient(180deg, #fff3c4, ${C.gold} 55%, #c9821c)`,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
} as const;

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
  if (grouped) text = Math.round(shown).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
  return `${text}${card.display.slice(m[1].trimEnd().length)}`;
}

const CardView = ({
  card,
  label,
  y,
  opacity,
  value,
  state,
  scale,
}: {
  card: Card;
  label: string;
  y: number;
  opacity: number;
  value: string;
  state: 'idle' | 'ok' | 'ko';
  scale: number;
}) => {
  const border = state === 'ok' ? C.green : state === 'ko' ? C.red : 'rgba(245,185,66,0.55)';
  const glow = state === 'ok' ? `0 0 60px ${C.green}88` : state === 'ko' ? `0 0 60px ${C.red}99` : '0 20px 60px rgba(0,0,0,0.55)';
  const nameSize = Math.min(80, 1150 / Math.max(8, card.name.length));
  return (
    <div
      style={{
        position: 'absolute',
        left: 90,
        width: 800,
        top: y,
        height: 440,
        opacity,
        transform: `scale(${scale})`,
        borderRadius: 44,
        background: `linear-gradient(160deg, #18264a, ${C.card} 60%, #0a1124)`,
        border: `4px solid ${border}`,
        boxShadow: glow,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        overflow: 'hidden',
      }}
    >
      <div style={{ fontSize: 150, lineHeight: 1.05 }}>{card.flag}</div>
      <div style={{ fontFamily: display, fontWeight: 800, fontSize: nameSize, color: C.parchment, lineHeight: 1.1 }}>{card.name}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 8 }}>
        <span style={{ fontFamily: sans, fontWeight: 800, fontSize: 92, ...goldText, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {value !== '?' ? <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 38, color: 'rgba(242,232,208,0.75)' }}>{label}</span> : null}
      </div>
    </div>
  );
};

const Button = ({ text, arrow, color, active, dim, pulse }: { text: string; arrow: string; color: string; active: number; dim: boolean; pulse: number }) => (
  <div
    style={{
      width: 380,
      height: 140,
      borderRadius: 70,
      background: active > 0 ? color : 'rgba(255,255,255,0.06)',
      border: `4px solid ${color}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 18,
      fontFamily: sans,
      fontWeight: 800,
      fontSize: 58,
      color: active > 0 ? '#0b0f1c' : color,
      opacity: dim ? 0.3 : 1,
      transform: `scale(${1 + 0.12 * active + 0.03 * pulse})`,
      boxShadow: active > 0 ? `0 0 70px ${color}` : 'none',
    }}
  >
    <span>{arrow}</span>
    <span>{text}</span>
  </div>
);

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
  const isLast = r === rounds.length - 1;

  // Série affichée : manches gagnées, jusqu'au verdict de la manche en cours.
  const verdictAt = PICK_S + 0.1 + COUNT_S;
  const won = rounds.filter((x, i) => x.pick === x.higher && (i < r || (i === r && rt >= verdictAt))).length;
  const broken = isLast && !correct && rt >= verdictAt;

  // Cartes : A en haut, B en bas ; au début d'une manche, B monte à la place de A.
  const slide = r > 0 ? easeOut(rt / SLIDE_S) : 1;
  const topY = 380;
  const bottomY = 870;
  const intro = spring({ frame: frame - Math.round((HOOK_S - 0.6) * fps), fps, config: { damping: 14 } });
  const pickT = rt - PICK_S;
  const countK = (rt - PICK_S - 0.1) / COUNT_S;
  const state: 'idle' | 'ok' | 'ko' = rt >= verdictAt ? (correct ? 'ok' : 'ko') : 'idle';
  const verdictT = rt - verdictAt;
  const bump = verdictT >= 0 ? 1 + 0.06 * Math.exp(-verdictT * 7) * Math.cos(verdictT * 20) : 1;
  const shake = state === 'ko' && verdictT < 0.6 ? 18 * (1 - verdictT / 0.6) : 0;
  const sx = shake * (random(`sx${frame}`) - 0.5) * 2;
  const sy = shake * (random(`sy${frame}`) - 0.5) * 2;

  const outroT = t - roundsEnd;
  const outroIn = outroT >= 0 ? spring({ frame: frame - Math.round(roundsEnd * fps), fps, config: { damping: 13 } }) : 0;
  const hookOut = clamp01((t - (HOOK_S - 0.5)) / 0.4);
  const sfx = (name: string) => staticFile(`sfx/${name}.wav`);
  const roundStart = (i: number) => HOOK_S + i * ROUND_S;
  const bigFlag = cards[Math.min(cards.length - 1, r + 1)].flag;

  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 40%, #13224a, ${C.night} 70%)`, overflow: 'hidden' }}>
      {/* Grand drapeau flou du pays en jeu, qui tourne lentement. */}
      <div
        style={{
          position: 'absolute',
          left: -300,
          top: 300,
          width: 1680,
          textAlign: 'center',
          fontSize: 1100,
          lineHeight: 1,
          opacity: 0.1,
          filter: 'blur(30px)',
          transform: `rotate(${-8 + t * 2}deg)`,
        }}
      >
        {bigFlag}
      </div>
      {/* Balayage de lumière. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(115deg, transparent ${30 + ((t * 18) % 140) - 40}%, rgba(255,255,255,0.05) ${40 + ((t * 18) % 140) - 40}%, transparent ${50 + ((t * 18) % 140) - 40}%)`,
        }}
      />

      {/* Accroche. */}
      {t < HOOK_S ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: 1 - hookOut, transform: `translateY(${-hookOut * 300}px)` }}>
          {props.hook.map((line, i) => {
            const s = spring({ frame: frame - i * 8, fps, config: { damping: 12 } });
            return (
              <div
                key={i}
                style={{
                  fontFamily: i === 0 ? display : sans,
                  fontWeight: 800,
                  fontSize: i === 0 ? 110 : 56,
                  textAlign: 'center',
                  maxWidth: 900,
                  lineHeight: 1.1,
                  marginTop: i === 0 ? 0 : 30,
                  ...(i === 0 ? goldText : { color: '#fff' }),
                  transform: `scale(${s})`,
                  filter: 'drop-shadow(0 8px 30px rgba(0,0,0,0.8))',
                }}
              >
                {line}
              </div>
            );
          })}
        </AbsoluteFill>
      ) : null}

      {/* Bandeau : la question et la série. */}
      {t >= HOOK_S - 0.6 && outroT < 0.4 ? (
        <div style={{ position: 'absolute', top: 210, left: 90, width: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: intro * (1 - clamp01(outroT / 0.4)) }}>
          <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 44, color: C.parchment, maxWidth: 560 }}>{props.hook[0]}</div>
          <div
            style={{
              fontFamily: sans,
              fontWeight: 800,
              fontSize: 52,
              padding: '14px 30px',
              borderRadius: 40,
              background: broken ? C.red : 'rgba(245,185,66,0.15)',
              border: `3px solid ${broken ? C.red : C.gold}`,
              color: broken ? '#fff' : C.gold,
              transform: `scale(${state === 'ok' && verdictT < 0.5 ? 1 + 0.3 * Math.exp(-verdictT * 6) : 1})`,
            }}
          >
            🔥 {won}
          </div>
        </div>
      ) : null}

      {/* Les deux cartes. */}
      {t >= HOOK_S - 0.6 && outroT < 0.5 ? (
        <div style={{ position: 'absolute', inset: 0, transform: `translate(${sx}px, ${sy}px)`, opacity: 1 - clamp01(outroT / 0.5) }}>
          {/* Carte qui sort par le haut. */}
          {r > 0 && slide < 1 ? (
            <CardView card={cards[r - 1]} label={props.label} y={topY - slide * 520} opacity={1 - slide} value={cards[r - 1].display} state="idle" scale={1} />
          ) : null}
          <CardView
            card={cards[r]}
            label={props.label}
            y={(r > 0 ? bottomY + (topY - bottomY) * slide : topY + (1 - intro) * 300)}
            opacity={r > 0 ? 1 : intro}
            value={cards[r].display}
            state="idle"
            scale={1}
          />
          <CardView
            card={cards[r + 1]}
            label={props.label}
            y={bottomY + (1 - (r > 0 ? slide : intro)) * 900}
            opacity={1}
            value={countK > 0 ? rolling(cards[r + 1], countK) : '?'}
            state={state}
            scale={bump * (rt < PICK_S && rt > SLIDE_S ? 1 + 0.015 * Math.sin(rt * 9) : 1)}
          />
          {/* Pastille entre les cartes. */}
          <div
            style={{
              position: 'absolute',
              left: 490 - 70,
              top: (topY + 440 + bottomY) / 2 - 70,
              width: 140,
              height: 140,
              borderRadius: 70,
              background: state === 'ok' ? C.green : state === 'ko' ? C.red : C.gold,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 70,
              fontFamily: sans,
              fontWeight: 800,
              color: '#0b0f1c',
              boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
              transform: `scale(${(r > 0 ? 1 : intro) * bump})`,
            }}
          >
            {state === 'ok' ? '✓' : state === 'ko' ? '✗' : 'VS'}
          </div>
          {/* PLUS / MOINS. */}
          <div style={{ position: 'absolute', top: 1360, left: 90, width: 800, display: 'flex', justifyContent: 'space-between', opacity: r > 0 ? 1 : intro }}>
            <Button
              text={props.more}
              arrow="▲"
              color={C.green}
              active={round.pick && pickT >= 0 ? easeOut(pickT / 0.15) : 0}
              dim={!round.pick && pickT >= 0}
              pulse={pickT < 0 && rt > SLIDE_S ? Math.sin(rt * 10) : 0}
            />
            <Button
              text={props.less}
              arrow="▼"
              color={C.red}
              active={!round.pick && pickT >= 0 ? easeOut(pickT / 0.15) : 0}
              dim={round.pick && pickT >= 0}
              pulse={pickT < 0 && rt > SLIDE_S ? Math.sin(rt * 10 + Math.PI) : 0}
            />
          </div>
          {/* Temps de réflexion : barre qui se vide. */}
          {inRounds && rt < PICK_S ? (
            <div style={{ position: 'absolute', top: 1530, left: 190, width: 600, height: 14, borderRadius: 7, background: 'rgba(255,255,255,0.12)' }}>
              <div style={{ width: `${100 * (1 - clamp01((rt - SLIDE_S) / (PICK_S - SLIDE_S)))}%`, height: '100%', borderRadius: 7, background: C.gold }} />
            </div>
          ) : null}
          {/* « Raté ! » */}
          {state === 'ko' ? (
            <div
              style={{
                position: 'absolute',
                top: 960,
                left: 0,
                right: 0,
                textAlign: 'center',
                fontFamily: display,
                fontWeight: 800,
                fontSize: 170,
                color: C.red,
                transform: `rotate(-8deg) scale(${spring({ frame: frame - Math.round((roundStart(r) + verdictAt) * fps), fps, config: { damping: 9 } })})`,
                filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.9))',
              }}
            >
              {props.fail}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Fin : la série et l'appel à jouer. */}
      {outroT >= 0 ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 34 }}>
          <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 64, color: '#fff', transform: `scale(${outroIn})` }}>
            {props.streak} : {rounds.filter((x) => x.pick === x.higher).length} 🔥
          </div>
          <div style={{ fontFamily: display, fontWeight: 800, fontSize: 120, ...goldText, transform: `scale(${outroIn})`, textAlign: 'center', filter: 'drop-shadow(0 8px 30px rgba(0,0,0,0.8))' }}>
            {props.outro}
          </div>
          <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 52, color: '#fff', transform: `scale(${outroIn})` }}>{props.outroSub}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 40, opacity: clamp01((outroT - 0.5) / 0.4) }}>
            <Img src={staticFile(props.icon)} style={{ width: 110, height: 110, borderRadius: 26 }} />
            <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 44, color: '#fff' }}>{props.cta}</div>
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
          <Sequence from={Math.round((HOOK_S - 0.6) * fps)} layout="none">
            <Audio src={sfx('whoosh')} volume={0.6} />
          </Sequence>
          {rounds.map((x, i) => (
            <Sequence key={i} from={Math.round(roundStart(i) * fps)} layout="none">
              {i > 0 ? <Audio src={sfx('whoosh')} volume={0.5} /> : null}
              {[0.7, 1.1, 1.5].map((k) => (
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
