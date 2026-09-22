/**
 * « Langues » — guess which language a phrase is written in (or, in the audio
 * variant, spoken in), played on the SAME CARRÉ / DUO / CASH board as
 * Silhouette / ChallengeQuiz: DUO = 2 options / 1 pt, CARRÉ = 4 options / 3 pts,
 * CASH = type the language / 5 pts.
 *
 * Questions come from src/lib/languages.ts and are fully seeded, so a daily
 * puzzle and both sides of an online match see the same phrases AND the same
 * option grids. Note the grids are read straight off the run rather than being
 * re-shuffled when the player taps a difficulty — two clients must agree even
 * if they pick DUO and CARRÉ in a different order.
 *
 * Mirrors SilhouetteGame's solo / daily / match wiring.
 */
import { showAlert } from '../lib/alert';
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { playSfx } from '../lib/sfx';
import {
  Moon, Sun, Home, HelpCircle, Eye, CheckCircle, ChevronRight,
} from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';

import {
  buildLanguageRun, buildLanguageSeries, matchesLanguageAnswer,
  LANGUAGES_QUESTIONS_SOLO, type LanguageQuestion,
} from '../lib/languages';
import {
  getLanguageDef, languageName,
  type LanguageVariant, type LanguageTier,
} from '../data/languages';
import { normalizeRoundScore } from '../lib/score';
import { track } from '../lib/analytics';
import { saveSoloScore } from '../lib/soloResult';
import { awardSoloCoins } from '../lib/coins';
import { useToast } from '../components/ToastProvider';
import type { GameMode, Match } from '../types';
import { getColors } from '../theme/colors';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton, a11yImage, announce, ICON_HIT_SLOP } from '../lib/a11y';
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
import PhrasePlayer from '../components/PhrasePlayer';
import { prefetchPhrases } from '../lib/languageAudio';

import { isMobileLayout as isMobile } from '../lib/layout';

type QuizMode = 'DUO' | 'CARRE' | 'CASH';
type Feedback = { correct: boolean; points: number; answer: string };
const MODE_POINTS: Record<QuizMode, number> = { DUO: 1, CARRE: 3, CASH: 5 };
/** Ceiling per question, so match normalization matches the other quizzes. */
const MAX_POINTS_PER_QUESTION = 5;

/** Right-to-left scripts — the prompt card has to flip for them. */
const RTL_SCRIPTS = new Set(['arabic', 'hebrew']);

interface LanguagesGameProps {
  setGameMode: (mode: GameMode) => void;
  user: User | null;
  /** Which variant to play. Solo picks it in LanguagesFlow; elsewhere the seed does. */
  variant?: LanguageVariant;
  matchData?: Match | null;
  onRoundComplete?: (score: number) => void;
  /** Story mode: hide languages above this tier. */
  maxTier?: LanguageTier;
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
}

export default function LanguagesGame({
  setGameMode,
  user,
  variant = 'text',
  matchData,
  onRoundComplete,
  maxTier,
  dailySeed,
  onDailyComplete,
  isDaily,
  onShare,
  onDailyScoreChange,
}: LanguagesGameProps) {
  const { isDarkMode, setIsDarkMode } = useTheme();
  const { language, openLanguagePicker } = useLanguage();
  const toast = useToast();
  const c = getColors(isDarkMode);

  const currentRound = matchData?.current_round ?? 1;
  const numQuestions =
    (matchData?.game_data?.rounds?.[currentRound - 1]?.count as number | undefined) ??
    (matchData?.game_data?.roundsPerSet as number | undefined) ??
    (matchData ? 5 : LANGUAGES_QUESTIONS_SOLO);

  const isOnline = !!matchData && !!onRoundComplete;

  const [runSeed, setRunSeed] = useState(
    () =>
      dailySeed ??
      (matchData?.game_data?.seed as number | undefined) ??
      Math.floor(Math.random() * 2147483647),
  );

  /**
   * Online rounds are sliced out of ONE series computed from the match seed, so
   * no language repeats across the whole best-of — per-round seeding would
   * collide constantly in a 31-language pool. Solo and daily just build a run.
   */
  const run = useMemo<LanguageQuestion[]>(() => {
    const opts = { maxTier, hard: !!matchData?.is_ranked };
    if (!matchData) return buildLanguageRun(runSeed, numQuestions, variant, opts);
    const counts = Array(Math.max(matchData.best_of ?? 1, currentRound)).fill(numQuestions);
    return buildLanguageSeries(runSeed, counts, variant, opts)[currentRound - 1] ?? [];
  }, [runSeed, numQuestions, variant, maxTier, matchData, currentRound]);

  const [questionIndex, setQuestionIndex] = useState(0);
  const [mode, setMode] = useState<QuizMode | null>(null);
  const [cashInput, setCashInput] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  /** '🟩'/'🟥' per answered question — the daily share grid. */
  const [grid, setGrid] = useState('');
  /** Per-question outcome, in run order — drives the end-of-run recap. */
  const [history, setHistory] = useState<{ correct: boolean; points: number }[]>([]);
  const [gameOver, setGameOver] = useState(false);
  /**
   * Phrase ids whose clip could not be played. Those questions fall back to the
   * written phrase, keeping the round playable. The fallback is LOCAL only — the
   * seed, the options and the score are untouched, so an online opponent whose
   * audio works stays perfectly in sync.
   */
  const [audioFailed, setAudioFailed] = useState<Set<string>>(() => new Set());
  const [coinsEarned, setCoinsEarned] = useState<number | null>(null);
  const [coinsCapped, setCoinsCapped] = useState(false);
  const [coinsSyncFailed, setCoinsSyncFailed] = useState(false);
  const { config: myGlobe } = useMyGameGlobe();
  const awardedRef = useRef(false);

  // Surface the running raw score so the daily host can lock it in on a quit.
  useEffect(() => {
    if (isDaily) onDailyScoreChange?.(score);
  }, [isDaily, score, onDailyScoreChange]);

  useEffect(() => {
    if (!matchData && !isDaily) track('game_started', { mode: 'languages', variant });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warm the clips for the whole run up front. Only the round's ~10 files, never
  // the catalogue: a round is ~250 KB, the catalogue is ~8 MB.
  useEffect(() => {
    if (variant !== 'audio') return;
    prefetchPhrases(run.map((q) => ({ code: q.answer, phrase: q.phrase })));
  }, [variant, run]);

  const question = run[questionIndex] ?? null;
  const answerDef = question ? getLanguageDef(question.answer) : undefined;
  const correctName = question ? languageName(question.answer, language) : '';
  const options = question ? (mode === 'CARRE' ? question.carre : question.duo) : [];
  const isRtl = !!answerDef && RTL_SCRIPTS.has(answerDef.script);

  const pickMode = (m: QuizMode) => {
    if (!question) return;
    Haptics.selectionAsync().catch(() => {});
    playSfx('tap');
    if (m === 'CASH') setCashInput('');
    setMode(m);
  };

  const resolve = (correct: boolean) => {
    if (!question || feedback) return;
    const points = correct ? MODE_POINTS[mode ?? 'DUO'] : 0;
    if (correct) {
      setScore((s) => s + points);
      setCorrectCount((n) => n + 1);
    }
    setGrid((g) => g + (correct ? '🟩' : '🟥'));
    setHistory((h) => [...h, { correct, points }]);
    Haptics.notificationAsync(
      correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    ).catch(() => {});
    playSfx(correct ? 'correct' : 'wrong');
    announce(
      correct
        ? tr(language, 'Bonne réponse, +{0}', 'Correct, +{0}', [points])
        : tr(language, 'Mauvaise réponse. {0}', 'Wrong. {0}', [correctName]),
    );
    setFeedback({ correct, points, answer: correctName });
  };

  const submitCash = () => {
    if (!question || !cashInput.trim()) return;
    resolve(matchesLanguageAnswer(cashInput, question.answer));
  };

  const finishRun = (finalScore: number, finalGrid: string) => {
    if (isOnline) {
      if (!awardedRef.current) {
        awardedRef.current = true;
        onRoundComplete!(
          normalizeRoundScore('languages', finalScore, {
            numQuestions: run.length,
            maxPointsPerQuestion: MAX_POINTS_PER_QUESTION,
          }),
        );
      }
      return;
    }
    setGameOver(true);
    announce(tr(language, 'Partie terminée. Score {0}.', 'Game over. Score {0}.', [finalScore]));
    if (isDaily) {
      onDailyComplete?.(finalScore, finalGrid);
      return;
    }
    // Solo: save the score + award coins.
    track('game_completed', { mode: 'languages', variant, score: finalScore, correct: correctCount });
    if (user) {
      // Route through saveSoloScore rather than inserting here: it is the one
      // place that decides whether a run counts for the leaderboard (scope /
      // training / review). Inserting directly bypassed that rule.
      void saveSoloScore(user, 'languages', finalScore, {}, () =>
        showAlert(
          tr(language, 'Erreur', 'Error'),
          tr(language, "Impossible d'enregistrer ton score.", 'Could not save your score.'),
        ),
      );
      awardSoloCoins(
        'languages',
        normalizeRoundScore('languages', finalScore, {
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
    setCashInput('');
    setFeedback(null);
  };

  /** Remet la manche à zéro sans toucher au tirage (`runSeed`). */
  const restartRun = () => {
    setQuestionIndex(0);
    setMode(null);
    setCashInput('');
    setFeedback(null);
    setScore(0);
    setCorrectCount(0);
    setGrid('');
    setHistory([]);
    setGameOver(false);
    setCoinsEarned(null);
    setCoinsCapped(false);
    setCoinsSyncFailed(false);
    awardedRef.current = false;
  };

  /** Rejoue exactement les mêmes phrases, dans le même ordre. */
  const replaySameGame = () => restartRun();

  /** Nouveau tirage. */
  const resetGame = () => {
    setRunSeed(Math.floor(Math.random() * 2147483647));
    restartRun();
  };

  if (!question) return null;

  // Longer phrases need to shrink to stay on one card without scrolling.
  const phraseSize = question.phrase.text.length > 60 ? 20 : question.phrase.text.length > 38 ? 24 : 28;
  /** Audio variant, clip still healthy → hide the text and show the player. */
  const listenOnly = variant === 'audio' && !audioFailed.has(question.phrase.id);

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
          <Text style={[styles.title, { color: c.text }]}>{tr(language, 'Langues', 'Languages')}</Text>
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
        <Text style={[styles.turnIndicator, { color: c.accent }]}>
          {`Question ${questionIndex + 1}/${run.length}`}
        </Text>

        {/* Prompt card — the mystery phrase. */}
        <View
          style={[styles.card, !isDarkMode && styles.cardLight]}
          accessible={!listenOnly}
          accessibilityLabel={tr(language, 'Phrase à identifier', 'Phrase to identify')}
        >
          {listenOnly ? (
            <PhrasePlayer
              code={question.answer}
              phrase={question.phrase}
              language={language}
              accent={c.accent}
              textColor={isDarkMode ? '#d8e8f4' : '#2c1810'}
              mutedColor="#4a6a88"
              onUnavailable={() => {
                track('language_audio_fallback', { code: question.answer, phrase: question.phrase.id });
                setAudioFailed((s) => new Set(s).add(question.phrase.id));
              }}
            />
          ) : (
            <Text
              style={[
                styles.phrase,
                {
                  color: isDarkMode ? '#d8e8f4' : '#2c1810',
                  fontSize: phraseSize,
                  writingDirection: isRtl ? 'rtl' : 'ltr',
                },
              ]}
              maxFontSizeMultiplier={1.3}
            >
              {question.phrase.text}
            </Text>
          )}
          <Text style={[styles.instruction, { color: c.textMuted }]}>
            {variant === 'audio' && !listenOnly
              ? tr(language, 'Extrait indisponible — quelle est cette langue ?', 'Clip unavailable — which language is this?')
              : tr(language, 'Quelle est cette langue ?', 'Which language is this?')}
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
              placeholder={tr(language, 'Nom de la langue...', 'Language name...')}
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
            {options.map((code) => (
              <TouchableOpacity
                key={code}
                style={[styles.optionBtn, !isDarkMode && styles.optionBtnLight]}
                onPress={() => resolve(code === question.answer)}
                {...a11yButton(languageName(code, language))}
              >
                <Text style={[styles.optionText, { color: c.text }]}>
                  {languageName(code, language)}
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
              {/* The reveal is the teaching moment: name the language in itself. */}
              <Text style={[styles.feedbackSub, { color: c.text }]}>
                {feedback.correct
                  ? `+${feedback.points} ${tr(language, 'point(s)', 'point(s)')}`
                  : tr(language, 'La réponse était : {0}', 'The answer was: {0}', [feedback.answer])}
              </Text>
              {answerDef && (
                <Text style={[styles.endonym, { color: c.textMuted }]}>{answerDef.endonym}</Text>
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
              record={isDaily || isOnline ? undefined : { mode: 'languages', score }}
            />
            <Reveal at={END_CHOREO.verdict}>
            <ResultGrid grid={grid} style={{ marginBottom: 10 }} />
            <ScoreText style={[styles.gameOverScore, { color: c.text }]}>{score}</ScoreText>
            <Text style={{ color: c.textMuted, fontFamily: FONTS.mono, fontSize: 14, marginBottom: 16, textAlign: 'center' }}>
              {tr(language, '{0} / {1} bonnes réponses', '{0} / {1} correct', [correctCount, run.length])}
            </Text>
            </Reveal>

            {/* Pièces + doubleur pub AVANT le récap : la récompense d'abord,
                la solution juste après. */}
            {/* Animated coins + rewarded-ad doubler (solo only, server-credited). */}
            <Reveal at={END_CHOREO.detail}>
            <SoloCoinReward
              coinsEarned={coinsEarned}
              coinsCapped={coinsCapped}
              coinsSyncFailed={coinsSyncFailed}
              containerStyle={{ alignSelf: 'stretch', marginBottom: 12 }}
            />
            </Reveal>

            {/* Recap: every phrase of the run with its language and outcome. */}
            <Reveal at={END_CHOREO.reward}>
            <View style={[styles.recapCard, { backgroundColor: c.card, borderColor: c.border }]}>
              {run.map((q, i) => {
                const h = history[i];
                const name = languageName(q.answer, language);
                return (
                  <View
                    key={q.phrase.id}
                    style={[styles.recapRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}
                    accessible
                    accessibilityLabel={
                      h?.correct
                        ? tr(language, '{0}, bonne réponse, +{1} points', '{0}, correct, +{1} points', [name, h.points])
                        : tr(language, '{0}, mauvaise réponse', '{0}, wrong', [name])
                    }
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.recapName, { color: c.text }]} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={[styles.recapPhrase, { color: c.textMuted }]} numberOfLines={1}>
                        {q.phrase.text}
                      </Text>
                    </View>
                    {h?.correct ? (
                      <ScoreText style={{ color: '#2a6e3f', fontSize: 14, fontFamily: FONTS.monoBold }}>
                        {`+${h.points}`}
                      </ScoreText>
                    ) : (
                      <AtlasCross color="#8b1a1a" size={16} />
                    )}
                  </View>
                );
              })}
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
              share={{ mode: 'languages', summary: `${correctCount}/${run.length}` }}
              onMenu={() => setGameMode('menu')}
            />
            </Reveal>
          </ScrollView>
        </View>
      )}
      </KeyboardAvoidingView>
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
  title: { fontSize: isMobile ? 16 : 18, fontFamily: FONTS.headingBlack },
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

  // Board — mirrors ChallengeQuiz / SilhouetteGame so the quizzes match.
  gameArea: { padding: 20, alignItems: 'center', paddingBottom: 40 },
  turnIndicator: { fontSize: 18, fontFamily: FONTS.headingBlack, marginBottom: 20, textTransform: 'uppercase' },
  card: {
    backgroundColor: '#132040', padding: 24, borderRadius: 24, alignItems: 'center',
    marginBottom: 30, width: '100%', maxWidth: 600, borderWidth: 1, borderColor: '#2d4a70',
  },
  cardLight: { backgroundColor: '#e8d9b8', borderColor: '#c4a87a', elevation: 4, shadowOpacity: 0.1 },
  /**
   * NO custom fontFamily here, on purpose. The app's display fonts (Playfair
   * Display) only ship Latin glyphs, so a Japanese, Arabic, Thai or Tamil phrase
   * would render as tofu (▯▯▯). The system font is the only one that covers
   * every script this mode plays.
   */
  phrase: { textAlign: 'center', lineHeight: 38, fontWeight: '600' },
  instruction: { color: '#4a6a88', fontSize: 14, fontFamily: FONTS.mono, marginTop: 14, textAlign: 'center' },

  modeSelection: { flexDirection: 'row', gap: 10, width: '100%', maxWidth: 500, justifyContent: 'center' },
  modeBtn: { flex: 1, backgroundColor: '#132040', padding: 15, borderRadius: 16, alignItems: 'center', borderWidth: 2 },
  modeBtnLight: { backgroundColor: '#e8d9b8', borderColor: '#c4a87a' },
  modeBtnTitle: { fontSize: 14, fontFamily: FONTS.monoBold, marginTop: 8 },
  modeBtnPoints: { fontSize: 10, color: '#4a6a88', fontFamily: FONTS.mono },

  optionsGrid: { gap: 12, width: '100%', maxWidth: 500 },
  optionBtn: { backgroundColor: '#132040', padding: 20, borderRadius: 16, alignItems: 'center', borderWidth: 2, borderColor: '#2d4a70' },
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

  feedbackCard: { padding: 30, borderRadius: 24, alignItems: 'center', width: '100%', maxWidth: 500 },
  correctCard: { backgroundColor: 'rgba(42, 110, 63, 0.15)', borderWidth: 2, borderColor: '#2a6e3f' },
  wrongCard: { backgroundColor: 'rgba(139, 26, 26, 0.15)', borderWidth: 2, borderColor: '#8b1a1a' },
  feedbackTitle: { fontSize: 24, fontFamily: FONTS.headingBlack, color: '#d8e8f4', marginBottom: 5 },
  feedbackSub: { fontSize: 16, color: '#7aa0c4', textAlign: 'center', fontFamily: FONTS.mono },
  // System font again: the endonym is written in the language's own script.
  endonym: { fontSize: 18, marginTop: 8, textAlign: 'center' },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 18, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, alignSelf: 'stretch',
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
  gameOverScore: { fontSize: 48, fontFamily: FONTS.headingBlack, marginBottom: 4, color: '#2a6e3f', textAlign: 'center' },
  recapCard: {
    alignSelf: 'stretch',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  recapRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  recapName: { fontSize: 15, fontFamily: FONTS.heading },
  // System font: the recap echoes the phrase in its original script.
  recapPhrase: { fontSize: 12, marginTop: 2 },
  resetBtn: {
    backgroundColor: '#c04a1a',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#a03a10',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resetBtnText: { color: '#fff', fontFamily: FONTS.monoBold, fontSize: 14, letterSpacing: 1 },
  menuBtn: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuBtnText: { fontFamily: FONTS.monoBold, fontSize: 14, letterSpacing: 1 },
});
