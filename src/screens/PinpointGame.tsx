/**
 * « Point sur le Globe » — a marker on a BORDERLESS 3D globe; which country is
 * it in? Played on the same CARRÉ / DUO / CASH board as Silhouette and the
 * country↔capital quiz: pick a difficulty (DUO = 2 options / 1 pt, CARRÉ = 4
 * options / 3 pts, CASH = type the name / 5 pts), answer, see the borders appear
 * around the point. In DUO and CARRÉ the wrong options are the countries
 * closest to the point (src/lib/pinpoint.ts), so the question is really "this
 * one or its neighbour?".
 *
 * Points and questions are seeded so daily and online rounds are identical for
 * everyone sharing the seed. Scoring is the unified points model (raw 0..N*5),
 * normalized to 0..1000 for matches. Mirrors SilhouetteGame's solo / daily /
 * match wiring.
 *
 * The globe is always the WebGL one (no Canvas-2D fallback, no shop skin): the
 * borderless coat only exists there, and a skin's texture would draw every
 * border back.
 */
import { showAlert } from '../lib/alert';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import {
  Moon, Sun, Home, HelpCircle, Eye, CheckCircle, ChevronRight, MapPin,
} from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';

import GlobeWebView from '../components/GlobeWebView';
import type { WebViewMessageEvent } from '../components/GlobeWebView';
import {
  buildPinpointRun,
  pinpointCountryName,
  pinpointAcceptedAnswers,
  type PinpointQuestion,
} from '../lib/pinpoint';
import { buildPinpointEarthHtml } from '../lib/globe3d/buildEarthHtml';
import { getMapPalette } from '../theme/mapPalette';
import rawWorldPolygons from '../../assets/world_polygons.json';
import { isAnswerClose } from '../lib/answerMatch';
import { createSeededRng, seededShuffle } from '../lib/rng';
import { normalizeRoundScore } from '../lib/score';
import { track } from '../lib/analytics';
import { awardSoloCoins } from '../lib/coins';
import { earnsCoins, saveSoloScore } from '../lib/soloResult';
import { OffLeaderboardNotice } from '../components/OffLeaderboardNotice';
import { CountryFactCard } from '../components/CountryFactCard';
import { RunRecap, type RecapEntry } from '../components/RunRecap';
import { recordRun } from '../lib/reviewPool';
import type { ContinentId } from '../data/continents';
import { useToast } from '../components/ToastProvider';
import type { GameMode, Match } from '../types';
import { getColors, PALETTE } from '../theme/colors';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton, a11yImage, announce, a11yHidden, ICON_HIT_SLOP } from '../lib/a11y';
import { ScoreText } from '../components/ScoreText';
import { ResultGrid } from '../components/ResultGrid';
import { AtlasTrophy, AtlasCross } from '../components/AtlasIcons';
import { SoloCoinReward } from '../components/SoloCoinReward';
import { SoloEndActions } from '../components/SoloEndActions';
import { EndGlobe } from '../components/end/EndGlobe';
import { Reveal } from '../components/end/Reveal';
import { END_CHOREO } from '../lib/motion';
import { useMyGameGlobe } from '../lib/myGlobe';
import { TopInsetBar } from '../components/TopInsetBar';
import { isMobileLayout as isMobile } from '../lib/layout';

type QuizMode = 'DUO' | 'CARRE' | 'CASH';
type Feedback = { correct: boolean; points: number; answer: string };
const MODE_POINTS: Record<QuizMode, number> = { DUO: 1, CARRE: 3, CASH: 5 };
/** Ceiling per question, so match normalization matches the other quizzes. */
const MAX_POINTS_PER_QUESTION = 5;

interface WorldPolygon {
  id: string;
  r: number[][][];
}
const WORLD_POLYGONS = rawWorldPolygons as unknown as WorldPolygon[];

interface GlobeMessage {
  type: 'GLOBE_READY' | 'GLOBE_ERROR';
  msg?: string;
}

interface PinpointGameProps {
  setGameMode: (mode: GameMode) => void;
  user: User | null;
  matchData?: Match | null;
  onRoundComplete?: (score: number) => void;
  /** Daily challenge: deterministic seed for today's puzzle (overrides random). */
  dailySeed?: number;
  /** Daily challenge: fired once at game-over with the score + emoji grid. */
  onDailyComplete?: (score: number, grid?: string) => void;
  /** Daily challenge: replaces "Retry" with "Share" and skips score saving. */
  isDaily?: boolean;
  /** Daily challenge: invoked by the "Share" button on the game-over overlay. */
  onShare?: () => void;
  /** Daily challenge: reports the live score so a mid-game quit can lock it in. */
  onDailyScoreChange?: (score: number) => void;
  /**
   * Entraînement: no mistake ends the run, every answer is explained, and
   * nothing is recorded (no coins, no leaderboard).
   */
  training?: boolean;
  /** Solo continent scope: narrows the answer countries. Null = worldwide. */
  scope?: ContinentId | null;
  /** Review run: countries to ask about first (see lib/reviewPool). */
  reviewIds?: string[] | null;
}

export default function PinpointGame({
  setGameMode,
  user,
  matchData,
  onRoundComplete,
  dailySeed,
  onDailyComplete,
  isDaily,
  onShare,
  onDailyScoreChange,
  scope = null,
  reviewIds = null,
  training = false,
}: PinpointGameProps) {
  const { isDarkMode, setIsDarkMode } = useTheme();
  const { language, openLanguagePicker } = useLanguage();
  const toast = useToast();
  const c = getColors(isDarkMode);
  const { height: winH } = useWindowDimensions();

  // Session length: per-round config (custom matches) > match-level > 5.
  const currentRound = matchData?.current_round ?? 1;
  const numQuestions =
    (matchData?.game_data?.rounds?.[currentRound - 1]?.count as number | undefined) ??
    (matchData?.game_data?.roundsPerSet as number | undefined) ??
    5;

  const isOnline = !!matchData && !!onRoundComplete;

  // The seed drives both the question sequence AND the per-mode option order, so
  // two players sharing a match seed face the exact same board.
  const [seed] = useState(
    () =>
      dailySeed ??
      (matchData?.game_data?.seed
        ? matchData.game_data.seed + (currentRound - 1)
        : Math.floor(Math.random() * 2147483647)),
  );
  const [run, setRun] = useState<PinpointQuestion[]>(() =>
    buildPinpointRun(seed, numQuestions, { continent: scope, reviewIds }),
  );
  const [runSeed, setRunSeed] = useState(seed);

  const [questionIndex, setQuestionIndex] = useState(0);
  const [mode, setMode] = useState<QuizMode | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [cashInput, setCashInput] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  /** What the player picked in DUO/CARRÉ (null in CASH) — painted on the reveal. */
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  /** '🟩'/'🟥' per answered question — the daily share grid. */
  const [grid, setGrid] = useState('');
  /** Per-question outcome, in run order — drives the end-of-run recap. */
  const [history, setHistory] = useState<{ correct: boolean; points: number; yourAnswer?: string }[]>([]);
  /** Country whose fact sheet is open from a training reveal. */
  const [factsFor, setFactsFor] = useState<string | null>(null);
  const isReview = !!reviewIds?.length;
  const [gameOver, setGameOver] = useState(false);
  const [coinsEarned, setCoinsEarned] = useState<number | null>(null);
  const [coinsCapped, setCoinsCapped] = useState(false);
  const [coinsSyncFailed, setCoinsSyncFailed] = useState(false);
  const { config: myGlobe } = useMyGameGlobe();
  const awardedRef = useRef(false);

  // ── Globe ──────────────────────────────────────────────────────────────────
  // three.js is loaded once, lazily (it is a ~700 KB string); no flag, no skin:
  // the borderless coat exists only in the WebGL builder.
  const [threeSrc, setThreeSrc] = useState<string | null>(null);
  const [globeError, setGlobeError] = useState<string | null>(null);
  const [globeReady, setGlobeReady] = useState(false);
  useEffect(() => {
    let alive = true;
    import('../vendor/threeSource')
      .then((m) => { if (alive) setThreeSrc(m.THREE_SRC); })
      .catch(() => { if (alive) setGlobeError('three'); });
    return () => { alive = false; };
  }, []);
  const webViewRef = useRef<any>(null);
  const globeHtml = useMemo(() => {
    if (!threeSrc) return null;
    return buildPinpointEarthHtml({
      threeSrc,
      isDark: isDarkMode,
      pal: getMapPalette(isDarkMode),
      polygons: WORLD_POLYGONS,
    });
  }, [threeSrc, isDarkMode]);
  // A new page (theme flip) has to announce itself again before it is driven
  // (the "adjust state when a value changes" pattern, no effect needed).
  const [lastHtml, setLastHtml] = useState(globeHtml);
  if (lastHtml !== globeHtml) {
    setLastHtml(globeHtml);
    setGlobeReady(false);
  }

  // GlobeWebView keeps the latest handler in a ref, so no memoization needed.
  const handleMessage = (event: WebViewMessageEvent) => {
    let msg: GlobeMessage;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'GLOBE_READY') setGlobeReady(true);
    else if (msg.type === 'GLOBE_ERROR') setGlobeError(msg.msg ?? 'Globe failed to load');
  };

  const question = run[questionIndex] ?? null;
  const correctName = question ? pinpointCountryName(question.answer, language) : '';

  // Drive the page: drop the pin on every question (and again on a reloaded
  // page), and replay the reveal if one is showing.
  useEffect(() => {
    if (!globeReady || !question) return;
    const wv = webViewRef.current;
    if (!wv) return;
    wv.injectJavaScript(
      `window.setPin(${question.lat},${question.lng},'${question.answer}');true;`,
    );
    if (feedback) {
      wv.injectJavaScript(
        `window.showResult('${question.answer}',${picked ? `'${picked}'` : 'null'});true;`,
      );
    }
    // The reveal is replayed only when the page reloads mid-feedback; a fresh
    // reveal is injected by resolve().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globeReady, questionIndex, runSeed]);

  // Surface the running raw score so the daily host can lock it in on a quit.
  useEffect(() => {
    if (isDaily) onDailyScoreChange?.(score);
  }, [isDaily, score, onDailyScoreChange]);

  useEffect(() => {
    if (!matchData && !isDaily) track('game_started', { mode: 'pinpoint' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickMode = (m: QuizMode) => {
    if (!question) return;
    Haptics.selectionAsync().catch(() => {});
    if (m === 'CASH') {
      setCashInput('');
    } else {
      // CARRÉ = the answer + its 3 nearest neighbours; DUO = the answer + the
      // single nearest one. Re-shuffled deterministically so both online
      // players match.
      const rng = createSeededRng(runSeed + questionIndex * 131 + (m === 'DUO' ? 1 : 3));
      const pool =
        m === 'CARRE'
          ? [question.answer, ...question.distractors]
          : [question.answer, question.distractors[0] ?? question.options.find((o) => o !== question.answer)!];
      setOptions(seededShuffle(pool, rng));
    }
    setMode(m);
  };

  const resolve = (correct: boolean, pickedCca3: string | null, yourAnswer?: string) => {
    if (!question || feedback) return;
    const points = correct ? MODE_POINTS[mode ?? 'DUO'] : 0;
    if (correct) {
      setScore((s) => s + points);
      setCorrectCount((n) => n + 1);
    }
    setGrid((g) => g + (correct ? '🟩' : '🟥'));
    setHistory((h) => [...h, { correct, points, yourAnswer }]);
    setPicked(pickedCca3);
    Haptics.notificationAsync(
      correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    ).catch(() => {});
    announce(
      correct
        ? tr(language, 'Bonne réponse, +{0}', 'Correct, +{0}', [points])
        : tr(language, 'Mauvaise réponse. {0}', 'Wrong. {0}', [correctName]),
    );
    setFeedback({ correct, points, answer: correctName });
    // The borders appear only now, around the point.
    webViewRef.current?.injectJavaScript(
      `window.showResult('${question.answer}',${pickedCca3 ? `'${pickedCca3}'` : 'null'});true;`,
    );
  };

  const submitCash = () => {
    if (!question || !cashInput.trim()) return;
    resolve(
      isAnswerClose(cashInput, correctName, pinpointAcceptedAnswers(question.answer)),
      null,
      cashInput.trim(),
    );
  };

  const finishRun = (finalScore: number, finalGrid: string) => {
    if (isOnline) {
      if (!awardedRef.current) {
        awardedRef.current = true;
        onRoundComplete!(
          normalizeRoundScore('pinpoint', finalScore, {
            numQuestions: run.length,
            maxPointsPerQuestion: MAX_POINTS_PER_QUESTION,
          }),
        );
      }
      return;
    }
    setGameOver(true);
    announce(
      tr(language, 'Partie terminée. Score {0}.', 'Game over. Score {0}.', [finalScore]),
    );
    if (isDaily) {
      onDailyComplete?.(finalScore, finalGrid);
      return;
    }
    // Solo: save the score + award coins.
    track('game_completed', {
      mode: 'pinpoint',
      score: finalScore,
      correct: correctCount,
      scope: scope ?? 'world',
    });
    // Feed the "mes erreurs" pool from the run's countries and outcomes.
    void recordRun(
      'pinpoint',
      run.map((q, i) => ({
        cca3: q.answer,
        prompt: pinpointCountryName(q.answer, language),
        correctAnswer: pinpointCountryName(q.answer, language),
        ok: !!history[i]?.correct,
      })),
    );
    if (user) {
      void saveSoloScore(user, 'pinpoint', finalScore, { scope, review: isReview, training }, () =>
        showAlert(
          tr(language, 'Erreur', 'Error'),
          tr(language, "Impossible d'enregistrer ton score.", 'Could not save your score.'),
        ),
      );
      if (earnsCoins({ training })) awardSoloCoins(
        'pinpoint',
        normalizeRoundScore('pinpoint', finalScore, {
          numQuestions: run.length,
          maxPointsPerQuestion: MAX_POINTS_PER_QUESTION,
        }),
      ).then((res) => {
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
      finishRun(score, grid);
      return;
    }
    setQuestionIndex((i) => i + 1);
    setMode(null);
    setOptions([]);
    setCashInput('');
    setFeedback(null);
    setPicked(null);
  };

  /** Remet la manche à zéro sans toucher au tirage (`run`/`runSeed`). */
  const restartRun = () => {
    setQuestionIndex(0);
    setMode(null);
    setOptions([]);
    setCashInput('');
    setFeedback(null);
    setPicked(null);
    setScore(0);
    setCorrectCount(0);
    setGrid('');
    setHistory([]);
    setGameOver(false);
    setCoinsEarned(null);
    setCoinsCapped(false);
    setCoinsSyncFailed(false);
    awardedRef.current = false;
    // Same first question again: the effect above only fires on index/seed
    // changes, so re-drop the pin by hand.
    if (run[0]) {
      webViewRef.current?.injectJavaScript(
        `window.setPin(${run[0].lat},${run[0].lng},'${run[0].answer}');true;`,
      );
    }
  };

  /** Rejoue exactement les mêmes points, dans le même ordre. */
  const replaySameGame = () => restartRun();

  /** Nouveau tirage. */
  const resetGame = () => {
    const fresh = Math.floor(Math.random() * 2147483647);
    setRunSeed(fresh);
    setRun(buildPinpointRun(fresh, numQuestions, { continent: scope, reviewIds }));
    restartRun();
  };

  if (!question) return null;

  // The globe takes a good slice of the screen but must leave the board room:
  // three difficulty buttons, or four options, or the keyboard.
  const globeHeight = Math.max(220, Math.min(420, Math.round(winH * 0.38)));

  const recapEntries: RecapEntry[] = run.map((q, i) => ({
    cca3: q.answer,
    prompt: tr(language, 'Point n°{0}', 'Point #{0}', [i + 1]),
    yourAnswer: history[i]?.correct ? undefined : history[i]?.yourAnswer,
    correctAnswer: pinpointCountryName(q.answer, language),
    ok: !!history[i]?.correct,
  }));

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
            {tr(language, 'Point sur le Globe', 'Pin on the Globe')}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.statsContainer, { backgroundColor: c.surface, borderColor: c.border }]}>
            <ScoreText style={[styles.statValue, { color: c.accent }]}>
              {questionIndex + 1}/{run.length}
            </ScoreText>
            <View style={{ backgroundColor: c.border, width: 1, height: 20, marginHorizontal: 6 }} />
            <ScoreText style={[styles.statValue, { color: '#2a6e3f' }]}>{score}</ScoreText>
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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView contentContainerStyle={styles.gameArea} keyboardShouldPersistTaps="handled">
        {/* The globe — the mystery point on a map with no borders. */}
        <View
          style={[styles.globeBox, { height: globeHeight, borderColor: c.border, backgroundColor: c.card }]}
          accessible
          accessibilityLabel={tr(language, 'Globe sans frontières avec un point mystère', 'Borderless globe with a mystery point')}
        >
          {globeHtml && !globeError && (
            <GlobeWebView
              ref={webViewRef}
              source={{ html: globeHtml }}
              onMessage={handleMessage}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              style={styles.webview}
              scrollEnabled={false}
            />
          )}
          {(!globeReady || globeError) && (
            <View style={[styles.globeOverlay, { backgroundColor: c.card }]} {...a11yHidden}>
              {globeError ? (
                <Text style={[styles.loadingText, { color: c.textMuted }]}>
                  {tr(language, 'Le globe n’a pas pu se charger.', 'The globe could not load.')}
                </Text>
              ) : (
                <>
                  <ActivityIndicator size="large" color={PALETTE.chartBlue} />
                  <Text style={[styles.loadingText, { color: c.textMuted }]}>
                    {tr(language, 'Chargement du globe…', 'Loading globe…')}
                  </Text>
                </>
              )}
            </View>
          )}
        </View>
        <View style={styles.promptRow}>
          <MapPin color={PALETTE.vermilion} size={16} {...a11yHidden} />
          <Text style={[styles.instruction, { color: c.textMuted }]}>
            {tr(language, 'Dans quel pays est ce point ?', 'Which country is this point in?')}
          </Text>
        </View>

        {/* Mode selection */}
        {!mode && !feedback ? (
          <View style={styles.modeSelection}>
            <TouchableOpacity
              style={[styles.modeBtn, !isDarkMode && styles.modeBtnLight, { borderColor: '#8b1a1a' }]}
              onPress={() => pickMode('DUO')}
              {...a11yButton(tr(language, 'DUO, 1 point', 'DUO, 1 point'), { hint: tr(language, 'Choisir entre deux réponses', 'Choose between two answers') })}
            >
              <HelpCircle color="#8b1a1a" size={24} />
              <Text style={[styles.modeBtnTitle, { color: '#8b1a1a' }]}>DUO</Text>
              <Text style={[styles.modeBtnPoints, { color: c.textMuted }]}>1 PT</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeBtn, !isDarkMode && styles.modeBtnLight, { borderColor: '#4a9eff' }]}
              onPress={() => pickMode('CARRE')}
              {...a11yButton(tr(language, 'CARRÉ, 3 points', 'CARRÉ, 3 points'), { hint: tr(language, 'Choisir entre quatre réponses', 'Choose between four answers') })}
            >
              <Eye color="#4a9eff" size={24} />
              <Text style={[styles.modeBtnTitle, { color: '#4a9eff' }]}>CARRÉ</Text>
              <Text style={[styles.modeBtnPoints, { color: c.textMuted }]}>3 PTS</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeBtn, !isDarkMode && styles.modeBtnLight, { borderColor: '#2a6e3f' }]}
              onPress={() => pickMode('CASH')}
              {...a11yButton(tr(language, 'CASH, 5 points', 'CASH, 5 points'), { hint: tr(language, 'Saisir la réponse', 'Type the answer') })}
            >
              <CheckCircle color="#2a6e3f" size={24} />
              <Text style={[styles.modeBtnTitle, { color: '#2a6e3f' }]}>CASH</Text>
              <Text style={[styles.modeBtnPoints, { color: c.textMuted }]}>5 PTS</Text>
            </TouchableOpacity>
          </View>
        ) : mode === 'CASH' && !feedback ? (
          <View style={styles.cashContainer}>
            <TouchableOpacity
              style={{ alignSelf: 'flex-start', marginBottom: 10, flexDirection: 'row', alignItems: 'center' }}
              onPress={() => setMode(null)}
              hitSlop={ICON_HIT_SLOP}
              {...a11yButton(tr(language, 'Retour', 'Back'))}
            >
              <Text style={{ color: '#4a9eff', fontWeight: 'bold' }}>← {tr(language, 'RETOUR', 'BACK')}</Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.cashInput, !isDarkMode && styles.cashInputLight]}
              placeholder={tr(language, 'Réponse...', 'Answer...')}
              placeholderTextColor={c.textFaint}
              value={cashInput}
              onChangeText={setCashInput}
              autoFocus
              autoCorrect={false}
              autoCapitalize="words"
              onSubmitEditing={submitCash}
            />
            <TouchableOpacity
              style={styles.cashSubmitBtn}
              onPress={submitCash}
              {...a11yButton(tr(language, 'Valider', 'Submit'))}
            >
              <Text style={styles.cashSubmitText}>{tr(language, 'VALIDER', 'SUBMIT')}</Text>
            </TouchableOpacity>
          </View>
        ) : (mode === 'DUO' || mode === 'CARRE') && !feedback ? (
          <View style={styles.optionsGrid}>
            {options.map((cca3) => (
              <TouchableOpacity
                key={cca3}
                style={[styles.optionBtn, !isDarkMode && styles.optionBtnLight]}
                onPress={() =>
                  resolve(cca3 === question.answer, cca3, pinpointCountryName(cca3, language))
                }
                {...a11yButton(pinpointCountryName(cca3, language))}
              >
                <Text style={[styles.optionText, { color: c.text }]}>
                  {pinpointCountryName(cca3, language)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          feedback && (
            <View style={[styles.feedbackCard, feedback.correct ? styles.correctCard : styles.wrongCard]}>
              <View style={{ marginBottom: 10 }} {...a11yImage(feedback.correct ? tr(language, 'Bonne réponse', 'Correct') : tr(language, 'Mauvaise réponse', 'Wrong'))}>
                {feedback.correct ? <AtlasTrophy color="#2a6e3f" size={40} /> : <AtlasCross color="#8b1a1a" size={40} />}
              </View>
              <Text style={[styles.feedbackTitle, { color: c.text }]}>
                {feedback.correct ? tr(language, 'BIEN JOUÉ !', 'WELL DONE!') : tr(language, 'DOMMAGE...', 'TOO BAD...')}
              </Text>
              <Text style={[styles.feedbackSub, { color: c.text }]}>
                {feedback.correct
                  ? `+${feedback.points} ${tr(language, 'point(s)', 'point(s)')}`
                  : tr(language, 'La réponse était : {0}', 'The answer was: {0}', [feedback.answer])}
              </Text>
              {/* Entraînement: the reveal is the lesson, so the country's facts
                  are one tap away instead of waiting for the end-of-run recap. */}
              {training && question && (
                <TouchableOpacity
                  style={[styles.learnBtn, { borderColor: c.accent }]}
                  onPress={() => setFactsFor(question.answer)}
                  {...a11yButton(
                    tr(language, 'En savoir plus sur ce pays', 'Learn more about this country'),
                  )}
                >
                  <Text style={[styles.learnBtnText, { color: c.accent }]}>
                    {tr(language, 'En savoir plus', 'Learn more')}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.nextBtn, { backgroundColor: c.accentStrong }]}
                onPress={next}
                {...a11yButton(questionIndex + 1 >= run.length ? tr(language, 'Voir le score', 'See score') : tr(language, 'Suivant', 'Next'))}
              >
                <Text style={styles.nextBtnText}>
                  {questionIndex + 1 >= run.length ? tr(language, 'Voir le score', 'See score') : tr(language, 'Suivant', 'Next')}
                </Text>
                <ChevronRight color="#fff" size={20} />
              </TouchableOpacity>
            </View>
          )
        )}
      </ScrollView>

      {/* End-of-run summary — sits BELOW the header so Home/theme stay reachable. */}
      {gameOver && !matchData && (
        <View
          style={[
            styles.gameOverOverlay,
            { backgroundColor: isDarkMode ? 'rgba(10,22,40,0.96)' : 'rgba(242,232,208,0.97)' },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.gameOverContent}
            showsVerticalScrollIndicator={false}
          >
            <EndGlobe
              config={myGlobe}
              size={100}
              accent="#2a6e3f"
              animate
              style={{ marginBottom: 10 }}
              record={isDaily || isOnline ? undefined : { mode: 'pinpoint', score, ctx: { scope, review: isReview, training } }}
            />
            <Reveal at={END_CHOREO.verdict}>
            <ResultGrid grid={grid} style={{ marginBottom: 10 }} />
            <ScoreText style={[styles.gameOverScore, { color: c.text }]}>{score}</ScoreText>
            <Text style={{ color: c.textMuted, fontFamily: FONTS.mono, fontSize: 14, marginBottom: 16, textAlign: 'center' }}>
              {tr(language, '{0} / {1} bonnes réponses', '{0} / {1} correct', [correctCount, run.length])}
            </Text>

            {!isDaily && !isOnline && <OffLeaderboardNotice run={{ scope, review: isReview, training }} color={c.textMuted} />}
            </Reveal>

            {/* Pièces + doubleur pub AVANT le récap : c'est la récompense, elle
                ne doit pas se mériter au scroll. */}
            <Reveal at={END_CHOREO.detail}>
            <SoloCoinReward
              coinsEarned={coinsEarned}
              coinsCapped={coinsCapped}
              coinsSyncFailed={coinsSyncFailed}
              containerStyle={{ alignSelf: 'stretch', marginBottom: 12 }}
            />
            </Reveal>

            {/* Recap: every point of the run with its country and outcome. */}
            <Reveal at={END_CHOREO.reward}>
            <View style={{ alignSelf: 'stretch', marginBottom: 16 }}>
              <RunRecap entries={recapEntries} />
            </View>
            </Reveal>

            <Reveal at={END_CHOREO.actions}>
            {!user && !isDaily && (
              <Text style={{ color: c.textMuted, fontFamily: FONTS.mono, fontSize: 12, textAlign: 'center', marginBottom: 12 }}>
                {tr(
                  language,
                  'Connecte-toi pour gagner des pièces et sauvegarder ton score.',
                  'Sign in to earn coins and save your score.',
                )}
              </Text>
            )}

            <SoloEndActions
              onShare={isDaily ? onShare : undefined}
              onReplaySame={isDaily ? undefined : replaySameGame}
              onNewGame={isDaily ? undefined : resetGame}
              onMenu={() => setGameMode('menu')}
            />
            </Reveal>
          </ScrollView>
        </View>
      )}
      </KeyboardAvoidingView>

      {/* Mounted once at the top level so it opens from a training reveal. */}
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

  // Board — mirrors SilhouetteGame / ChallengeQuiz so the quizzes match.
  gameArea: { padding: 16, alignItems: 'center', paddingBottom: 40 },
  globeBox: {
    width: '100%',
    maxWidth: 600,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  webview: { flex: 1, backgroundColor: 'transparent' },
  globeOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: { fontFamily: FONTS.mono, fontSize: 13 },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    marginBottom: 16,
  },
  instruction: { fontSize: 14, fontFamily: FONTS.mono, textAlign: 'center' },

  modeSelection: { flexDirection: 'row', gap: 10, width: '100%', maxWidth: 500, justifyContent: 'center' },
  modeBtn: { flex: 1, backgroundColor: '#132040', padding: 15, borderRadius: 16, alignItems: 'center', borderWidth: 2 },
  modeBtnLight: { backgroundColor: '#e8d9b8', borderColor: '#c4a87a' },
  modeBtnTitle: { fontSize: 14, fontFamily: FONTS.monoBold, marginTop: 8 },
  modeBtnPoints: { fontSize: 10, color: '#4a6a88', fontFamily: FONTS.mono },

  optionsGrid: { gap: 12, width: '100%', maxWidth: 500 },
  optionBtn: { backgroundColor: '#132040', padding: 18, borderRadius: 16, alignItems: 'center', borderWidth: 2, borderColor: '#2d4a70' },
  optionBtnLight: { backgroundColor: '#e8d9b8', borderColor: '#c4a87a', elevation: 2 },
  optionText: { color: '#d8e8f4', fontSize: 18, fontFamily: FONTS.heading },

  cashContainer: { width: '100%', maxWidth: 500, gap: 12 },
  cashInput: {
    backgroundColor: '#132040', color: '#d8e8f4', padding: 20, borderRadius: 16, fontSize: 18,
    fontFamily: FONTS.monoBold, textAlign: 'center', borderWidth: 2, borderColor: '#2d4a70',
  },
  cashInputLight: { backgroundColor: '#e8d9b8', color: '#2c1810', borderColor: '#c4a87a' },
  cashSubmitBtn: { backgroundColor: '#2a6e3f', padding: 18, borderRadius: 16, alignItems: 'center' },
  cashSubmitText: { color: '#fff', fontFamily: FONTS.monoBold, fontSize: 16 },

  feedbackCard: { padding: 24, borderRadius: 24, alignItems: 'center', width: '100%', maxWidth: 500 },
  correctCard: { backgroundColor: 'rgba(42, 110, 63, 0.15)', borderWidth: 2, borderColor: '#2a6e3f' },
  wrongCard: { backgroundColor: 'rgba(139, 26, 26, 0.15)', borderWidth: 2, borderColor: '#8b1a1a' },
  feedbackTitle: { fontSize: 24, fontFamily: FONTS.headingBlack, color: '#d8e8f4', marginBottom: 5 },
  feedbackSub: { fontSize: 16, color: '#7aa0c4', textAlign: 'center', fontFamily: FONTS.mono },
  learnBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 14,
    marginBottom: 10,
    marginTop: 8,
  },
  learnBtnText: { fontFamily: FONTS.monoBold, fontSize: 11.5 },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 14, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, alignSelf: 'stretch',
  },
  nextBtnText: { color: '#fff', fontFamily: FONTS.monoBold, fontSize: 16 },

  gameOverOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
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
  gameOverScore: { fontSize: 48, fontFamily: FONTS.headingBlack, marginBottom: 4, color: '#2a6e3f', textAlign: 'center' },
});
