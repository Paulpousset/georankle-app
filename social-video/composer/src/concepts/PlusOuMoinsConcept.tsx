/**
 * « Plus ou moins » version atlas, pensée pour retenir : la première question
 * est posée dès la première seconde (pas d'écran titre), deux cartes de pays
 * avec leur silhouette, un sceau « VS » qui compte 3-2-1, le chiffre qui défile
 * avec une barre qui fait la course contre celle du pays d'en haut, une série
 * qui s'enflamme (pastilles, pièces de plus en plus aiguës)… et qui casse à
 * la dernière manche, avec secousse et tampon « Raté ».
 * Cinq manches de 3,6 s : environ 20 s avant la carte de fin.
 */
import { AbsoluteFill, Audio, Img, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion';

import { C, EndCard, FPS, Hook, Paper, Progress, Sfx, Stamp, VoiceTrack, app, clamp, flag, mono, musicVolume, serif, sfx, type VoiceLine } from './kit';

export type PmCard = { id: string; cc: string; name: string; value: number; display: string; shape?: string };
export type PmRound = { higher: boolean; pick: boolean };
export type PlusOuMoinsConceptProps = {
  hook: string[];
  category: string;
  categoryIcon: string;
  unit: string;
  question: string;
  more: string;
  less: string;
  fail: string;
  outro: string;
  outroSub: string;
  cta: string;
  icon: string;
  cards: PmCard[];
  rounds: PmRound[];
  lang?: string;
  voice?: VoiceLine[];
};

const TX = {
  fr: { endTitle: 'Plus ou moins : la géo en série', ctaSub: 'Lien dans la bio', round: 'Manche' },
  en: { endTitle: 'Higher or lower: geography streaks', ctaSub: 'Link in bio', round: 'Round' },
};
const txOf = (lang?: string) => (lang === 'en' ? TX.en : TX.fr);

// Mêmes durées que concepts.mjs (placement de la voix off).
export const PM = { START: 0.3, ROUND: 3.6, ARRIVE: 0.35, TICK0: 0.55, PICK: 2.0, COUNT: 0.7, VERDICT: 2.75, SHIFT: 3.25, FAIL_HOLD: 1.4, OUTRO: 2.4 };
const roundAt = (i: number) => PM.START + i * PM.ROUND;
const endAt = (p: PlusOuMoinsConceptProps) => roundAt(p.rounds.length - 1) + PM.VERDICT + PM.FAIL_HOLD + PM.OUTRO;
export const plusOuMoinsConceptSeconds = (p: PlusOuMoinsConceptProps) => endAt(p) + 4;

/** Silhouette du pays (tracé SVG 430 × 300 calculé par concepts.mjs). */
function Silhouette({ d, color, opacity }: { d?: string; color: string; opacity: number }) {
  if (!d) return null;
  return (
    <svg width={430} height={300} style={{ opacity }}>
      <path d={d} fill={color} stroke={C.sepia} strokeWidth={3} strokeLinejoin="round" />
    </svg>
  );
}

const CARD_X = 50;
const CARD_W = 980;
const CARD_H = 440;
const TOP_Y = 340; // carte du haut (le pays connu)
const BOT_Y = 880; // carte du bas (le pays à deviner)
const SEAL_Y = (TOP_Y + CARD_H + BOT_Y) / 2;

function Card({ card, y, reveal, ratio, accent, state, shake }: { card: PmCard; y: number; reveal: number; ratio: number; accent: string; state: 'idle' | 'ok' | 'ko'; shake: number }) {
  const shown = reveal >= 1 ? card.display : null;
  const border = state === 'ok' ? C.green : state === 'ko' ? C.red : C.tan;
  const glow = state === 'ok' ? '0 0 0 10px rgba(42,110,63,0.25)' : state === 'ko' ? '0 0 0 10px rgba(139,26,26,0.28)' : '0 18px 40px rgba(44,24,16,0.18)';
  return (
    <div
      style={{
        position: 'absolute', left: CARD_X + shake, top: y, width: CARD_W, height: CARD_H,
        background: C.card, border: `6px solid ${border}`, borderRadius: 40, boxShadow: glow, overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', right: 10, top: 20 }}>
        <Silhouette d={card.shape} color={accent} opacity={0.22} />
      </div>
      <div style={{ position: 'absolute', left: 50, top: 46, display: 'flex', alignItems: 'center', gap: 30 }}>
        <Img src={flag(card.cc)} style={{ width: 150, height: 112, borderRadius: 16, objectFit: 'cover', boxShadow: '0 6px 0 rgba(44,24,16,0.25)' }} />
        <div style={{ fontFamily: serif, fontWeight: 900, fontSize: card.name.length > 14 ? 70 : 88, color: C.sepia, lineHeight: 1 }}>{card.name}</div>
      </div>
      <div style={{ position: 'absolute', left: 50, top: 200, fontFamily: mono, fontWeight: 700, fontSize: 120, color: accent, letterSpacing: -4 }}>
        {shown ?? (reveal > 0 ? rolling(card, reveal) : '???')}
      </div>
      {/* La course : la barre du pays, à l'échelle du plus grand des deux. */}
      <div style={{ position: 'absolute', left: 50, right: 50, bottom: 44, height: 34, background: C.parchmentDark, borderRadius: 17 }}>
        <div style={{ width: `${Math.max(2, ratio * 100)}%`, height: '100%', background: accent, borderRadius: 17 }} />
      </div>
    </div>
  );
}
/** Chiffre qui défile vers la vraie valeur (même format, chiffres tirés au hasard). */
function rolling(card: PmCard, k: number) {
  return card.display.replace(/\d/g, (d, i) => (random(`${card.cc}${i}${Math.floor(k * 14)}`) < k * k ? d : String(Math.floor(random(`${card.cc}${i}${k}`) * 10))));
}

export function PlusOuMoinsConcept(p: PlusOuMoinsConceptProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const tx = txOf(p.lang);
  const n = p.rounds.length;
  const end = endAt(p);
  const failAt = roundAt(n - 1) + PM.VERDICT;
  const cur = Math.max(0, Math.min(n - 1, Math.floor((t - PM.START) / PM.ROUND)));
  const local = t - roundAt(cur);
  const r = p.rounds[cur];
  const a = p.cards[cur];
  const b = p.cards[cur + 1];
  const max = Math.max(a.value, b.value);
  const ok = r.pick === r.higher;
  const counted = interpolate(local, [PM.PICK + 0.1, PM.PICK + 0.1 + PM.COUNT], [0, 1], clamp);
  const verdict = local >= PM.VERDICT;
  const streak = p.rounds.slice(0, cur).length + (verdict && ok ? 1 : 0);
  const outro = t >= failAt + PM.FAIL_HOLD;

  // Arrivée de la carte du bas, puis glissement vers le haut (elle devient la référence).
  const arrive = spring({ frame: Math.round((local - 0) * fps), fps, config: { damping: 14, stiffness: 170 } });
  const shift = cur < n - 1 ? interpolate(local, [PM.SHIFT, PM.ROUND], [0, 1], clamp) : 0;
  const easeShift = shift * shift * (3 - 2 * shift);
  const topY = TOP_Y - easeShift * (CARD_H + 200);
  const botY = BOT_Y + (1 - arrive) * 900 - easeShift * (BOT_Y - TOP_Y);
  const shake = t >= failAt && t < failAt + 0.5 ? Math.sin(t * 90) * 22 * (1 - (t - failAt) / 0.5) : 0;

  // Sceau : 3, 2, 1 puis ✓ ou ✗.
  const count = 3 - Math.floor((local - PM.TICK0) / ((PM.PICK - PM.TICK0) / 3));
  // L'accroche occupe l'en-tête pendant la première question, qui reste lisible.
  const sealText = verdict ? (ok ? '✓' : '✗') : local >= PM.TICK0 && local < PM.PICK ? String(Math.max(1, count)) : 'VS';
  const sealColor = verdict ? (ok ? C.green : C.red) : C.vermilion;
  const ring = interpolate(local, [PM.TICK0, PM.PICK], [1, 0], clamp);
  const tickS = (PM.PICK - PM.TICK0) / 3;
  const popAt = verdict ? PM.VERDICT : PM.TICK0 + Math.max(0, Math.floor((local - PM.TICK0) / tickS)) * tickS;
  const sealPop = spring({ frame: Math.round((local - popAt) * fps), fps, config: { damping: 8, stiffness: 300 } });

  const pressed = local >= PM.PICK ? (r.pick ? 'more' : 'less') : null;
  const hookOn = interpolate(t, [1.5, 1.9], [1, 0], clamp);

  return (
    <AbsoluteFill>
      <Paper drift={1.5}>
        {!outro ? (
          <>
            {/* En-tête : catégorie, manches, série. */}
            <div style={{ position: 'absolute', top: 60, left: 50, right: 50, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 1 - hookOn }}>
              <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 40, color: C.brown, letterSpacing: 3 }}>{p.categoryIcon} {p.category.toUpperCase()}</div>
              <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 64, color: streak >= 3 ? C.vermilion : C.sepia, transform: `scale(${1 + Math.min(streak, 5) * 0.06})` }}>🔥 {streak}</div>
            </div>
            <div style={{ position: 'absolute', top: 160, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 22, opacity: 1 - hookOn }}>
              {p.rounds.map((x, i) => {
                const done = i < cur || (i === cur && verdict);
                const good = x.pick === x.higher;
                return (
                  <div key={i} style={{ width: 120, height: 22, borderRadius: 11, background: done ? (good ? C.green : C.red) : i === cur ? C.sand : C.parchmentDark, border: `3px solid ${C.tan}` }} />
                );
              })}
            </div>
            <div style={{ position: 'absolute', top: 238, left: 30, right: 30, textAlign: 'center', fontFamily: serif, fontWeight: 900, fontSize: 54, whiteSpace: 'nowrap', color: C.sepia }}>
              {p.question.replace('{a}', a.name).replace('{b}', b.name)}
            </div>

            <Card card={a} y={topY} reveal={1} ratio={a.value / max} accent={C.ocean} state="idle" shake={0} />
            <Card card={b} y={botY} reveal={counted} ratio={(b.value / max) * counted} accent={C.vermilion} state={verdict ? (ok ? 'ok' : 'ko') : 'idle'} shake={shake} />

            {/* Sceau de cire au milieu, avec l'anneau du compte à rebours. */}
            {shift < 0.2 ? (
              <div style={{ position: 'absolute', left: 540 - 105, top: SEAL_Y - 105, width: 210, height: 210, transform: `scale(${0.85 + 0.15 * sealPop})` }}>
                <svg width={210} height={210} style={{ position: 'absolute', inset: 0 }}>
                  <circle cx={105} cy={105} r={98} fill={sealColor} stroke={C.parchment} strokeWidth={8} />
                  <circle cx={105} cy={105} r={88} fill="none" stroke={C.parchment} strokeWidth={10} strokeDasharray={`${2 * Math.PI * 88 * ring} 999`} transform="rotate(-90 105 105)" opacity={verdict ? 0 : 0.9} />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: serif, fontWeight: 900, fontSize: sealText === 'VS' ? 76 : 110, color: C.parchment }}>{sealText}</div>
              </div>
            ) : null}

            {/* Boutons PLUS / MOINS, comme dans l'app. */}
            <div style={{ position: 'absolute', left: 50, right: 50, top: 1400, display: 'flex', gap: 30 }}>
              {(['more', 'less'] as const).map((k) => {
                const on = pressed === k;
                const off = pressed && !on;
                const pulse = !pressed && local > PM.TICK0 ? 1 + 0.04 * Math.sin(local * 14 + (k === 'more' ? 0 : Math.PI)) : 1;
                const color = k === 'more' ? C.green : C.vermilion;
                return (
                  <div
                    key={k}
                    style={{
                      flex: 1, height: 190, borderRadius: 36, background: on ? color : off ? C.parchmentDark : C.card,
                      border: `6px solid ${off ? C.tan : color}`, color: on ? C.parchment : off ? C.tan : color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18,
                      fontFamily: serif, fontWeight: 900, fontSize: 84,
                      transform: `scale(${on ? 0.95 : pulse}) translateY(${on ? 8 : 0}px)`,
                      boxShadow: on ? 'none' : `0 10px 0 ${off ? C.tan : color}`,
                    }}
                  >
                    {k === 'more' ? `▲ ${p.more}` : `▼ ${p.less}`}
                  </div>
                );
              })}
            </div>

            {t >= failAt ? <Stamp text={p.fail} at={failAt + 0.05} color={C.red} rotate={-10} size={150} top={BOT_Y + 120} /> : null}
          </>
        ) : (
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: 60, textAlign: 'center' }}>
            <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 220, color: C.vermilion }}>{n - 1}/{n}</div>
            <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 104, color: C.sepia, lineHeight: 1.1, marginTop: 10 }}>{p.outro}</div>
            <div style={{ fontFamily: mono, fontSize: 42, color: C.vermilion, marginTop: 30 }}>{p.outroSub}</div>
          </AbsoluteFill>
        )}

        {/* Accroche par-dessus la première question, puis elle s'efface. */}
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
        const s0 = roundAt(i);
        const good = x.pick === x.higher;
        return [
          <Sfx key={`w${i}`} at={s0} src={sfx('whoosh')} volume={0.5} />,
          ...[0, 1, 2].map((k) => <Sfx key={`k${i}${k}`} at={s0 + PM.TICK0 + k * ((PM.PICK - PM.TICK0) / 3)} src={app('tick')} volume={0.7} />),
          <Sfx key={`t${i}`} at={s0 + PM.PICK} src={app('tap')} volume={0.8} />,
          <Sfx key={`r${i}`} at={s0 + PM.PICK + 0.1} src={sfx('drumroll')} volume={0.35} />,
          good
            ? <Sfx key={`v${i}`} at={s0 + PM.VERDICT} src={sfx(`coin${Math.min(8, i + 1)}`)} volume={0.8} />
            : <Sfx key={`v${i}`} at={s0 + PM.VERDICT} src={sfx('gameover')} volume={0.8} />,
        ];
      })}
      <Sfx at={failAt + 0.05} src={app('stamp')} volume={0.9} />
      <Sfx at={end} src={app('win')} volume={0.7} />
    </AbsoluteFill>
  );
}
