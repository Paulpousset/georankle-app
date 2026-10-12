/**
 * « Rankle » joué : six thèmes, six pays qui arrivent un par un. Le doigt pose
 * chaque pays dans un thème libre, son rang mondial défile de #195 jusqu'au
 * vrai chiffre (vert s'il est bon, rouge sinon) et s'ajoute au total. Le
 * dernier pays tombe forcément dans la dernière case libre : c'est la chute.
 */
import { AbsoluteFill, Audio, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

import { C, EndCard, FPS, Hook, Paper, Progress, Sfx, Stamp, Tag, app, clamp, flag, mono, serif, sfx } from './kit';

export type RankleTheme = { emoji: string; label: string };
export type RankleTurn = { cc: string; name: string; theme: number; rank: number };
export type RankleProps = {
  hook: string[];
  rule: string;
  themes: RankleTheme[];
  turns: RankleTurn[];
  outro: string;
  outroSub: string;
  cta: string;
  icon: string;
};

const FIRST = 2.2;
const TURN_S = 2.5;
const LAST_EXTRA = 1.6; // suspense avant le dernier pays
const DROP_S = 0.35;
const TAP_S = 1.05;
const COUNT_S = 0.6;
const turnAt = (i: number, n: number) => FIRST + i * TURN_S + (i === n - 1 ? LAST_EXTRA : 0);
const endAt = (p: RankleProps) => turnAt(p.turns.length - 1, p.turns.length) + TURN_S + 3.4;
export const rankleSeconds = (p: RankleProps) => endAt(p) + 4;

const rankColor = (r: number) => (r <= 10 ? C.green : r <= 40 ? C.ocean : r <= 100 ? C.sand : C.red);
const ROW_TOP = 590;
const ROW_H = 132;

export function RankleConcept(p: RankleProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const n = p.turns.length;
  const end = endAt(p);
  let cur = -1;
  for (let i = 0; i < n; i++) if (t >= turnAt(i, n)) cur = i;
  const turn = cur >= 0 ? p.turns[cur] : null;
  const since = cur >= 0 ? t - turnAt(cur, n) : 0;
  const placed = (i: number) => t >= turnAt(i, n) + TAP_S;
  const shown = (i: number) => {
    const s = t - turnAt(i, n) - TAP_S;
    if (s < 0) return null;
    return Math.round(interpolate(s, [0, COUNT_S], [195, p.turns[i].rank], { ...clamp, easing: (x) => 1 - (1 - x) ** 3 }));
  };
  const total = p.turns.reduce((a, tr, i) => a + (shown(i) != null ? (t - turnAt(i, n) - TAP_S >= COUNT_S ? tr.rank : 0) : 0), 0);
  const hookOut = interpolate(t, [FIRST - 0.3, FIRST], [1, 0], clamp);
  const drop = spring({ frame: Math.round(since * fps), fps, config: { damping: 11, stiffness: 170 } });
  const lastTurn = n - 1;
  const lastPause = t >= turnAt(lastTurn - 1, n) + TURN_S && t < turnAt(lastTurn, n);
  const lastHit = t >= turnAt(lastTurn, n) + TAP_S + COUNT_S;
  const shake = lastHit ? Math.sin(t * 60) * interpolate(t - turnAt(lastTurn, n) - TAP_S - COUNT_S, [0, 0.6], [14, 0], clamp) : 0;
  // Le doigt glisse de la carte du pays vers la ligne du thème choisi, puis tape.
  const fingerY = turn ? interpolate(since, [DROP_S, TAP_S - 0.1], [560, ROW_TOP + turn.theme * ROW_H + 70], { ...clamp, easing: (x) => 1 - (1 - x) ** 2 }) : 0;
  const fingerTap = turn ? 1 - 0.25 * Math.exp(-Math.max(0, since - TAP_S + 0.05) * 14) * (since > TAP_S - 0.05 ? 1 : 0) : 1;

  return (
    <AbsoluteFill style={{ transform: `translateX(${shake}px)` }}>
      <Paper>
        <div style={{ opacity: hookOut }}>
          <Hook lines={p.hook} y={130} size={88} />
          <div style={{ position: 'absolute', top: 360, left: 0, right: 0, textAlign: 'center', fontFamily: mono, fontSize: 40, color: C.vermilion }}>{p.rule}</div>
        </div>

        {/* En-tête : mode, manche, total */}
        <div style={{ position: 'absolute', top: 70, left: 50, right: 50, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 1 - hookOut }}>
          <Tag>Rankle · {Math.max(1, cur + 1)}/{n}</Tag>
          <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 40, color: C.sepia, background: C.card, border: `3px solid ${C.tan}`, borderRadius: 18, padding: '8px 22px' }}>
            TOTAL <span style={{ color: C.vermilion, fontSize: 52 }}>{total}</span>
          </div>
        </div>

        {/* Pays à placer */}
        {turn && !lastHit && !lastPause ? (
          <div
            style={{
              position: 'absolute',
              top: 190,
              left: 70,
              right: 70,
              height: 290,
              background: C.card,
              border: `4px solid ${C.tan}`,
              borderRadius: 36,
              display: 'flex',
              alignItems: 'center',
              gap: 40,
              padding: '0 50px',
              transform: `translateY(${(1 - drop) * -400}px) rotate(${(1 - drop) * -6}deg)`,
              boxShadow: '0 24px 60px rgba(44,24,16,0.2)',
              opacity: since > TAP_S ? interpolate(since, [TAP_S, TAP_S + 0.25], [1, 0.35], clamp) : 1,
            }}
          >
            <Img src={flag(turn.cc)} style={{ width: 240, height: 180, borderRadius: 16, objectFit: 'cover', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }} />
            <div>
              <div style={{ fontFamily: serif, fontWeight: 900, fontSize: turn.name.length > 9 ? 70 : 84, color: C.sepia }}>{turn.name}</div>
              <div style={{ fontFamily: mono, fontSize: 32, color: C.brown }}>{cur === lastTurn ? 'Dernière case libre…' : 'Où est-il le mieux classé ?'}</div>
            </div>
          </div>
        ) : null}
        {lastPause ? (
          <div style={{ position: 'absolute', top: 300, left: 0, right: 0, textAlign: 'center', fontFamily: serif, fontWeight: 900, fontSize: 80, color: C.vermilion }}>Dernier pays… 😬</div>
        ) : null}

        {/* Thèmes */}
        <div style={{ position: 'absolute', top: ROW_TOP, left: 50, right: 50, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {p.themes.map((th, k) => {
            const i = p.turns.findIndex((tr) => tr.theme === k);
            const on = i >= 0 && placed(i);
            const r = i >= 0 ? shown(i) : null;
            const tr = i >= 0 ? p.turns[i] : null;
            const pop = i >= 0 ? spring({ frame: Math.round((t - turnAt(i, n) - TAP_S) * fps), fps, config: { damping: 10, stiffness: 220 } }) : 0;
            const final = i >= 0 && t - turnAt(i, n) - TAP_S >= COUNT_S;
            const enter = spring({ frame: frame - Math.round((0.5 + k * 0.08) * fps), fps, config: { damping: 14 } });
            return (
              <div
                key={k}
                style={{
                  height: ROW_H - 18,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 22,
                  padding: '0 30px',
                  background: on ? '#fbf5e6' : C.card,
                  border: `4px solid ${on && final && r != null ? rankColor(r) : C.tan}`,
                  borderRadius: 26,
                  transform: `translateX(${(1 - enter) * 1100}px) scale(${on ? 1 + 0.04 * (1 - pop) : 1})`,
                }}
              >
                <div style={{ fontSize: 52, width: 70 }}>{th.emoji}</div>
                <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 32, color: C.sepia, flex: 1 }}>{th.label}</div>
                {on && tr ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, transform: `scale(${pop})` }}>
                    <Img src={flag(tr.cc)} style={{ width: 70, height: 52, borderRadius: 6, objectFit: 'cover' }} />
                    <div
                      style={{
                        minWidth: 150,
                        textAlign: 'center',
                        fontFamily: serif,
                        fontWeight: 900,
                        fontSize: 58,
                        color: '#fff',
                        background: final && r != null ? rankColor(r) : C.brown,
                        borderRadius: 18,
                        padding: '2px 16px',
                      }}
                    >
                      #{r}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Doigt */}
        {turn && since > DROP_S && since < TAP_S + 0.4 ? (
          <div style={{ position: 'absolute', left: 820, top: fingerY, fontSize: 110, transform: `scale(${fingerTap}) rotate(-20deg)`, filter: 'drop-shadow(0 10px 14px rgba(0,0,0,0.3))' }}>👆</div>
        ) : null}

        {lastHit ? (
          <>
            <div style={{ position: 'absolute', top: 210, left: 0, right: 0, textAlign: 'center', fontFamily: serif, fontWeight: 900, fontSize: 96, color: C.red }}>Aïe. 😭</div>
            <div style={{ position: 'absolute', top: 340, left: 0, right: 0, textAlign: 'center', fontFamily: mono, fontWeight: 700, fontSize: 40, color: C.sepia }}>
              {p.outro} <span style={{ color: C.vermilion }}>{p.outroSub}</span>
            </div>
          </>
        ) : null}
        <Stamp text={`Total : ${p.turns.reduce((a, b) => a + b.rank, 0)}`} at={turnAt(lastTurn, n) + TURN_S + 0.4} top={1420} size={84} color={C.vermilion} rotate={-4} />
        <Progress total={end} />
      </Paper>
      <EndCard title="Toi, tu ferais combien ?" cta={p.cta} ctaSub="Lien dans la bio" icon={p.icon} start={end} />

      <Audio src={sfx('music')} volume={(f) => {
        const s = f / FPS;
        if (s >= turnAt(lastTurn - 1, n) + TURN_S && s < turnAt(lastTurn, n) + TAP_S + COUNT_S) return 0.1;
        return interpolate(s, [0, 0.3, end + 3, end + 4], [0, 0.5, 0.5, 0], clamp);
      }} />
      <Sfx at={0} src={sfx('boom')} volume={0.5} />
      {p.turns.map((tr, i) => {
        const at = turnAt(i, n);
        const good = tr.rank <= 40;
        return [
          <Sfx key={`w${i}`} at={at} src={sfx('whoosh')} volume={0.5} />,
          <Sfx key={`t${i}`} at={at + TAP_S - 0.05} src={app('tap')} volume={0.7} />,
          <Sfx key={`r${i}`} at={at + TAP_S + COUNT_S} src={good ? app('correct') : app('wrong')} volume={0.7} />,
          ...(tr.rank <= 3 ? [<Sfx key={`s${i}`} at={at + TAP_S + COUNT_S + 0.1} src={app('star')} volume={0.6} />] : []),
        ];
      })}
      <Sfx at={turnAt(lastTurn - 1, n) + TURN_S} src={sfx('heartbeat')} volume={0.8} />
      <Sfx at={turnAt(lastTurn, n) + TAP_S + COUNT_S + 0.05} src={sfx('trombone')} volume={0.7} />
      <Sfx at={turnAt(lastTurn, n) + TURN_S + 0.4} src={app('stamp')} volume={0.8} />
      <Sfx at={end} src={app('win')} volume={0.7} />
    </AbsoluteFill>
  );
}
