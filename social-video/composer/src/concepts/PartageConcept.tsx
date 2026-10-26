/**
 * « Partage équitable » version atlas, d'après l'écran de l'app (src/screens/SplitGame.tsx) :
 * une carte et ses grandes villes, nommées sans chiffres. Le doigt trace un
 * trait (deux pour quatre parts), les villes prennent la couleur de leur part
 * en direct, le rond blanc règle le trait, « Valider », puis la part de toute
 * la population de la zone de chaque côté (en % et en habitants) et les points.
 * Les villes ne sont que des repères : elles n'ont jamais de chiffres. Un pays en deux, un continent en deux, puis la
 * chute : quatre parts coupées au milieu de la carte, sans regarder qui y vit.
 * Les moments de chaque carte viennent de la fiche (concepts.mjs).
 */
import { AbsoluteFill, Audio, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

import { C, EndCard, FPS, Hook, Paper, Progress, Sfx, Stamp, VoiceTrack, app, clamp, mono, musicVolume, serif, sfx, type VoiceLine } from './kit';

type Pt = { x: number; y: number };
type Line = { a: Pt; b: Pt };
/** Une ville : son point (x, y) et son étiquette (lx, ly, anchor : placeLabels de split.ts). */
export type PtCity = { x: number; y: number; name: string; lx: number; ly: number; anchor: 'start' | 'end' | 'middle' };
export type PtRound = {
  name: string;
  parts: number;
  total: string;
  width: number;
  height: number;
  regions: string[];
  cities: PtCity[];
  lines: Line[];
  before: Line;
  shares: { key: number; pct: number; pop: string }[];
  points: number;
  verdict: string;
  t: { start: number; draw: [number, number][]; adjust: [number, number]; submit: number; reveal: number; end: number };
};
export type PartageProps = {
  hook: string[];
  title: string;
  mapLabel: string;
  partsLabel: string[];
  totalLabel: string;
  hints: string[];
  partsHint: string;
  target: string;
  submit: string;
  fail: string;
  rounds: PtRound[];
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
  fr: { endTitle: 'Partage équitable', endSub: 'Le nouveau mode de GeoG', ctaSub: 'Lien dans la bio' },
  en: { endTitle: 'Fair Split', endSub: 'The new mode in GeoG', ctaSub: 'Link in bio' },
};
const txOf = (lang?: string) => (lang === 'en' ? TX.en : TX.fr);

const OUTRO = 2.6;
const endAt = (p: PartageProps) => (p.rounds.length ? p.rounds[p.rounds.length - 1].t.end : 0) + OUTRO;
export const partageSeconds = (p: PartageProps) => endAt(p) + 4;

// Même charte que l'app (src/screens/SplitGame.tsx, mode clair).
const PART_COLORS = [C.vermilion, C.ocean, C.green, C.sand];
const LABEL_SIZE = 4.4; // src/lib/split.ts
const CARD_X = 50;
const CARD_W = 980;
const CARD_Y = 250;
const BOARD_Y = 160; // dans la carte, sous le nom et la population
const BOARD_MAX_W = 940;
const BOARD_MAX_H = 980;

// Copies de src/lib/split.ts (sideOf, cityParts, clipToBoard, partCells) pour l'image par image.
const sideOf = (l: Line, p: Pt) => (l.b.x - l.a.x) * (p.y - l.a.y) - (l.b.y - l.a.y) * (p.x - l.a.x) > 0;
const partOf = (lines: Line[], p: Pt) => lines.reduce((key, l, i) => key | (sideOf(l, p) ? 1 << i : 0), 0);
function clipToBoard(l: Line, w: number, h: number): [Pt, Pt] | null {
  const dx = l.b.x - l.a.x;
  const dy = l.b.y - l.a.y;
  if (Math.hypot(dx, dy) < 1e-6) return null;
  let t0 = -Infinity;
  let t1 = Infinity;
  for (const [p, q] of [[-dx, l.a.x], [dx, w - l.a.x], [-dy, l.a.y], [dy, h - l.a.y]] as const) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  if (t0 > t1) return null;
  return [{ x: l.a.x + t0 * dx, y: l.a.y + t0 * dy }, { x: l.a.x + t1 * dx, y: l.a.y + t1 * dy }];
}
function clipHalfPlane(poly: Pt[], l: Line, left: boolean): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const cIn = sideOf(l, cur) === left;
    const pIn = sideOf(l, prev) === left;
    if (cIn !== pIn) {
      const dx = l.b.x - l.a.x;
      const dy = l.b.y - l.a.y;
      const ex = cur.x - prev.x;
      const ey = cur.y - prev.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) > 1e-12) {
        const t = (dx * (l.a.y - prev.y) - dy * (l.a.x - prev.x)) / den;
        out.push({ x: prev.x + t * ex, y: prev.y + t * ey });
      }
    }
    if (cIn) out.push(cur);
  }
  return out;
}
function partCells(lines: Line[], w: number, h: number) {
  const cells: { key: number; path: string }[] = [];
  for (let key = 0; key < 1 << lines.length; key++) {
    let poly: Pt[] = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    lines.forEach((l, i) => {
      if (poly.length) poly = clipHalfPlane(poly, l, (key & (1 << i)) !== 0);
    });
    if (poly.length >= 3) cells.push({ key, path: poly.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('') + 'Z' });
  }
  return cells;
}

const ease = (x: number) => x * x * (3 - 2 * x);
const lerp = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

/** Ce que le joueur a tracé à `t` : traits posés, trait en cours (pointillés) et position du doigt. */
function strokesAt(r: PtRound, t: number): { lines: Line[]; draft: Line | null; finger: Pt | null; handles: boolean } {
  const last = r.lines.length - 1;
  const lines: Line[] = [];
  for (let k = 0; k <= last; k++) {
    const [s, e] = r.t.draw[k];
    // Le dernier trait est tracé de travers (before), puis réglé par son rond blanc.
    const drawn = k === last ? r.before : r.lines[k];
    if (t < s) return { lines, draft: null, finger: null, handles: lines.length > 0 };
    if (t < e) {
      const tip = lerp(drawn.a, drawn.b, ease((t - s) / (e - s)));
      return { lines, draft: { a: drawn.a, b: tip }, finger: tip, handles: lines.length > 0 };
    }
    if (k < last) lines.push(r.lines[k]);
  }
  const [s, e] = r.t.adjust;
  const k = ease(interpolate(t, [s, e], [0, 1], clamp));
  const b = lerp(r.before.b, r.lines[last].b, k);
  lines.push({ a: r.lines[last].a, b });
  return { lines, draft: null, finger: t >= s - 0.15 && t < e + 0.2 ? b : null, handles: t < r.t.submit };
}

export function PartageConcept(p: PartageProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const tx = txOf(p.lang);
  const n = p.rounds.length;
  if (!n) return <Paper />;
  const end = endAt(p);
  const idx = Math.max(0, p.rounds.findIndex((r) => t < r.t.end));
  const cur = t >= p.rounds[n - 1].t.end ? n - 1 : idx;
  const r = p.rounds[cur];
  const outro = t >= p.rounds[n - 1].t.end;
  const lt = t - r.t.start;
  const revealed = t >= r.t.reveal;
  const failAt = p.rounds[n - 1].t.reveal;

  // Plateau à l'écran : même viewBox que l'app, agrandi pour tenir dans la carte.
  const s = Math.min(BOARD_MAX_W / r.width, BOARD_MAX_H / r.height);
  const W = r.width * s;
  const H = r.height * s;
  const cardH = BOARD_Y + H + (revealed ? 90 : 150);

  const { lines, draft, finger, handles } = strokesAt(r, t);
  const all = draft ? [...lines, draft] : lines;
  const cells = all.length ? partCells(all, r.width, r.height) : [];

  const arrive = cur === 0 ? 1 : spring({ frame: Math.round(lt * fps), fps, config: { damping: 14, stiffness: 160 } });
  const reveal = spring({ frame: Math.round((t - r.t.reveal) * fps), fps, config: { damping: 12, stiffness: 170 } });
  const popIn = interpolate(t, [r.t.reveal, r.t.reveal + 0.35], [0, 1], clamp);
  const count = interpolate(t, [r.t.reveal + 0.1, r.t.reveal + 0.8], [0, 1], clamp);
  const pressed = t >= r.t.submit && t < r.t.submit + 0.25;
  const shake = t >= failAt && t < failAt + 0.5 ? Math.sin(t * 90) * 22 * (1 - (t - failAt) / 0.5) : 0;
  const done = p.rounds.slice(0, cur).reduce((a, x) => a + x.points, 0);
  const shownPts = Math.round(r.points * count);
  const score = done + (revealed ? shownPts : 0);
  const good = r.points >= 120;
  const hookOn = interpolate(t, [1.5, 1.9], [1, 0], clamp);
  const ink = C.sepia;
  const land = C.parchment;
  const ready = lines.length === r.lines.length && !draft;

  return (
    <AbsoluteFill>
      <Paper drift={1.5}>
        {!outro ? (
          <>
            {/* En-tête comme dans l'app : nom du mode, carte, score. */}
            <div style={{ position: 'absolute', top: 60, left: 50, right: 50, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 1 - hookOn }}>
              <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 58, color: C.sepia }}>✂️ {p.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, border: `4px solid ${C.tan}`, borderRadius: 24, padding: '8px 26px', background: C.card, fontFamily: mono, fontWeight: 700, fontSize: 46 }}>
                <span style={{ color: C.vermilion }}>{cur + 1}/{n}</span>
                <span style={{ width: 3, height: 44, background: C.tan }} />
                <span style={{ color: C.green }}>{score}</span>
              </div>
            </div>
            <div style={{ position: 'absolute', top: 168, left: 0, right: 0, textAlign: 'center', fontFamily: serif, fontWeight: 900, fontSize: 56, color: C.vermilion, letterSpacing: 2, opacity: 1 - hookOn }}>
              {p.mapLabel} {cur + 1}/{n} · {p.partsLabel[r.parts]}
            </div>

            <div
              style={{
                position: 'absolute', left: CARD_X + shake + (1 - arrive) * 1100, top: CARD_Y, width: CARD_W, height: cardH,
                background: C.parchmentDark, border: `5px solid ${revealed ? (good ? C.green : C.red) : C.tan}`, borderRadius: 48,
                boxShadow: '0 18px 40px rgba(44,24,16,0.18)', overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', top: 26, left: 0, right: 0, textAlign: 'center', fontFamily: serif, fontWeight: 900, fontSize: r.name.length > 18 ? 54 : 66, color: C.sepia, whiteSpace: 'nowrap' }}>{r.name}</div>
              <div style={{ position: 'absolute', top: 108, left: 0, right: 0, textAlign: 'center', fontFamily: mono, fontSize: 32, color: C.brown }}>{p.totalLabel.replace('{0}', r.total)}</div>
              <svg width={W} height={H} viewBox={`0 0 ${r.width} ${r.height}`} style={{ position: 'absolute', left: (CARD_W - W) / 2 - 5, top: BOARD_Y }}>
                <defs>
                  <clipPath id={`pt-land-${cur}`}>{r.regions.map((d, i) => <path key={i} d={d} />)}</clipPath>
                  <clipPath id={`pt-board-${cur}`}><rect x={0} y={0} width={r.width} height={r.height} /></clipPath>
                </defs>
                <g clipPath={`url(#pt-board-${cur})`}>
                  {r.regions.map((d, i) => <path key={`f${i}`} d={d} fill={land} />)}
                  <g clipPath={`url(#pt-land-${cur})`}>
                    {cells.map((c) => <path key={c.key} d={c.path} fill={PART_COLORS[c.key]} opacity={0.22} />)}
                  </g>
                  {r.regions.map((d, i) => <path key={`s${i}`} d={d} fill="none" stroke={C.tan} strokeWidth={0.35} />)}
                </g>
                {all.map((l, i) => {
                  const seg = clipToBoard(l, r.width, r.height);
                  if (!seg) return null;
                  const isDraft = !!draft && i === all.length - 1;
                  return <line key={`l${i}`} x1={seg[0].x} y1={seg[0].y} x2={seg[1].x} y2={seg[1].y} stroke={ink} strokeWidth={1.1} strokeDasharray={isDraft ? '3 2' : undefined} strokeLinecap="round" />;
                })}
                {r.cities.map((c, i) => {
                  const key = all.length ? partOf(all, c) : -1;
                  return <circle key={`c${i}`} cx={c.x} cy={c.y} r={2.2 * (1 + 0.25 * Math.sin(popIn * Math.PI))} fill={key < 0 ? ink : PART_COLORS[key]} stroke={land} strokeWidth={0.5} />;
                })}
                {/* « Lyon » à côté de chaque point, avec un halo pour passer sur les traits. */}
                {[true, false].map((halo) =>
                  r.cities.map((c, i) => {
                    return (
                      <text
                        key={`${halo ? 'h' : 't'}${i}`}
                        x={c.lx}
                        y={c.ly}
                        textAnchor={c.anchor}
                        fontSize={LABEL_SIZE}
                        fontFamily={mono}
                        fontWeight={700}
                        fill={halo ? land : ink}
                        stroke={halo ? land : undefined}
                        strokeWidth={halo ? 1.1 : undefined}
                        strokeLinejoin="round"
                      >
                        {c.name}
                      </text>
                    );
                  }),
                )}
                {handles
                  ? lines.flatMap((l, i) => [l.a, l.b].map((q, k) => <circle key={`hd${i}${k}`} cx={q.x} cy={q.y} r={2.4} fill="#fff" stroke={ink} strokeWidth={0.8} />))
                  : null}
                {/* Le doigt : un rond translucide qui suit le tracé. */}
                {finger ? <circle cx={finger.x} cy={finger.y} r={6} fill="rgba(255,255,255,0.45)" stroke="rgba(44,24,16,0.35)" strokeWidth={0.6} /> : null}
              </svg>
              <div style={{ position: 'absolute', left: 50, right: 50, top: BOARD_Y + H + 18, textAlign: 'center', fontFamily: mono, fontSize: 31, lineHeight: 1.35, color: C.brown }}>
                {revealed || all.length ? p.partsHint : p.hints[r.parts]}
              </div>
            </div>

            {/* Valider, puis les parts et les points. */}
            {!revealed ? (
              <div
                style={{
                  position: 'absolute', left: 50, right: 50, top: CARD_Y + cardH + 40, height: 160, borderRadius: 34, background: C.green, color: C.parchment,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontWeight: 700, fontSize: 62, letterSpacing: 4,
                  transform: `scale(${pressed ? 0.95 : 1}) translateY(${pressed ? 8 : 0}px)`, boxShadow: pressed ? 'none' : '0 10px 0 #1b4a2a',
                  opacity: t >= r.t.submit ? interpolate(t, [r.t.submit + 0.3, r.t.reveal], [1, 0.4], clamp) : ready ? 1 : 0.45,
                }}
              >
                {p.submit}
              </div>
            ) : (
              <div
                style={{
                  position: 'absolute', left: 50, right: 50, top: CARD_Y + cardH + 30, paddingBottom: 26, borderRadius: 40, border: `6px solid ${good ? C.green : C.red}`,
                  background: good ? 'rgba(42,110,63,0.12)' : 'rgba(139,26,26,0.12)', textAlign: 'center',
                  transform: `scale(${0.8 + 0.2 * reveal})`, opacity: Math.min(1, reveal * 2),
                }}
              >
                <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 76, color: C.sepia, marginTop: 20 }}>{r.verdict}</div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 14 }}>
                  {r.shares.map((sh) => (
                    <div key={sh.key} style={{ border: `4px solid ${PART_COLORS[sh.key]}`, borderRadius: 22, padding: '6px 20px', background: C.card }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                        <span style={{ width: 26, height: 26, borderRadius: 13, background: PART_COLORS[sh.key] }} />
                        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: r.shares.length > 2 ? 44 : 48, color: C.sepia }}>{Math.round(sh.pct * count)} %</span>
                      </div>
                      <div style={{ fontFamily: mono, fontSize: 28, color: C.brown, opacity: count }}>{sh.pop}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontFamily: mono, fontSize: 34, color: C.brown, marginTop: 14 }}>
                  {p.target.replace('{0}', String(Math.round(100 / r.parts)))} · <span style={{ fontWeight: 700, color: good ? C.green : C.red }}>+{shownPts} / 200</span>
                </div>
              </div>
            )}

            {t >= failAt ? <Stamp text={p.fail} at={failAt + 0.25} color={C.red} rotate={-10} size={150} top={CARD_Y + 300} /> : null}
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
      <EndCard title={tx.endTitle} sub={tx.endSub} cta={p.cta} ctaSub={tx.ctaSub} icon={p.icon} start={end} />

      <Audio src={sfx('music')} volume={(f) => musicVolume(p.voice, f / FPS, 0.45, end)} />
      <VoiceTrack voice={p.voice} />
      <Sfx at={0} src={sfx('hit')} volume={0.6} />
      {p.rounds.map((x, i) => {
        const ok = x.points >= 120;
        return [
          i > 0 ? <Sfx key={`w${i}`} at={x.t.start} src={sfx('whoosh')} volume={0.5} /> : null,
          ...x.t.draw.map(([s0], k) => <Sfx key={`d${i}${k}`} at={s0} src={app('draw')} volume={0.6} />),
          ...[0, 1, 2].map((k) => <Sfx key={`k${i}${k}`} at={x.t.adjust[0] + k * 0.22} src={app('tick')} volume={0.4} />),
          <Sfx key={`t${i}`} at={x.t.submit} src={app('tap')} volume={0.8} />,
          <Sfx key={`r${i}`} at={x.t.submit + 0.05} src={sfx('drumroll')} volume={0.3} />,
          ok
            ? <Sfx key={`v${i}`} at={x.t.reveal} src={sfx(`coin${Math.min(8, i + 3)}`)} volume={0.8} />
            : <Sfx key={`v${i}`} at={x.t.reveal} src={sfx('gameover')} volume={0.8} />,
        ];
      })}
      <Sfx at={failAt + 0.25} src={app('stamp')} volume={0.9} />
      <Sfx at={end} src={app('win')} volume={0.7} />
    </AbsoluteFill>
  );
}
