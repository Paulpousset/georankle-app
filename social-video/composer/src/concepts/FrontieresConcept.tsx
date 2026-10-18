/**
 * « Frontières » : deux pays sur une carte ancienne, une question (« quels pays
 * faut-il traverser ? »), trois secondes pour répondre, puis le
 * chemin le plus court se dessine pays par pays, avec la chaîne de drapeaux
 * en dessous comme dans l'app, et le tampon de la réponse. Deux manches, la
 * deuxième plus longue.
 */
import { geoArea, geoMercator, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson';
import { AbsoluteFill, Audio, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-50m.json';

import { C, EndCard, FPS, Hook, Paper, Progress, Sfx, Stamp, Tag, VoiceTrack, app, clamp, flag, mono, musicVolume, serif, sfx, type VoiceLine } from './kit';

export type FrontierStep = { id: string; cc: string; name: string };
export type FrontierRound = { level: string; view: [number, number, number, number]; path: FrontierStep[] };
export type FrontieresProps = {
  hook: string[];
  rounds: FrontierRound[];
  ask: string;
  outro: string;
  outroSub: string;
  cta: string;
  icon: string;
  lang?: string;
  voice?: VoiceLine[];
};

// Textes fixes de la vidéo, selon la langue de la fiche (concepts.mjs --lang).
const TX = {
  fr: { round: 'Manche', path: 'Le chemin !', endTitle: 'Relie le monde, frontière par frontière', ctaSub: 'Lien dans la bio' },
  en: { round: 'Round', path: 'The route!', endTitle: 'Connect the world, one border at a time', ctaSub: 'Link in bio' },
};
const txOf = (lang?: string) => (lang === 'en' ? TX.en : TX.fr);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = world as any;
const countries = (feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry>).features;
const byId = new Map(countries.map((f) => [String(f.id), f]));

// Plus de temps que les autres jeux : on laisse chercher le chemin, puis le suivre.
export const INTRO_S = 1.8;
export const THINK_S = 5.2;
const HOLD_S = 3.2;
export const stepS = (r: FrontierRound) => (r.path.length > 7 ? 0.6 : 0.9);
const roundSeconds = (r: FrontierRound) => INTRO_S + THINK_S + r.path.length * stepS(r) + HOLD_S;
const roundStart = (p: FrontieresProps, i: number) => p.rounds.slice(0, i).reduce((a, r) => a + roundSeconds(r), 0.4);
const endAt = (p: FrontieresProps) => roundStart(p, p.rounds.length) + 2.6;
export const frontieresSeconds = (p: FrontieresProps) => endAt(p) + 4;

const MAP_W = 1000;
const MAP_H = 960;
const MAP_TOP = 450;

/** Le plus grand morceau d'un pays (Russie sans Kaliningrad, France sans la Guyane…). */
function mainland(f: Feature<Geometry>): Feature<Polygon> {
  if (f.geometry.type !== 'MultiPolygon') return f as Feature<Polygon>;
  const polys = (f.geometry as MultiPolygon).coordinates.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: c } }) as Feature<Polygon>);
  return polys.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
}

function Round({ r, idx, total, local, ask, roundWord }: { r: FrontierRound; idx: number; total: number; local: number; ask: string; roundWord: string }) {
  const { fps } = useVideoConfig();
  const [w, s, e, n] = r.view;
  const projection = geoMercator().fitExtent(
    [
      [20, 20],
      [MAP_W - 20, MAP_H - 20],
    ],
    { type: 'MultiPoint', coordinates: [[w, s], [e, s], [e, n], [w, n], [(w + e) / 2, n], [(w + e) / 2, s]] },
  );
  const path = geoPath(projection);
  const first = r.path[0];
  const last = r.path[r.path.length - 1];
  const middle = r.path.slice(1, -1);
  const drawStart = INTRO_S + THINK_S;
  const step = stepS(r);
  const filled = Math.floor((local - drawStart) / step) + 1; // nb de pays du chemin déjà posés
  const centers = r.path.map((c) => path.centroid(mainland(byId.get(c.id)!)));
  const lineLen = interpolate(local, [drawStart, drawStart + r.path.length * step], [0, r.path.length - 1], clamp);
  const pts: [number, number][] = [];
  for (let i = 0; i <= Math.floor(lineLen); i++) pts.push(centers[i] as [number, number]);
  const frac = lineLen % 1;
  const k = Math.floor(lineLen);
  if (k < centers.length - 1 && frac > 0) pts.push([centers[k][0] + (centers[k + 1][0] - centers[k][0]) * frac, centers[k][1] + (centers[k + 1][1] - centers[k][1]) * frac]);
  const intro = spring({ frame: Math.round(local * fps), fps, config: { damping: 12 } });
  // Titres longs (« Thaïlande → Arabie Saoudite ») : plus petit, sur une ligne.
  const chars = first.name.length + last.name.length;
  const titleSize = chars > 22 ? 50 : chars > 17 ? 58 : 70;
  const thinking = local >= INTRO_S && local < drawStart;
  const countdown = Math.ceil(drawStart - local);
  const zoom = interpolate(local, [0, drawStart], [1.08, 1], clamp);
  const colorOf = (id: string) => {
    if (id === first.id) return C.vermilion;
    if (id === last.id) return C.ocean;
    const j = middle.findIndex((m) => m.id === id);
    if (j >= 0 && j + 1 < filled) return C.sand;
    return null;
  };

  return (
    <AbsoluteFill>
      {/* Titre de la manche */}
      <div style={{ position: 'absolute', top: 240, left: 0, right: 0, textAlign: 'center', transform: `scale(${0.8 + 0.2 * intro})`, opacity: intro }}>
        <Tag>
          {total > 1 ? `${roundWord} ${idx + 1}/${total} · ` : ''}{r.level}
        </Tag>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 18, marginTop: 24, fontFamily: serif, fontWeight: 900, fontSize: titleSize, color: C.sepia, whiteSpace: 'nowrap' }}>
          <Img src={flag(first.cc)} style={{ width: 84, height: 63, borderRadius: 8, objectFit: 'cover' }} />
          <span style={{ color: C.vermilion }}>{first.name}</span>
          <span style={{ fontFamily: mono, fontSize: 56 }}>→</span>
          <span style={{ color: C.ocean }}>{last.name}</span>
          <Img src={flag(last.cc)} style={{ width: 84, height: 63, borderRadius: 8, objectFit: 'cover' }} />
        </div>
      </div>

      {/* Carte */}
      <div style={{ position: 'absolute', top: MAP_TOP, left: 40, width: MAP_W, height: MAP_H, borderRadius: 40, overflow: 'hidden', border: `5px solid ${C.tan}`, background: '#e6dcc0' }}>
        <svg width={MAP_W} height={MAP_H} style={{ transform: `scale(${zoom})` }}>
          {countries.map((f) => {
            const c = colorOf(String(f.id));
            return <path key={String(f.id)} d={path(f) ?? ''} fill={c ?? C.parchment} stroke={c ? '#fff8e6' : C.tan} strokeWidth={c ? 2.5 : 1.2} />;
          })}
          {pts.length > 1 ? (
            <polyline points={pts.map((q) => q.join(',')).join(' ')} fill="none" stroke={C.sepia} strokeWidth={7} strokeDasharray="4 16" strokeLinecap="round" />
          ) : null}
          {centers.map((q, i) =>
            i < filled || i === 0 || i === centers.length - 1 ? (
              <circle key={i} cx={q[0]} cy={q[1]} r={i === 0 || i === centers.length - 1 ? 16 : 11} fill={i === 0 ? C.vermilion : i === centers.length - 1 ? C.ocean : C.sepia} stroke="#fff" strokeWidth={4} />
            ) : null,
          )}
        </svg>
        {thinking ? (
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 40 }}>
            <div style={{ background: 'rgba(44,24,16,0.88)', color: C.parchment, borderRadius: 30, padding: '20px 36px', fontFamily: mono, fontWeight: 700, fontSize: 40, display: 'flex', gap: 24, alignItems: 'center' }}>
              {ask}
              <span style={{ fontFamily: serif, fontSize: 70, color: C.sand, width: 50, textAlign: 'center' }}>{countdown}</span>
            </div>
          </AbsoluteFill>
        ) : null}
      </div>

      {/* Chaîne de drapeaux, comme dans l'app */}
      <div style={{ position: 'absolute', top: MAP_TOP + MAP_H + 40, left: 40, right: 40, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
        {r.path.map((c, i) => {
          const isEnd = i === 0 || i === r.path.length - 1;
          const on = isEnd || i < filled;
          const pop = isEnd ? 1 : spring({ frame: Math.round((local - drawStart - i * step) * fps), fps, config: { damping: 9, stiffness: 220 } });
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 16px',
                borderRadius: 40,
                background: on ? (i === 0 ? C.vermilion : i === r.path.length - 1 ? C.ocean : C.sand) : C.parchmentDark,
                border: on ? 'none' : `3px dashed ${C.tan}`,
                color: on ? '#fff' : C.tan,
                fontFamily: mono,
                fontWeight: 700,
                fontSize: r.path.length > 6 ? 24 : 30,
                transform: `scale(${on ? 0.6 + 0.4 * pop : 1})`,
              }}
            >
              {on ? <Img src={flag(c.cc)} style={{ width: 40, height: 30, borderRadius: 4, objectFit: 'cover' }} /> : null}
              {on ? c.name : '?'}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

export function FrontieresConcept(p: FrontieresProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const end = endAt(p);
  let cur = 0;
  p.rounds.forEach((_, i) => {
    if (t >= roundStart(p, i)) cur = i;
  });
  const r = p.rounds[cur];
  const local = t - roundStart(p, cur);
  const hookOut = interpolate(t, [0.4 + INTRO_S + 0.6, 0.4 + INTRO_S + 1.0], [1, 0], clamp);
  const allDone = t >= roundStart(p, p.rounds.length);
  const tx = txOf(p.lang);

  return (
    <AbsoluteFill>
      <Paper>
        {!allDone ? <Round r={r} idx={cur} total={p.rounds.length} local={local} ask={p.ask} roundWord={tx.round} /> : null}
        <div style={{ opacity: hookOut, position: 'absolute', inset: 0 }}>
          <Hook lines={p.hook} y={60} size={78} />
        </div>
        {p.rounds.map((round, i) => {
          const at = roundStart(p, i) + INTRO_S + THINK_S + round.path.length * stepS(round) + 0.1;
          return t < roundStart(p, i + 1) ? (
            <Stamp key={i} text={tx.path} at={at} top={MAP_TOP + MAP_H - 190} size={96} color={C.green} rotate={-6} />
          ) : null;
        })}
        {allDone ? (
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: 60, textAlign: 'center' }}>
            <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 104, color: C.sepia, lineHeight: 1.1 }}>{p.outro}</div>
            <div style={{ fontFamily: mono, fontSize: 42, color: C.vermilion, marginTop: 30 }}>{p.outroSub}</div>
          </AbsoluteFill>
        ) : null}
        <Progress total={end} />
      </Paper>
      <EndCard title={tx.endTitle} cta={p.cta} ctaSub={tx.ctaSub} icon={p.icon} start={end} />

      <Audio src={sfx('tension')} volume={(f) => musicVolume(p.voice, f / FPS, 0.6, end)} />
      <VoiceTrack voice={p.voice} />
      <Sfx at={0} src={sfx('hit')} volume={0.6} />
      {p.rounds.map((round, i) => {
        const s0 = roundStart(p, i);
        const draw = s0 + INTRO_S + THINK_S;
        return [
          <Sfx key={`w${i}`} at={s0} src={sfx('whoosh')} volume={0.6} />,
          ...[0, 1, 2, 3, 4].map((k) => <Sfx key={`k${i}${k}`} at={s0 + INTRO_S + 0.2 + k} src={app('tick')} volume={0.7} />),
          ...round.path.slice(1, -1).map((_, j) => <Sfx key={`s${i}${j}`} at={draw + (j + 1) * stepS(round)} src={app('draw')} volume={0.55} />),
          <Sfx key={`f${i}`} at={draw + round.path.length * stepS(round)} src={app('found')} volume={0.8} />,
          <Sfx key={`st${i}`} at={draw + round.path.length * stepS(round) + 0.1} src={app('stamp')} volume={0.8} />,
        ];
      })}
      <Sfx at={end} src={app('win')} volume={0.7} />
    </AbsoluteFill>
  );
}
