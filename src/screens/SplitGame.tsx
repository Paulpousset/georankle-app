/**
 * « Partage équitable » — a country with its regions and its biggest cities,
 * named but with no figures. The player draws straight lines across the map
 * (one for halves, two for thirds or quarters) so that the whole population
 * of the area (every town and village, the cities are only landmarks) ends
 * up in equal parts. Each map scores 0..200 from how
 * close the split gets to equal shares, counted from the best split straight
 * lines can reach on that map (see src/lib/split.ts), so a 5-map run lands on
 * 0..1000 — already the normalized scale that coins expect.
 *
 * A line is drawn by dragging across the map; it can then be moved whole by
 * dragging it, or turned by dragging one of its ends. Once every line is
 * drawn, a new one replaces the oldest. The cities take the colour of their
 * part as the lines move, but the shares stay hidden until the split is
 * submitted.
 */
import { showAlert } from '../lib/alert';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { playSfx } from '../lib/sfx';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Moon, Sun, Home, ChevronRight, Eraser } from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';

import {
  buildSplitRun,
  cityParts,
  cityRadius,
  clipToBoard,
  partCells,
  partShares,
  placeLabels,
  scoreLines,
  splitCityName,
  splitMapName,
  splitMap,
  isSplitGroup,
  LABEL_SIZE,
  SPLIT_MAX_POINTS,
  type Pt,
  type SplitLine,
  type SplitMap,
  type SplitQuestion,
} from '../lib/split';
import { fmtCount } from '../lib/format';
import { track } from '../lib/analytics';
import { awardSoloCoins } from '../lib/coins';
import { earnsCoins, saveSoloScore } from '../lib/soloResult';
import { OffLeaderboardNotice } from '../components/OffLeaderboardNotice';
import { CountryFactCard } from '../components/CountryFactCard';
import { useToast } from '../components/ToastProvider';
import type { GameMode, Language } from '../types';
import { PALETTE, getColors } from '../theme/colors';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton, announce, a11yHidden, ICON_HIT_SLOP } from '../lib/a11y';
import { ScoreText } from '../components/ScoreText';
import { ResultGrid } from '../components/ResultGrid';
import { SoloCoinReward } from '../components/SoloCoinReward';
import { SoloEndActions } from '../components/SoloEndActions';
import { EndGlobe } from '../components/end/EndGlobe';
import { Reveal } from '../components/end/Reveal';
import { END_CHOREO } from '../lib/motion';
import { useMyGameGlobe } from '../lib/myGlobe';
import { TopInsetBar } from '../components/TopInsetBar';

import { isMobileLayout as isMobile } from '../lib/layout';

const NUM_MAPS = 5;
const GOOD = '#2a6e3f';
const BAD = '#8b1a1a';
/** A drag shorter than this (viewBox units) is a tap, not a line. */
const MIN_DRAW = 8;
/** A touch this close to a line's end grabs that end. */
const HANDLE_HIT = 9;
/** A touch this close to a line (and not to an end) moves the whole line. */
const LINE_HIT = 6;
/** Tall countries (Chile-like boards) are capped at this height, in px. */
const BOARD_MAX_H = 520;

/** One colour per part, keyed like `cityParts` (bit per line). */
function partColors(isDarkMode: boolean): string[] {
  return [
    PALETTE.vermilion,
    isDarkMode ? PALETTE.chartBlue : PALETTE.oceanBlue,
    PALETTE.forestGreen,
    PALETTE.sand,
  ];
}

/** Grid square: green when close, yellow when roughly right, red otherwise. */
function gridCell(points: number): string {
  if (points >= SPLIT_MAX_POINTS * 0.8) return '🟩';
  if (points >= SPLIT_MAX_POINTS * 0.4) return '🟨';
  return '🟥';
}

function verdict(points: number, language: Language): string {
  if (points >= SPLIT_MAX_POINTS * 0.9) return tr(language, 'Partage parfait !', 'Perfect split!');
  if (points >= SPLIT_MAX_POINTS * 0.6) return tr(language, 'Presque équitable', 'Nearly fair');
  if (points >= SPLIT_MAX_POINTS * 0.3) return tr(language, 'Un peu déséquilibré', 'A bit lopsided');
  return tr(language, 'Très déséquilibré', 'Very lopsided');
}

/** « 52 % · 48 % » */
function sharesLabel(shares: number[]): string {
  return shares.map((s) => `${Math.round(s * 100)} %`).join(' · ');
}

function instruction(q: SplitQuestion, language: Language): string {
  if (q.parts === 2) {
    return tr(
      language,
      'Trace un trait qui coupe la population en deux parts égales.',
      'Draw a line that splits the population into two equal halves.',
    );
  }
  if (q.parts === 3) {
    return tr(
      language,
      'Trace deux traits qui coupent la population en 3 parts égales.',
      'Draw two lines that split the population into 3 equal parts.',
    );
  }
  return tr(
    language,
    'Trace deux traits qui se croisent pour couper la population en 4 parts égales.',
    'Draw two crossing lines that split the population into 4 equal parts.',
  );
}

interface SplitGameProps {
  setGameMode: (mode: GameMode) => void;
  user: User | null;
  /**
   * Entraînement: nothing is recorded (no coins, no leaderboard) and each
   * reveal offers the country's fact sheet.
   */
  training?: boolean;
}

/** The map, the lines drawn on it and the cities coloured by part. */
function SplitBoard({
  map,
  lines,
  draft,
  labels,
  handles,
  isDarkMode,
  colors,
}: {
  map: SplitMap;
  lines: SplitLine[];
  /** Line being drawn (dashed), drawn over `lines`. */
  draft?: SplitLine | null;
  labels: boolean;
  /** Show the draggable ends of the lines. */
  handles: boolean;
  isDarkMode: boolean;
  colors: string[];
}) {
  const land = isDarkMode ? PALETTE.nightSurface : PALETTE.parchment;
  const border = isDarkMode ? PALETTE.nightBorder : PALETTE.tan;
  const ink = isDarkMode ? PALETTE.nightText : PALETTE.sepia;
  const all = draft ? [...lines, draft] : lines;
  const parts = all.length ? cityParts(map, all) : null;
  const cells = all.length ? partCells(all, map.width, map.height) : [];
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${map.width} ${map.height}`}>
      <Defs>
        <ClipPath id={`split-clip-${map.id}`}>
          {map.regions.map((d, i) => (
            <Path key={i} d={d} />
          ))}
        </ClipPath>
        {/* A group's frame cuts through countries (Russia on Europe): keep them on the board. */}
        <ClipPath id={`split-board-${map.id}`}>
          <Rect x={0} y={0} width={map.width} height={map.height} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#split-board-${map.id})`}>
      {map.regions.map((d, i) => (
        <Path key={`f${i}`} d={d} fill={land} />
      ))}
      <G clipPath={`url(#split-clip-${map.id})`}>
        {cells.map((c) => (
          <Path key={c.key} d={c.path} fill={colors[c.key]} opacity={0.22} />
        ))}
      </G>
      {map.regions.map((d, i) => (
        <Path key={`s${i}`} d={d} fill="none" stroke={border} strokeWidth={0.35} />
      ))}
      </G>
      {all.map((l, i) => {
        const seg = clipToBoard(l, map.width, map.height);
        if (!seg) return null;
        const isDraft = !!draft && i === all.length - 1;
        return (
          <Line
            key={`l${i}`}
            x1={seg[0].x}
            y1={seg[0].y}
            x2={seg[1].x}
            y2={seg[1].y}
            stroke={ink}
            strokeWidth={1.1}
            strokeDasharray={isDraft ? '3 2' : undefined}
            strokeLinecap="round"
          />
        );
      })}
      {map.cities.map((c, i) => (
        <Circle
          key={`c${i}`}
          cx={c.x}
          cy={c.y}
          r={cityRadius(map, c)}
          fill={parts ? colors[parts[i]] : ink}
          stroke={land}
          strokeWidth={0.5}
        />
      ))}
      {labels && <CityLabels map={map} land={land} ink={ink} />}
      {handles &&
        lines.flatMap((l, i) =>
          [l.a, l.b].map((p, k) => (
            <Circle key={`h${i}${k}`} cx={p.x} cy={p.y} r={2.4} fill="#fff" stroke={ink} strokeWidth={0.8} />
          )),
        )}
    </Svg>
  );
}

/** « Lyon » next to every dot, with a halo so it reads over the lines. */
function CityLabels({ map, land, ink }: { map: SplitMap; land: string; ink: string }) {
  const { language } = useLanguage();
  const names = map.cities.map((c) => splitCityName(c, language));
  const spots = placeLabels(map, names);
  return (
    <>
      {[true, false].map((halo) =>
        map.cities.map((c, i) => (
          <SvgText
            key={`${halo ? 'h' : 't'}${i}`}
            x={spots[i].x}
            y={spots[i].y}
            textAnchor={spots[i].anchor}
            fontSize={LABEL_SIZE}
            fontFamily={FONTS.monoBold}
            fill={halo ? land : ink}
            stroke={halo ? land : undefined}
            strokeWidth={halo ? 1.1 : undefined}
            strokeLinejoin="round"
          >
            {names[i]}
          </SvgText>
        )),
      )}
    </>
  );
}

export default function SplitGame({ setGameMode, user, training = false }: SplitGameProps) {
  const { isDarkMode, setIsDarkMode } = useTheme();
  const { language, openLanguagePicker } = useLanguage();
  const toast = useToast();
  const c = getColors(isDarkMode);
  const colors = partColors(isDarkMode);

  const [run, setRun] = useState<SplitQuestion[]>(() =>
    buildSplitRun(Math.floor(Math.random() * 2147483647), NUM_MAPS),
  );
  const [questionIndex, setQuestionIndex] = useState(0);
  const question = run[questionIndex] ?? null;
  const map = question ? splitMap(question.id) : null;
  const [lines, setLines] = useState<SplitLine[]>([]);
  const [draft, setDraft] = useState<SplitLine | null>(null);
  const [dragging, setDragging] = useState(false);
  const [boardWidth, setBoardWidth] = useState(0);
  /** Result of the current map once validated (null while still drawing). */
  const [feedback, setFeedback] = useState<{ points: number; shares: number[] } | null>(null);
  const [score, setScore] = useState(0);
  const [grid, setGrid] = useState('');
  const [history, setHistory] = useState<{ points: number; shares: number[]; lines: SplitLine[] }[]>([]);
  const [factsFor, setFactsFor] = useState<string | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [coinsEarned, setCoinsEarned] = useState<number | null>(null);
  const [coinsCapped, setCoinsCapped] = useState(false);
  const [coinsSyncFailed, setCoinsSyncFailed] = useState(false);
  const { config: myGlobe } = useMyGameGlobe();
  const awardedRef = useRef(false);

  useEffect(() => {
    track('game_started', { mode: 'split' });
  }, []);

  // The responder is created once (a new one mid-drag would reset its gesture
  // state): it reads the live values through a mutable box synced after each
  // render, like ZoomSlider.
  const [live] = useState(() => ({
    current: {
      map,
      lines,
      maxLines: question?.lines ?? 1,
      locked: !!feedback,
      unit: 1,
      /** What the current drag moves: a line's end, a whole line, or a new line from `origin`. */
      grab: null as
        | null
        | { kind: 'end'; line: number; end: 'a' | 'b'; origin: Pt }
        | { kind: 'move'; line: number; from: SplitLine }
        | { kind: 'new'; origin: Pt },
      draft: null as SplitLine | null,
    },
  }));
  useLayoutEffect(() => {
    Object.assign(live.current, {
      map,
      lines,
      maxLines: question?.lines ?? 1,
      locked: !!feedback || gameOver,
      unit: map && boardWidth > 0 ? map.width / boardWidth : 1,
    });
  });

  const [responder] = useState(() => {
    const clampPt = (p: Pt): Pt => {
      const m = live.current.map;
      if (!m) return p;
      return { x: Math.max(0, Math.min(m.width, p.x)), y: Math.max(0, Math.min(m.height, p.y)) };
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !live.current.locked,
      onMoveShouldSetPanResponder: () => !live.current.locked,
      // Keep a drag on the map away from the screen's vertical ScrollView.
      onMoveShouldSetPanResponderCapture: () => !live.current.locked,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        const s = live.current;
        const p = clampPt({ x: evt.nativeEvent.locationX * s.unit, y: evt.nativeEvent.locationY * s.unit });
        setDragging(true);
        for (let i = 0; i < s.lines.length; i++) {
          for (const end of ['a', 'b'] as const) {
            const q = s.lines[i][end];
            if (Math.hypot(q.x - p.x, q.y - p.y) <= HANDLE_HIT) {
              s.grab = { kind: 'end', line: i, end, origin: q };
              return;
            }
          }
        }
        // On a line (closest first): move it whole.
        let near = -1;
        let nearDist = LINE_HIT;
        s.lines.forEach((l, i) => {
          const len = Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) || 1;
          const dist = Math.abs((l.b.x - l.a.x) * (p.y - l.a.y) - (l.b.y - l.a.y) * (p.x - l.a.x)) / len;
          if (dist <= nearDist) {
            near = i;
            nearDist = dist;
          }
        });
        if (near >= 0) {
          s.grab = { kind: 'move', line: near, from: s.lines[near] };
          return;
        }
        // A new line; once every line is drawn, it replaces the oldest one.
        s.grab = { kind: 'new', origin: p };
        s.draft = { a: p, b: p };
      },
      onPanResponderMove: (_evt, g) => {
        const s = live.current;
        const grab = s.grab;
        if (!grab) return;
        if (grab.kind === 'move') {
          const m = s.map;
          const { a, b } = grab.from;
          // The whole line slides, both ends kept on the board.
          const dx = m
            ? Math.max(-Math.min(a.x, b.x), Math.min(m.width - Math.max(a.x, b.x), g.dx * s.unit))
            : g.dx * s.unit;
          const dy = m
            ? Math.max(-Math.min(a.y, b.y), Math.min(m.height - Math.max(a.y, b.y), g.dy * s.unit))
            : g.dy * s.unit;
          const moved = { a: { x: a.x + dx, y: a.y + dy }, b: { x: b.x + dx, y: b.y + dy } };
          setLines((prev) => prev.map((l, i) => (i === grab.line ? moved : l)));
          return;
        }
        const p = clampPt({ x: grab.origin.x + g.dx * s.unit, y: grab.origin.y + g.dy * s.unit });
        if (grab.kind === 'end') {
          setLines((prev) =>
            prev.map((l, i) => (i === grab.line ? { ...l, [grab.end]: p } : l)),
          );
        } else {
          s.draft = { a: grab.origin, b: p };
          setDraft(s.draft);
        }
      },
      onPanResponderRelease: () => {
        const s = live.current;
        const grab = s.grab;
        const d = s.draft;
        s.grab = null;
        s.draft = null;
        setDragging(false);
        setDraft(null);
        if (grab?.kind === 'new' && d && Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) >= MIN_DRAW) {
          const max = s.maxLines;
          setLines((prev) => [...prev, d].slice(-max));
          Haptics.selectionAsync().catch(() => {});
        }
      },
      onPanResponderTerminate: () => {
        live.current.grab = null;
        live.current.draft = null;
        setDragging(false);
        setDraft(null);
      },
    });
  });

  const countryName = question ? splitMapName(question.id, language) : '';
  const ready = !!question && lines.length >= question.lines;

  const validate = () => {
    if (!question || !map || feedback || !ready) return;
    const { points } = scoreLines(question, lines);
    const shares = partShares(map, lines).map((p) => p.share);
    setScore((s) => s + points);
    setGrid((g) => g + gridCell(points));
    setHistory((h) => [...h, { points, shares, lines }]);
    const good = points >= SPLIT_MAX_POINTS * 0.6;
    Haptics.notificationAsync(
      good ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    ).catch(() => {});
    playSfx(good ? 'correct' : 'wrong');
    announce(`${verdict(points, language)}, ${sharesLabel(shares)}, +${points}`);
    setFeedback({ points, shares });
  };

  const finishRun = (finalScore: number) => {
    setGameOver(true);
    announce(tr(language, 'Partie terminée. Score {0}.', 'Game over. Score {0}.', [finalScore]));
    track('game_completed', { mode: 'split', score: finalScore });
    if (user && !awardedRef.current) {
      awardedRef.current = true;
      void saveSoloScore(user, 'split', finalScore, { training }, () =>
        showAlert(
          tr(language, 'Erreur', 'Error'),
          tr(language, "Impossible d'enregistrer ton score.", 'Could not save your score.'),
        ),
      );
      // Already on the 0..1000 scale coins expect (200 a map, 5 maps).
      const normalized = Math.round((finalScore / Math.max(1, run.length * SPLIT_MAX_POINTS)) * 1000);
      if (earnsCoins({ training })) awardSoloCoins('split', normalized).then((res) => {
        setCoinsEarned(res.coinsAwarded);
        setCoinsCapped(res.capped);
        setCoinsSyncFailed(!res.synced);
        if (!res.synced) {
          toast.info(
            tr(
              language,
              'Pièces non synchronisées — réessai à la reconnexion.',
              'Coins not synced — will retry when you reconnect.',
            ),
          );
        }
      });
    }
  };

  const next = () => {
    if (questionIndex + 1 >= run.length) {
      finishRun(score);
      return;
    }
    setQuestionIndex((i) => i + 1);
    setLines([]);
    setFeedback(null);
  };

  /** Remet la manche à zéro sans toucher au tirage. */
  const restartRun = () => {
    setQuestionIndex(0);
    setLines([]);
    setFeedback(null);
    setScore(0);
    setGrid('');
    setHistory([]);
    setGameOver(false);
    setCoinsEarned(null);
    setCoinsCapped(false);
    setCoinsSyncFailed(false);
    awardedRef.current = false;
  };

  /** Nouveau tirage. */
  const resetGame = () => {
    setRun(buildSplitRun(Math.floor(Math.random() * 2147483647), NUM_MAPS));
    restartRun();
  };

  if (!question || !map) return null;

  const onBoardLayout = (e: LayoutChangeEvent) => setBoardWidth(e.nativeEvent.layout.width);
  const partsLeft = question.lines - lines.length;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: c.background }]}
      edges={['left', 'right', 'bottom']}
    >
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <TopInsetBar color={isDarkMode ? c.background : c.card} />

      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <TouchableOpacity
            onPress={() => setGameMode('menu')}
            style={[styles.iconBtn, { backgroundColor: c.surface, borderColor: c.border, marginRight: 8 }]}
            hitSlop={ICON_HIT_SLOP}
            {...a11yButton(tr(language, 'Menu', 'Menu'))}
          >
            <Home color={c.accent} size={18} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
            {tr(language, 'Partage équitable', 'Fair Split')}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.statsContainer, { backgroundColor: c.surface, borderColor: c.border }]}>
            <ScoreText style={[styles.statValue, { color: c.accent }]}>
              {questionIndex + 1}/{run.length}
            </ScoreText>
            <View style={{ backgroundColor: c.border, width: 1, height: 20, marginHorizontal: 6 }} />
            <ScoreText style={[styles.statValue, { color: GOOD }]}>{score}</ScoreText>
          </View>

          <TouchableOpacity
            onPress={openLanguagePicker}
            style={[styles.iconBtn, { backgroundColor: c.surface, borderColor: c.border, minWidth: 40, alignItems: 'center' }]}
            hitSlop={ICON_HIT_SLOP}
            {...a11yButton(tr(language, 'Changer de langue', 'Change language'))}
          >
            <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 11 }}>
              {language.toUpperCase()}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setIsDarkMode(!isDarkMode)}
            style={[styles.iconBtn, { backgroundColor: c.surface, borderColor: c.border }]}
            hitSlop={ICON_HIT_SLOP}
            {...a11yButton(
              isDarkMode ? tr(language, 'Mode clair', 'Light mode') : tr(language, 'Mode sombre', 'Dark mode'),
            )}
          >
            {isDarkMode ? <Sun color={c.accent} size={18} /> : <Moon color={c.textMuted} size={18} />}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.gameArea} scrollEnabled={!gameOver && !dragging}>
        <Text style={[styles.turnIndicator, { color: c.accent }]}>
          {question.parts === 2
            ? tr(language, 'Carte {0}/{1} · en deux', 'Map {0}/{1} · halves', [questionIndex + 1, run.length])
            : tr(language, 'Carte {0}/{1} · en {2}', 'Map {0}/{1} · in {2}', [questionIndex + 1, run.length, question.parts])}
        </Text>

        <View style={[styles.card, !isDarkMode && styles.cardLight]}>
          <Text style={[styles.countryName, { color: c.text }]} numberOfLines={1}>
            {countryName}
          </Text>
          <Text style={[styles.totalText, { color: c.textMuted }]}>
            {tr(language, 'Population de la zone : {0}', 'Population of the area: {0}', [
              fmtCount(map.total, language),
            ])}
          </Text>
          <View
            style={[styles.board, { aspectRatio: map.width / map.height, maxWidth: BOARD_MAX_H * (map.width / map.height) }]}
            accessible
            accessibilityLabel={tr(language, 'Carte de {0} avec {1} villes', 'Map of {0} with {1} cities', [
              countryName,
              map.cities.length,
            ])}
          >
            <View style={StyleSheet.absoluteFill} {...a11yHidden}>
              <SplitBoard
                map={map}
                // A new line drawn once every line is there replaces the oldest: hide it meanwhile.
                lines={draft && lines.length >= question.lines ? lines.slice(1) : lines}
                draft={draft}
                labels
                handles={!feedback}
                isDarkMode={isDarkMode}
                colors={colors}
              />
            </View>
            {/* Childless overlay: touch coordinates are relative to it, not to an SVG shape. */}
            <View
              style={[StyleSheet.absoluteFill, styles.touchLayer]}
              onLayout={onBoardLayout}
              {...responder.panHandlers}
            />
          </View>
          <Text style={[styles.instruction, { color: c.textMuted }]}>
            {feedback
              ? tr(language, 'Chaque couleur est une part.', 'Each colour is one part.')
              : instruction(question, language)}
          </Text>
          {!feedback && lines.length > 0 && (
            <Text style={[styles.hint, { color: c.textMuted }]}>
              {partsLeft > 0
                ? tr(language, 'Encore un trait à tracer.', 'One more line to draw.')
                : question.lines > 1
                  ? tr(
                      language,
                      'Glisse un trait pour le déplacer, un rond blanc pour le tourner. Un nouveau trait remplace le plus ancien.',
                      'Drag a line to move it, a white dot to turn it. A new line replaces the oldest.',
                    )
                  : tr(
                      language,
                      'Glisse le trait pour le déplacer, un rond blanc pour le tourner.',
                      'Drag the line to move it, a white dot to turn it.',
                    )}
            </Text>
          )}
        </View>

        {!feedback ? (
          <>
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.clearBtn, { borderColor: c.border, opacity: lines.length ? 1 : 0.4 }]}
                onPress={() => setLines([])}
                disabled={!lines.length}
                {...a11yButton(tr(language, 'Effacer les traits', 'Clear the lines'))}
              >
                <Eraser color={c.text} size={18} />
                <Text style={[styles.clearBtnText, { color: c.text }]}>{tr(language, 'Effacer', 'Clear')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: GOOD, opacity: ready ? 1 : 0.45 }]}
                onPress={validate}
                disabled={!ready}
                {...a11yButton(tr(language, 'Valider', 'Submit'))}
              >
                <Text style={styles.nextBtnText}>{tr(language, 'VALIDER', 'SUBMIT')}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View
            style={[
              styles.feedbackCard,
              feedback.points >= SPLIT_MAX_POINTS * 0.6 ? styles.correctCard : styles.wrongCard,
            ]}
          >
            <Text style={[styles.feedbackTitle, { color: c.text }]}>{verdict(feedback.points, language)}</Text>
            <View style={styles.sharesRow}>
              {partShares(map, lines).map((p) => (
                <View key={p.key} style={[styles.shareChip, { borderColor: colors[p.key] }]}>
                  <View style={[styles.shareDot, { backgroundColor: colors[p.key] }]} />
                  <View>
                    <ScoreText style={[styles.shareText, { color: c.text }]}>{`${Math.round(p.share * 100)} %`}</ScoreText>
                    <Text style={[styles.sharePop, { color: c.textMuted }]}>{fmtCount(p.pop, language)}</Text>
                  </View>
                </View>
              ))}
            </View>
            <Text style={[styles.feedbackSub, { color: c.textMuted }]}>
              {tr(language, 'Objectif : {0} % chacune', 'Target: {0}% each', [Math.round(100 / question.parts)])}
            </Text>
            <Text style={[styles.feedbackSub, { color: c.text }]}>
              {`+${feedback.points} / ${SPLIT_MAX_POINTS}`}
            </Text>
            {training && !isSplitGroup(question.id) && (
              <TouchableOpacity
                style={[styles.learnBtn, { borderColor: c.accent }]}
                onPress={() => setFactsFor(question.id)}
                {...a11yButton(tr(language, 'En savoir plus sur ce pays', 'Learn more about this country'))}
              >
                <Text style={[styles.learnBtnText, { color: c.accent }]}>
                  {tr(language, 'En savoir plus', 'Learn more')}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: c.accentStrong }]}
              onPress={next}
              {...a11yButton(
                questionIndex + 1 >= run.length ? tr(language, 'Voir le score', 'See score') : tr(language, 'Suivant', 'Next'),
              )}
            >
              <Text style={styles.nextBtnText}>
                {questionIndex + 1 >= run.length ? tr(language, 'Voir le score', 'See score') : tr(language, 'Suivant', 'Next')}
              </Text>
              <ChevronRight color="#fff" size={20} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {gameOver && (
        <View
          style={[
            styles.gameOverOverlay,
            { backgroundColor: isDarkMode ? 'rgba(10,22,40,0.96)' : 'rgba(242,232,208,0.97)' },
          ]}
        >
          <ScrollView contentContainerStyle={styles.gameOverContent} showsVerticalScrollIndicator={false}>
            <EndGlobe
              config={myGlobe}
              size={100}
              accent={GOOD}
              animate
              style={{ marginBottom: 10 }}
              record={{ mode: 'split', score, ctx: { training } }}
            />
            <Reveal at={END_CHOREO.verdict}>
              <ResultGrid grid={grid} style={{ marginBottom: 10 }} />
              <ScoreText style={[styles.gameOverScore, { color: c.text }]}>{score}</ScoreText>
              <Text style={{ color: c.textMuted, fontFamily: FONTS.mono, fontSize: 14, marginBottom: 16, textAlign: 'center' }}>
                {tr(language, 'sur {0}', 'out of {0}', [run.length * SPLIT_MAX_POINTS])}
              </Text>
              <OffLeaderboardNotice run={{ training }} color={c.textMuted} />
            </Reveal>

            <Reveal at={END_CHOREO.detail}>
              <SoloCoinReward
                coinsEarned={coinsEarned}
                coinsCapped={coinsCapped}
                coinsSyncFailed={coinsSyncFailed}
                containerStyle={{ alignSelf: 'stretch', marginBottom: 12 }}
              />
            </Reveal>

            {/* Recap: every map with the split that was drawn. */}
            <Reveal at={END_CHOREO.reward}>
              <View style={[styles.recapCard, { backgroundColor: c.card, borderColor: c.border }]}>
                {run.map((q, i) => {
                  const h = history[i];
                  const m = splitMap(q.id);
                  const ok = !!h && h.points >= SPLIT_MAX_POINTS * 0.6;
                  // A group of countries has no fact sheet to open.
                  const group = isSplitGroup(q.id);
                  return (
                    <TouchableOpacity
                      key={q.id}
                      onPress={() => setFactsFor(q.id)}
                      disabled={group}
                      style={[styles.recapRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}
                      {...a11yButton(`${splitMapName(q.id, language)}, +${h?.points ?? 0}`, {
                        hint: group ? undefined : tr(language, 'Voir la fiche du pays', 'See the country facts'),
                      })}
                    >
                      {m && (
                        <View style={[styles.recapShape, { aspectRatio: m.width / m.height }]} {...a11yHidden}>
                          <SplitBoard
                            map={m}
                            lines={h?.lines ?? []}
                            labels={false}
                            handles={false}
                            isDarkMode={isDarkMode}
                            colors={colors}
                          />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.recapName, { color: c.text }]} numberOfLines={1}>
                          {splitMapName(q.id, language)}
                        </Text>
                        {h && (
                          <Text style={{ color: c.textMuted, fontFamily: FONTS.mono, fontSize: 11 }}>
                            {sharesLabel(h.shares)}
                          </Text>
                        )}
                      </View>
                      <ScoreText style={{ color: ok ? GOOD : BAD, fontSize: 14, fontFamily: FONTS.monoBold }}>
                        {`+${h?.points ?? 0}`}
                      </ScoreText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Reveal>

            <Reveal at={END_CHOREO.actions}>
              {!user && (
                <Text style={{ color: c.textMuted, fontFamily: FONTS.mono, fontSize: 12, textAlign: 'center', marginBottom: 12 }}>
                  {tr(
                    language,
                    'Connecte-toi pour gagner des pièces et sauvegarder ton score.',
                    'Sign in to earn coins and save your score.',
                  )}
                </Text>
              )}
              <SoloEndActions
                onReplaySame={restartRun}
                onNewGame={resetGame}
                share={{ mode: 'split', summary: `${score}/${run.length * SPLIT_MAX_POINTS}` }}
                onMenu={() => setGameMode('menu')}
              />
            </Reveal>
          </ScrollView>
        </View>
      )}

      <CountryFactCard cca3={factsFor} onClose={() => setFactsFor(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, userSelect: 'none' as never },
  header: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    minHeight: 60,
  },
  title: { fontSize: isMobile ? 16 : 18, fontFamily: FONTS.headingBlack, flexShrink: 1 },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  statValue: { fontSize: 15, fontFamily: FONTS.monoBold },
  iconBtn: { padding: 6, borderRadius: 10, borderWidth: 1 },

  gameArea: { padding: isMobile ? 12 : 20, alignItems: 'center', paddingBottom: 40 },
  turnIndicator: { fontSize: 18, fontFamily: FONTS.headingBlack, marginBottom: 12, textTransform: 'uppercase' },
  card: {
    backgroundColor: '#132040', padding: isMobile ? 10 : 16, borderRadius: 24, alignItems: 'center',
    marginBottom: 16, width: '100%', maxWidth: 640, borderWidth: 1, borderColor: '#2d4a70',
  },
  cardLight: { backgroundColor: '#e8d9b8', borderColor: '#c4a87a', elevation: 4, shadowOpacity: 0.1 },
  countryName: { textAlign: 'center', fontSize: 18, fontFamily: FONTS.headingBlack, paddingHorizontal: 4 },
  totalText: { textAlign: 'center', fontSize: 12, fontFamily: FONTS.mono, marginTop: 2 },
  board: { width: '100%', alignSelf: 'center', marginVertical: 8 },
  touchLayer: { touchAction: 'none', cursor: 'crosshair' } as never,
  instruction: { fontSize: 13, fontFamily: FONTS.mono, marginTop: 4, textAlign: 'center' },
  hint: { fontSize: 11.5, fontFamily: FONTS.mono, marginTop: 4, textAlign: 'center', opacity: 0.85 },

  actionsRow: { flexDirection: 'row', gap: 10, width: '100%', maxWidth: 500 },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1.5,
  },
  clearBtnText: { fontFamily: FONTS.monoBold, fontSize: 14 },
  submitBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14,
  },

  feedbackCard: { padding: 24, borderRadius: 24, alignItems: 'center', width: '100%', maxWidth: 500 },
  correctCard: { backgroundColor: 'rgba(42, 110, 63, 0.15)', borderWidth: 2, borderColor: GOOD },
  wrongCard: { backgroundColor: 'rgba(139, 26, 26, 0.15)', borderWidth: 2, borderColor: BAD },
  feedbackTitle: { fontSize: 22, fontFamily: FONTS.headingBlack, marginBottom: 10, textAlign: 'center' },
  feedbackSub: { fontSize: 14, textAlign: 'center', fontFamily: FONTS.mono, marginTop: 4 },
  sharesRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 4 },
  shareChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 12,
    paddingVertical: 5, paddingHorizontal: 10,
  },
  shareDot: { width: 10, height: 10, borderRadius: 5 },
  shareText: { fontFamily: FONTS.monoBold, fontSize: 16 },
  sharePop: { fontFamily: FONTS.mono, fontSize: 11 },
  learnBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 14, marginTop: 10 },
  learnBtnText: { fontFamily: FONTS.monoBold, fontSize: 11.5 },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 18, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, alignSelf: 'stretch',
    maxWidth: 500, width: '100%',
  },
  nextBtnText: { color: '#fff', fontFamily: FONTS.monoBold, fontSize: 16 },

  gameOverOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  gameOverContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
  },
  gameOverScore: { fontSize: 48, fontFamily: FONTS.headingBlack, marginBottom: 4, textAlign: 'center' },
  recapCard: { alignSelf: 'stretch', borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, marginBottom: 16 },
  recapRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  recapShape: { height: 48 },
  recapName: { fontSize: 14, fontFamily: FONTS.heading },
});
