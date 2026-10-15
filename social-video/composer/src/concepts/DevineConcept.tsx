/**
 * « Devine le pays » joué devant le spectateur : à chaque essai, le nom se
 * tape dans la barre de recherche, puis six indices se retournent un par un
 * (continent, direction, distance, population, superficie, côtes), en vert,
 * orange ou rouge comme dans l'app. Les essais passés se rangent en bas,
 * façon Wordle. Avant le dernier essai, compte à rebours pour laisser le
 * spectateur répondre, puis la révélation.
 */
import { AbsoluteFill, Audio, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

import { C, EndCard, FPS, Hook, Paper, Progress, Sfx, Stamp, Tag, VoiceTrack, app, clamp, flag, mono, musicVolume, serif, sfx, type VoiceLine } from './kit';

export type DevineTile = { label: string; value: string; state: 'ok' | 'ko' | 'near' | 'info'; arrow?: number | null; dir?: number };
export type DevineRow = { cc: string; name: string; tiles: DevineTile[] };
export type DevineProps = {
  hook: string[];
  intro: string;
  rows: DevineRow[];
  pause: string;
  answer: { cc: string; name: string };
  outro: string;
  outroSub: string;
  cta: string;
  icon: string;
  voice?: VoiceLine[];
};

const FIRST = 1.0;
const GUESS_S = 3.4;
const TYPE_S = 0.55;
const FLIP_EVERY = 0.2;
const PAUSE_S = 2.8;
const REVEAL_S = 5;
const END_S = 4;
const guessAt = (i: number, n: number) => FIRST + i * GUESS_S + (i === n - 1 ? PAUSE_S : 0);
const endAt = (p: DevineProps) => guessAt(p.rows.length - 1, p.rows.length) + 1.8 + REVEAL_S;
export const devineSeconds = (p: DevineProps) => endAt(p) + END_S;

const TILE = { ok: C.success, ko: '#d9473b', near: '#e8902a', info: '#d9473b' } as const;
const tileColor = (t: DevineTile) => TILE[t.state];

function Arrow({ deg, size }: { deg: number; size: number }) {
  return <div style={{ fontSize: size, lineHeight: 1, transform: `rotate(${deg}deg)`, fontFamily: mono, fontWeight: 700 }}>↑</div>;
}

function BigTile({ tile, flip }: { tile: DevineTile; flip: number }) {
  // flip : 0 = face cachée, 1 = retournée.
  const shown = flip > 0.5;
  // Première moitié : le dos bascule jusqu'à la tranche ; seconde moitié : la face arrive.
  const angle = shown ? (flip - 1) * 180 : flip * 180;
  return (
    <div style={{ width: 300, height: 260, perspective: 900 }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 28,
          transform: `rotateX(${angle}deg)`,
          background: shown ? tileColor(tile) : C.parchmentDark,
          border: shown ? 'none' : `4px dashed ${C.tan}`,
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          boxShadow: shown ? '0 14px 30px rgba(44,24,16,0.25)' : 'none',
        }}
      >
        {shown ? (
          <>
            <div style={{ fontFamily: mono, fontSize: 26, opacity: 0.9, textTransform: 'uppercase', letterSpacing: 2 }}>{tile.label}</div>
            {tile.arrow != null ? <Arrow deg={tile.arrow} size={74} /> : null}
            {tile.value ? <div style={{ fontFamily: mono, fontWeight: 700, fontSize: tile.value.length > 9 ? 36 : 44 }}>{tile.value}</div> : null}
            {tile.dir ? <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 30 }}>{tile.dir > 0 ? '▲ plus' : '▼ moins'}</div> : null}
          </>
        ) : (
          <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 90, color: C.tan }}>?</div>
        )}
      </div>
    </div>
  );
}

function HistoryRow({ row, n, appear }: { row: DevineRow; n: number; appear: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: C.card,
        border: `3px solid ${C.tan}`,
        borderRadius: 22,
        padding: '12px 18px',
        transform: `translateY(${(1 - appear) * 60}px)`,
        opacity: appear,
      }}
    >
      <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 26, color: C.vermilion, width: 50 }}>#{n}</div>
      <Img src={flag(row.cc)} style={{ width: 64, height: 48, borderRadius: 6, objectFit: 'cover' }} />
      <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 36, color: C.sepia, width: 260, whiteSpace: 'nowrap', overflow: 'hidden' }}>{row.name}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        {row.tiles.map((t, i) => (
          <div key={i} style={{ width: 62, height: 62, borderRadius: 12, background: tileColor(t), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontWeight: 700, fontSize: 30 }}>
            {t.arrow != null ? <Arrow deg={t.arrow} size={36} /> : t.dir ? (t.dir > 0 ? '▲' : '▼') : t.state === 'ok' ? '✓' : '✗'}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DevineConcept(p: DevineProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const n = p.rows.length;
  let cur = -1;
  for (let i = 0; i < n; i++) if (t >= guessAt(i, n)) cur = i;
  const last = n - 1;
  const pauseStart = guessAt(last - 1, n) + GUESS_S;
  const inPause = t >= pauseStart && t < guessAt(last, n);
  const revealAt = guessAt(last, n) + TYPE_S + 6 * FLIP_EVERY + 0.4;
  const end = endAt(p);
  const row = cur >= 0 ? p.rows[cur] : null;
  const since = cur >= 0 ? t - guessAt(cur, n) : 0;
  const typed = row ? row.name.slice(0, Math.round(interpolate(since, [0, TYPE_S * 0.8], [0, row.name.length], clamp))) : '';
  const hookOut = interpolate(t, [2.2, 2.6], [1, 0], clamp);
  const reveal = spring({ frame: frame - revealAt * fps, fps, config: { damping: 11 } });
  const shake = inPause ? Math.sin(t * 40) * interpolate(t - pauseStart, [0, PAUSE_S], [0, 6], clamp) : 0;

  return (
    <AbsoluteFill>
      <Paper>
        {/* En-tête : accroche puis carte « pays mystère » */}
        <div style={{ opacity: hookOut }}>
          <Hook lines={p.hook} y={80} size={100} />
        </div>
        <div style={{ position: 'absolute', top: 70, left: 0, right: 0, textAlign: 'center', opacity: 1 - hookOut }}>
          <Tag>Devine le pays</Tag>
          <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 74, color: C.sepia, marginTop: 18 }}>
            {t >= revealAt ? p.answer.name : 'Pays mystère'}
          </div>
          <div style={{ fontFamily: mono, fontSize: 32, color: C.brown, marginTop: 6 }}>{t >= revealAt ? '' : `${p.intro} · Essai ${Math.max(1, cur + 1)}/${n}`}</div>
        </div>

        {/* Barre de recherche + essai en cours */}
        {row && t < revealAt + 0.2 ? (
          <div style={{ position: 'absolute', top: 320, left: 60, right: 60, transform: `translateX(${shake}px)` }}>
            <div
              style={{
                background: C.card,
                border: `4px solid ${C.tan}`,
                borderRadius: 30,
                padding: '22px 30px',
                fontFamily: mono,
                fontSize: 44,
                color: C.sepia,
                display: 'flex',
                alignItems: 'center',
                gap: 20,
              }}
            >
              <span style={{ color: C.brown }}>⌕</span>
              <span>{typed}</span>
              <span style={{ opacity: Math.floor(t * 3) % 2 ? 1 : 0, color: C.vermilion }}>|</span>
              {since > TYPE_S ? <Img src={flag(row.cc)} style={{ marginLeft: 'auto', width: 90, height: 66, borderRadius: 8, objectFit: 'cover' }} /> : null}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 30, justifyContent: 'center', marginTop: 40 }}>
              {row.tiles.map((tile, i) => {
                const f = interpolate(since, [TYPE_S + i * FLIP_EVERY, TYPE_S + i * FLIP_EVERY + 0.25], [0, 1], clamp);
                return <BigTile key={i} tile={tile} flip={f} />;
              })}
            </div>
          </div>
        ) : null}

        {/* Compte à rebours avant le dernier essai */}
        {inPause ? (
          <div style={{ position: 'absolute', top: 1010, left: 0, right: 0, textAlign: 'center' }}>
            <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 84, color: C.vermilion }}>{p.pause}</div>
            <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 150, color: C.sepia, lineHeight: 1, transform: `scale(${1.3 - 0.3 * ((t - pauseStart - 0.6) % 0.7) / 0.7})` }}>
              {t - pauseStart < 0.6 ? '' : Math.max(1, 3 - Math.floor((t - pauseStart - 0.6) / 0.7))}
            </div>
          </div>
        ) : null}

        {/* Révélation */}
        {t >= revealAt ? (
          <div style={{ position: 'absolute', top: 320, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Img
              src={flag(p.answer.cc)}
              style={{ width: 600, height: 450, borderRadius: 30, objectFit: 'cover', transform: `scale(${reveal}) rotate(${(1 - reveal) * 20}deg)`, boxShadow: '0 40px 90px rgba(44,24,16,0.4)', border: `10px solid ${C.card}` }}
            />
            <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 64, color: C.sepia, marginTop: 40, opacity: interpolate(t - revealAt, [1.6, 2], [0, 1], clamp), textAlign: 'center', padding: '0 60px' }}>
              {p.outro}
            </div>
            <div style={{ fontFamily: mono, fontSize: 38, color: C.vermilion, marginTop: 14, opacity: interpolate(t - revealAt, [2, 2.4], [0, 1], clamp) }}>{p.outroSub}</div>
          </div>
        ) : null}
        <Stamp text={`Trouvé en ${n} !`} at={revealAt + 0.5} top={720} size={80} color={C.green} />

        {/* Historique des essais */}
        <div style={{ position: 'absolute', bottom: 330, left: 40, right: 40, display: 'flex', flexDirection: 'column', gap: 14, opacity: t >= revealAt ? 0 : 1 }}>
          {p.rows.slice(0, Math.max(0, cur)).map((r, i) => (
            <HistoryRow key={i} row={r} n={i + 1} appear={spring({ frame: frame - guessAt(i + 1, n) * fps, fps, config: { damping: 14 } })} />
          ))}
        </div>
        <Progress total={end} />
      </Paper>

      <EndCard title="Un pays mystère chaque jour" cta={p.cta} ctaSub="Lien dans la bio" icon={p.icon} start={end} />

      <Audio src={sfx('music')} volume={(f) => {
        const s = f / FPS;
        if (s >= pauseStart && s < guessAt(last, n)) return 0.12;
        return musicVolume(p.voice, s, 0.45, end);
      }} />
      <VoiceTrack voice={p.voice} />
      <Sfx at={0} src={sfx('boom')} volume={0.5} />
      {p.rows.map((r, i) => {
        const at = guessAt(i, n);
        return [
          <Sfx key={`t${i}`} at={at} src={app('tap')} volume={0.6} />,
          ...r.tiles.map((tile, j) => (
            <Sfx key={`f${i}-${j}`} at={at + TYPE_S + j * FLIP_EVERY} src={tile.state === 'ok' ? app('correct') : app('draw')} volume={tile.state === 'ok' ? 0.35 : 0.3} />
          )),
        ];
      })}
      {[0, 1, 2].map((k) => (
        <Sfx key={`k${k}`} at={pauseStart + 0.6 + k * 0.7} src={app('tick')} volume={0.9} />
      ))}
      <Sfx at={revealAt} src={app('win')} volume={0.8} />
      <Sfx at={revealAt + 0.5} src={app('stamp')} volume={0.8} />
    </AbsoluteFill>
  );
}
