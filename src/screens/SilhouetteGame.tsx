/**
 * « Silhouette » — a country's filled outline played on the SAME CARRÉ / DUO /
 * CASH board as the country↔capital game (VersusCapitals / ChallengeQuiz): pick
 * a difficulty (DUO = 2 options / 1 pt, CARRÉ = 4 options / 3 pts, CASH = type the
 * name / 5 pts), answer, see feedback. Shapes and questions are seeded
 * (src/lib/silhouette.ts) so daily and online rounds are identical for everyone
 * sharing the seed. Scoring is the unified points model (raw 0..N*5, same scale
 * as the challenge quiz), normalized to 0..1000 for matches.
 * Mirrors HigherLowerGame's solo / daily / match wiring.
 */
import { useState, useEffect, useRef } from 'react';
import {
  Alert,
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
import Svg, { Path } from 'react-native-svg';
import {
  RefreshCcw, Moon, Sun, Home, Share2, Coins, HelpCircle, Eye, CheckCircle, ChevronRight,
} from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';

import {
  buildSilhouetteRun,
  silhouetteCountryName,
  silhouetteAcceptedAnswers,
  silhouettePath,
  type SilhouetteQuestion,
} from '../lib/silhouette';
import { isAnswerClose } from '../lib/answerMatch';
import { createSeededRng, seededShuffle } from '../lib/rng';
import { normalizeRoundScore } from '../lib/score';
import { track } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { log } from '../lib/log';
import { awardSoloCoins } from '../lib/coins';
import { useToast } from '../components/ToastProvider';
import type { GameMode, Match } from '../types';
import { getColors } from '../theme/colors';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton, a11yImage, announce, a11yHidden, ICON_HIT_SLOP } from '../lib/a11y';
import { ScoreText } from '../components/ScoreText';
import { AtlasTrophy, AtlasCross } from '../components/AtlasIcons';
import { RewardedAdButton } from '../components/RewardedAdButton';
import { TopInsetBar } from '../components/TopInsetBar';

import { isMobileLayout as isMobile } from '../lib/layout';

type QuizMode = 'DUO' | 'CARRE' | 'CASH';
type Feedback = { correct: boolean; points: number; answer: string };
const MODE_POINTS: Record<QuizMode, number> = { DUO: 1, CARRE: 3, CASH: 5 };
/** Ceiling per question, so match normalization matches the challenge quiz. */
const MAX_POINTS_PER_QUESTION = 5;

interface SilhouetteGameProps {
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
}

export default function SilhouetteGame({
  setGameMode,
  user,
  matchData,
  onRoundComplete,
  dailySeed,
  onDailyComplete,
  isDaily,
  onShare,
  onDailyScoreChange,
}: SilhouetteGameProps) {
  const { isDarkMode, setIsDarkMode } = useTheme();
  const { language, setLanguage } = useLanguage();
  const toast = useToast();
  const c = getColors(isDarkMode);

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
  const [run, setRun] = useState<SilhouetteQuestion[]>(() =>
    buildSilhouetteRun(seed, numQuestions),
  );
  const [runSeed, setRunSeed] = useState(seed);

  const [questionIndex, setQuestionIndex] = useState(0);
  const [mode, setMode] = useState<QuizMode | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [cashInput, setCashInput] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  /** '🟩'/'🟥' per answered question — the daily share grid. */
  const [grid, setGrid] = useState('');
  const [gameOver, setGameOver] = useState(false);
  const [coinsEarned, setCoinsEarned] = useState<number | null>(null);
  const [coinsCapped, setCoinsCapped] = useState(false);
  const [coinsSyncFailed, setCoinsSyncFailed] = useState(false);
  const awardedRef = useRef(false);

  // Surface the running raw score so the daily host can lock it in on a quit.
  useEffect(() => {
    if (isDaily) onDailyScoreChange?.(score);
  }, [isDaily, score, onDailyScoreChange]);

  useEffect(() => {
    if (!matchData && !isDaily) track('game_started', { mode: 'silhouette' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const question = run[questionIndex] ?? null;
  const correctName = question ? silhouetteCountryName(question.answer, language) : '';

  const pickMode = (m: QuizMode) => {
    if (!question) return;
    Haptics.selectionAsync().catch(() => {});
    if (m === 'CASH') {
      setCashInput('');
    } else {
      // CARRÉ reuses the run's 4 seeded options; DUO keeps the answer + one of
      // them. Re-shuffled deterministically so both online players match.
      const rng = createSeededRng(runSeed + questionIndex * 131 + (m === 'DUO' ? 1 : 3));
      const pool =
        m === 'CARRE'
          ? question.options
          : [question.answer, question.options.find((o) => o !== question.answer)!];
      setOptions(seededShuffle(pool, rng));
    }
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
    Haptics.notificationAsync(
      correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    ).catch(() => {});
    announce(
      correct
        ? tr(language, `Bonne réponse, +${points}`, `Correct, +${points}`)
        : tr(language, `Mauvaise réponse. ${correctName}`, `Wrong. ${correctName}`),
    );
    setFeedback({ correct, points, answer: correctName });
  };

  const submitCash = () => {
    if (!question || !cashInput.trim()) return;
    resolve(isAnswerClose(cashInput, correctName, silhouetteAcceptedAnswers(question.answer)));
  };

  const finishRun = (finalScore: number, finalGrid: string) => {
    if (isOnline) {
      if (!awardedRef.current) {
        awardedRef.current = true;
        onRoundComplete!(
          normalizeRoundScore('silhouette', finalScore, {
            numQuestions: run.length,
            maxPointsPerQuestion: MAX_POINTS_PER_QUESTION,
          }),
        );
      }
      return;
    }
    setGameOver(true);
    if (isDaily) {
      onDailyComplete?.(finalScore, finalGrid);
      return;
    }
    // Solo: save the score + award coins.
    track('game_completed', { mode: 'silhouette', score: finalScore, correct: correctCount });
    if (user) {
      supabase
        .from('scores')
        .insert({ user_id: user.id, game_mode: 'silhouette', score: finalScore })
        .then(({ error }) => {
          if (error) {
            log.error('Error saving silhouette score:', error);
            Alert.alert(
              tr(language, 'Erreur', 'Error'),
              tr(language, "Impossible d'enregistrer ton score.", 'Could not save your score.'),
            );
          }
        });
      awardSoloCoins('silhouette').then((res) => {
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
  };

  const resetGame = () => {
    // A fresh casual run gets a fresh random question set.
    const fresh = Math.floor(Math.random() * 2147483647);
    setRunSeed(fresh);
    setRun(buildSilhouetteRun(fresh, numQuestions));
    setQuestionIndex(0);
    setMode(null);
    setOptions([]);
    setCashInput('');
    setFeedback(null);
    setScore(0);
    setCorrectCount(0);
    setGrid('');
    setGameOver(false);
    setCoinsEarned(null);
    setCoinsCapped(false);
    setCoinsSyncFailed(false);
    awardedRef.current = false;
  };

  if (!question) return null;

  const pathD = silhouettePath(question.answer, 100);

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
          <Text style={[styles.title, { color: c.text }]}>Silhouette</Text>
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
            onPress={() => setLanguage(language === 'fr' ? 'en' : 'fr')}
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

      <ScrollView contentContainerStyle={styles.gameArea} keyboardShouldPersistTaps="handled">
        <Text style={[styles.turnIndicator, { color: c.accent }]}>
          {`Question ${questionIndex + 1}/${run.length}`}
        </Text>

        {/* Prompt card — the mystery silhouette. */}
        <View
          style={[styles.card, !isDarkMode && styles.cardLight]}
          accessible
          accessibilityLabel={tr(language, "Silhouette d'un pays mystère", 'Silhouette of a mystery country')}
        >
          <View style={styles.shapeBox} {...a11yHidden}>
            {pathD && (
              <Svg width="100%" height="100%" viewBox="0 0 100 100">
                <Path d={pathD} fill={c.accent} />
              </Svg>
            )}
          </View>
          <Text style={styles.instruction}>
            {tr(language, 'Quel pays a cette forme ?', 'Which country has this shape?')}
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
              <Text style={styles.modeBtnPoints}>1 PT</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeBtn, !isDarkMode && styles.modeBtnLight, { borderColor: '#4a9eff' }]}
              onPress={() => pickMode('CARRE')}
              {...a11yButton(tr(language, 'CARRÉ, 3 points', 'CARRÉ, 3 points'), { hint: tr(language, 'Choisir entre quatre réponses', 'Choose between four answers') })}
            >
              <Eye color="#4a9eff" size={24} />
              <Text style={[styles.modeBtnTitle, { color: '#4a9eff' }]}>CARRÉ</Text>
              <Text style={styles.modeBtnPoints}>3 PTS</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeBtn, !isDarkMode && styles.modeBtnLight, { borderColor: '#2a6e3f' }]}
              onPress={() => pickMode('CASH')}
              {...a11yButton(tr(language, 'CASH, 5 points', 'CASH, 5 points'), { hint: tr(language, 'Saisir la réponse', 'Type the answer') })}
            >
              <CheckCircle color="#2a6e3f" size={24} />
              <Text style={[styles.modeBtnTitle, { color: '#2a6e3f' }]}>CASH</Text>
              <Text style={styles.modeBtnPoints}>5 PTS</Text>
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
              <Text style={{ color: '#4a9eff', fontWeight: 'bold' }}>← {language === 'fr' ? 'RETOUR' : 'BACK'}</Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.cashInput, !isDarkMode && styles.cashInputLight]}
              placeholder={tr(language, 'Réponse...', 'Answer...')}
              placeholderTextColor="#4a6a88"
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
                onPress={() => resolve(cca3 === question.answer)}
                {...a11yButton(silhouetteCountryName(cca3, language))}
              >
                <Text style={[styles.optionText, { color: c.text }]}>
                  {silhouetteCountryName(cca3, language)}
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
              <Text style={styles.feedbackSub}>
                {feedback.correct
                  ? `+${feedback.points} ${tr(language, 'point(s)', 'point(s)')}`
                  : tr(language, `La réponse était : ${feedback.answer}`, `The answer was: ${feedback.answer}`)}
              </Text>
              <TouchableOpacity
                style={[styles.nextBtn, { backgroundColor: c.accent }]}
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

      {gameOver && !matchData && (
        <View
          style={[
            styles.gameOverOverlay,
            { backgroundColor: isDarkMode ? 'rgba(10,22,40,0.96)' : 'rgba(242,232,208,0.97)' },
          ]}
        >
          <Text style={{ fontSize: 34 }} {...a11yHidden}>
            {grid}
          </Text>
          <ScoreText style={[styles.gameOverScore, { color: c.text }]}>{score}</ScoreText>
          <Text style={{ color: c.textMuted, fontFamily: FONTS.mono, fontSize: 14, marginBottom: 16 }}>
            {tr(language, `${correctCount} / ${run.length} bonnes réponses`, `${correctCount} / ${run.length} correct`)}
          </Text>
          {coinsEarned != null && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginBottom: 24,
                backgroundColor: c.surface,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: coinsEarned > 0 ? '#ffd700' : coinsSyncFailed ? '#c0392b' : c.border,
                paddingVertical: 10,
                paddingHorizontal: 16,
              }}
            >
              <Coins color="#ffd700" size={20} />
              {coinsEarned > 0 ? (
                <>
                  <Text style={{ color: '#ffd700', fontSize: 22, fontFamily: FONTS.headingBlack }}>
                    {`+${coinsEarned}`}
                  </Text>
                  <Text style={{ color: c.textMuted, fontSize: 13, fontFamily: FONTS.mono }}>
                    {tr(language, 'pièces gagnées', 'coins earned')}
                  </Text>
                </>
              ) : coinsSyncFailed ? (
                <Text style={{ color: '#c0392b', fontSize: 13, fontFamily: FONTS.mono, textAlign: 'center' }}>
                  {tr(
                    language,
                    'Pièces non synchronisées — réessai à la reconnexion',
                    'Coins not synced — will retry on reconnect',
                  )}
                </Text>
              ) : (
                <Text style={{ color: c.textMuted, fontSize: 13, fontFamily: FONTS.mono }}>
                  {coinsCapped
                    ? tr(language, 'Plafond quotidien atteint', 'Daily coin cap reached')
                    : tr(language, 'Aucune pièce cette fois', 'No coins this time')}
                </Text>
              )}
            </View>
          )}

          {/* Rewarded ad slot (hidden while the rewarded_ads flag is off). */}
          {coinsEarned != null && (
            <View style={{ alignSelf: 'stretch', marginBottom: 24 }}>
              <RewardedAdButton context="solo_summary" />
            </View>
          )}
          {isDaily ? (
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={onShare}
              {...a11yButton(tr(language, 'Partager', 'Share'))}
            >
              <Share2 color="#fff" size={20} />
              <Text style={styles.resetBtnText}>{tr(language, 'PARTAGER', 'SHARE')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={resetGame}
              {...a11yButton(tr(language, 'Recommencer', 'Retry'))}
            >
              <RefreshCcw color="#fff" size={20} />
              <Text style={styles.resetBtnText}>{tr(language, 'RECOMMENCER', 'RETRY')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
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

  // Board — mirrors ChallengeQuiz / VersusCapitals so the three quizzes match.
  gameArea: { padding: 20, alignItems: 'center', paddingBottom: 40 },
  turnIndicator: { fontSize: 18, fontFamily: FONTS.headingBlack, marginBottom: 20, textTransform: 'uppercase' },
  card: {
    backgroundColor: '#132040', padding: 24, borderRadius: 24, alignItems: 'center',
    marginBottom: 30, width: '100%', maxWidth: 600, borderWidth: 1, borderColor: '#2d4a70',
  },
  cardLight: { backgroundColor: '#e8d9b8', borderColor: '#c4a87a', elevation: 4, shadowOpacity: 0.1 },
  shapeBox: { width: '100%', maxWidth: 300, aspectRatio: 1.2, marginBottom: 6 },
  instruction: { color: '#4a6a88', fontSize: 14, fontFamily: FONTS.mono, marginTop: 10, textAlign: 'center' },

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
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 18, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, alignSelf: 'stretch',
  },
  nextBtnText: { color: '#fff', fontFamily: FONTS.monoBold, fontSize: 16 },

  gameOverOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 12,
  },
  gameOverScore: { fontSize: 56, fontFamily: FONTS.headingBlack, marginBottom: 4, color: '#2a6e3f' },
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
});
