/**
 * Format « plus ou moins », écran partagé : chaque pays occupe une moitié de
 * l'écran, son drapeau en fond. On parie PLUS ou MOINS, la valeur du pays du
 * bas défile jusqu'au vrai chiffre, la série monte… et casse à la dernière
 * manche. Entre deux manches, tout l'écran glisse d'une moitié vers le haut.
 * Aucune capture de l'app : tout est dessiné ici (plusmoins.mjs fournit les
 * pays et les chiffres ; render.mjs copie les drapeaux dans public/flags).
 *
 * La première image montre déjà le jeu : l'accroche s'affiche en haut,
 * par-dessus, le temps de la première manche.
 */
import { loadFont } from '@remotion/fonts';
import anton400 from '@fontsource/anton/files/anton-latin-400-normal.woff2';
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

const display = 'Anton';
const sans = 'Montserrat';
loadFont({ family: display, url: anton400, weight: '400' });
loadFont({ family: sans, url: montserrat600, weight: '600' });
loadFont({ family: sans, url: montserrat800, weight: '800' });

const C = {
  yellow: '#ffd84d',
  red: '#ef4444',
  green: '#10b981',
  fire: '#ff5a1f',
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
const H = 960;

export type Card = { name: string; flag: string; cc?: string; value: number; display: string };
export type PlusRound = { higher: boolean; pick: boolean };

export type PlusOuMoinsProps = {
  hook: string[];
  label: string;
  category?: string;
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
const shadow = '0 6px 30px rgba(0,0,0,0.65)';

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

// Une moitié d'écran : drapeau plein cadre, nom, chiffre.
const Half = ({
  card,
  y,
  t,
  value,
  verb,
  label,
  tint,
  textTop,
}: {
  card: Card;
  y: number;
  t: number;
  value: string;
  verb: string;
  label: string;
  tint: { color: string; k: number } | null;
  textTop: number;
}) => {
  const nameSize = Math.min(130, 1500 / Math.max(7, card.name.length));
  const valueSize = value.length > 8 ? 130 : 160;
  return (
    <div style={{ position: 'absolute', left: 0, top: y, width: 1080, height: H, overflow: 'hidden' }}>
      {card.cc ? (
        <Img
          src={staticFile(`flags/${card.cc}.svg`)}
          style={{
            position: 'absolute',
            left: -60,
            top: -60,
            width: 1200,
            height: H + 120,
            objectFit: 'cover',
            transform: `scale(${1.05 + 0.02 * Math.sin(t * 0.6)}) translateX(${Math.sin(t * 0.4) * 14}px)`,
          }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: '#1b2340', fontSize: 700, textAlign: 'center', lineHeight: `${H}px` }}>{card.flag}</div>
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0.3) 45%, rgba(0,0,0,0.72))' }} />
      {tint ? <div style={{ position: 'absolute', inset: 0, background: tint.color, opacity: 0.55 * tint.k }} /> : null}
      <div style={{ position: 'absolute', left: 40, right: 40, top: textTop, textAlign: 'center', color: '#fff' }}>
        <div style={{ fontFamily: display, fontSize: nameSize, lineHeight: 1.05, textTransform: 'uppercase', letterSpacing: 1, textShadow: shadow }}>{card.name}</div>
        <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 40, opacity: 0.9, marginTop: 4, textShadow: shadow }}>{verb}</div>
        <div style={{ fontFamily: display, fontSize: valueSize, lineHeight: 1.08, color: C.yellow, textShadow: shadow, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        {value !== '?' ? <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 44, opacity: 0.95, textShadow: shadow }}>{label}</div> : null}
      </div>
    </div>
  );
};

const Button = ({ text, arrow, color, active, dim, pulse }: { text: string; arrow: string; color: string; active: number; dim: boolean; pulse: number }) => (
  <div
    style={{
      flex: 1,
      height: 130,
      borderRadius: 30,
      background: active > 0 ? color : `${color}d9`,
      border: active > 0 ? '5px solid #fff' : '5px solid transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      fontFamily: sans,
      fontWeight: 800,
      fontSize: 54,
      letterSpacing: 2,
      color: '#fff',
      opacity: dim ? 0.35 : 1,
      transform: `scale(${1 + 0.1 * active + 0.025 * pulse})`,
      boxShadow: active > 0 ? `0 0 60px ${color}` : '0 14px 40px rgba(0,0,0,0.45)',
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
  const roundStart = (i: number) => HOOK_S + i * ROUND_S;

  // Série affichée : manches gagnées, jusqu'au verdict de la manche en cours.
  const verdictAt = PICK_S + 0.1 + COUNT_S;
  const won = rounds.filter((x, i) => x.pick === x.higher && (i < r || (i === r && rt >= verdictAt))).length;
  const broken = r === rounds.length - 1 && !correct && rt >= verdictAt;

  // Glissement d'une moitié vers le haut au début de chaque manche (sauf la première).
  const slide = r > 0 ? easeInOut(rt / SLIDE_S) : 1;
  const offset = (1 - slide) * H;
  const pickT = rt - PICK_S;
  const countK = (rt - PICK_S - 0.1) / COUNT_S;
  const state: 'idle' | 'ok' | 'ko' = rt >= verdictAt ? (correct ? 'ok' : 'ko') : 'idle';
  const verdictT = rt - verdictAt;
  const bump = verdictT >= 0 ? 1 + 0.12 * Math.exp(-verdictT * 6) * Math.cos(verdictT * 18) : 1;
  const shake = state === 'ko' && verdictT < 0.6 ? 22 * (1 - verdictT / 0.6) : 0;
  const sx = shake * (random(`sx${frame}`) - 0.5) * 2;
  const sy = shake * (random(`sy${frame}`) - 0.5) * 2;
  const tint = state === 'idle' ? null : { color: state === 'ok' ? C.green : C.red, k: Math.max(0.35, Math.exp(-verdictT * 3)) };

  const outroT = t - roundsEnd;
  const outroIn = outroT >= 0 ? spring({ frame: frame - Math.round(roundsEnd * fps), fps, config: { damping: 13 } }) : 0;
  const gameOut = clamp01(outroT / 0.5);
  const hookOut = clamp01((t - (HOOK_SHOW_S - 0.4)) / 0.4);
  const thinking = inRounds && rt < PICK_S ? 1 - clamp01((rt - SLIDE_S) / (PICK_S - SLIDE_S)) : 0;
  const sfx = (name: string) => staticFile(`sfx/${name}.wav`);
  const has = props.has ?? '';
  const hasQ = props.hasQ ?? has;

  // Anneau du compte à rebours autour du VS.
  const RING = 112;
  const circ = 2 * Math.PI * RING;

  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translate(${sx}px, ${sy}px) scale(${1 + 0.04 * gameOut})`, filter: gameOut > 0 ? `blur(${18 * gameOut}px) brightness(${1 - 0.55 * gameOut})` : undefined }}>
        {/* Pays qui sort par le haut (pendant le glissement). */}
        {r > 0 && slide < 1 ? (
          <Half card={cards[r - 1]} y={-H + offset} t={t} value={cards[r - 1].display} verb={has} label={props.label} tint={null} textTop={300} />
        ) : null}
        <Half card={cards[r]} y={offset} t={t} value={cards[r].display} verb={has} label={props.label} tint={null} textTop={300 - 170 * (1 - slide)} />
        <Half
          card={cards[r + 1]}
          y={H + offset}
          t={t}
          value={countK > 0 ? rolling(cards[r + 1], countK) : '?'}
          verb={hasQ}
          label={props.label}
          tint={tint}
          textTop={130}
        />
      </div>

      {outroT < 0.5 ? (
        <div style={{ position: 'absolute', inset: 0, opacity: 1 - gameOut }}>
          {/* VS, avec l'anneau du temps de réflexion. */}
          <div style={{ position: 'absolute', left: 540 - 130, top: H - 130, width: 260, height: 260, transform: `scale(${bump})` }}>
            <svg width={260} height={260} style={{ position: 'absolute', inset: 0 }}>
              <circle cx={130} cy={130} r={RING} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={12} />
              {thinking > 0 ? (
                <circle
                  cx={130}
                  cy={130}
                  r={RING}
                  fill="none"
                  stroke={thinking < 0.3 ? C.red : C.yellow}
                  strokeWidth={12}
                  strokeLinecap="round"
                  strokeDasharray={`${circ * thinking} ${circ}`}
                  transform="rotate(-90 130 130)"
                />
              ) : null}
            </svg>
            <div
              style={{
                position: 'absolute',
                left: 30,
                top: 30,
                width: 200,
                height: 200,
                borderRadius: 100,
                background: state === 'ok' ? C.green : state === 'ko' ? C.red : '#fff',
                color: state === 'idle' ? '#111' : '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: display,
                fontSize: state === 'idle' ? 80 : 110,
                boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              }}
            >
              {state === 'ok' ? '✓' : state === 'ko' ? '✗' : 'VS'}
            </div>
          </div>

          {/* En haut : l'accroche (3 premières secondes), puis la catégorie ; la série à droite. */}
          {t < HOOK_SHOW_S ? (
            <div style={{ position: 'absolute', top: 120, left: 40, right: 40, textAlign: 'center', opacity: 1 - hookOut }}>
              {props.hook.map((line, i) => {
                const s = spring({ frame: frame - i * 6, fps, config: { damping: 12 } });
                return (
                  <div
                    key={i}
                    style={{
                      fontFamily: i === 0 ? display : sans,
                      fontWeight: i === 0 ? 400 : 800,
                      fontSize: i === 0 ? 92 : 44,
                      lineHeight: 1.1,
                      color: i === 0 ? C.yellow : '#fff',
                      textTransform: i === 0 ? 'uppercase' : 'none',
                      textShadow: shadow,
                      transform: `scale(${0.85 + 0.15 * s})`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {line}
                  </div>
                );
              })}
            </div>
          ) : null}
          <div
            style={{
              position: 'absolute',
              top: 150,
              left: 0,
              right: 0,
              textAlign: 'center',
              opacity: hookOut,
              transform: `scale(${0.9 + 0.1 * hookOut})`,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                padding: '16px 40px',
                borderRadius: 999,
                background: 'rgba(0,0,0,0.5)',
                border: '3px solid rgba(255,255,255,0.45)',
                color: '#fff',
                fontFamily: sans,
                fontWeight: 800,
                fontSize: 44,
                letterSpacing: 6,
              }}
            >
              {props.category ?? props.label}
            </span>
          </div>
          <div
            style={{
              position: 'absolute',
              top: t < HOOK_SHOW_S ? 40 : 152,
              right: 50,
              padding: '12px 26px',
              borderRadius: 999,
              background: broken ? '#555' : C.fire,
              color: '#fff',
              fontFamily: sans,
              fontWeight: 800,
              fontSize: 42,
              boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
              transform: `scale(${state === 'ok' && verdictT < 0.6 ? 1 + 0.35 * Math.exp(-verdictT * 6) : 1})`,
            }}
          >
            🔥 {won}
          </div>

          {/* PLUS / MOINS. */}
          <div style={{ position: 'absolute', top: 1510, left: 80, right: 80, display: 'flex', gap: 40 }}>
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

          {/* « Raté ! » */}
          {state === 'ko' ? (
            <div
              style={{
                position: 'absolute',
                top: 655,
                left: 0,
                right: 0,
                textAlign: 'center',
                fontFamily: display,
                fontSize: 160,
                lineHeight: 1.1,
                color: '#fff',
                textTransform: 'uppercase',
                WebkitTextStroke: `6px ${C.red}`,
                transform: `rotate(-8deg) scale(${spring({ frame: frame - Math.round((roundStart(r) + verdictAt) * fps), fps, config: { damping: 9 } })})`,
                textShadow: '0 12px 40px rgba(0,0,0,0.8)',
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
          <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 64, color: '#fff', transform: `scale(${outroIn})`, textShadow: shadow }}>
            {props.streak} : {rounds.filter((x) => x.pick === x.higher).length} 🔥
          </div>
          <div style={{ fontFamily: display, fontSize: 140, color: C.yellow, textTransform: 'uppercase', transform: `scale(${outroIn})`, textAlign: 'center', textShadow: shadow, lineHeight: 1.05 }}>
            {props.outro}
          </div>
          <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 52, color: '#fff', transform: `scale(${outroIn})`, textShadow: shadow }}>{props.outroSub}</div>
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
