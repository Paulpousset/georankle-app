/**
 * ChallengeQuiz — a solo CARRÉ / DUO / CASH quiz for a country challenge
 * (src/data/challenges.ts), using the SAME board UI as the country↔capital game
 * (VersusCapitals): pick a difficulty (DUO = 2 options / 1 pt, CARRÉ = 4 options /
 * 3 pts, CASH = free text / 5 pts), answer, see feedback. Fully data-driven, so it
 * works for any Challenge (département numbers, US state flags, …) with no
 * per-game code.
 */

import { useMemo, useRef, useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Image, ScrollView, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, HelpCircle, Eye, CheckCircle, RotateCcw, Home, ChevronRight } from 'lucide-react-native';

import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { tr } from '../i18n';
import { track } from '../lib/analytics';
import { a11yButton, a11yImage, announce, ICON_HIT_SLOP } from '../lib/a11y';
import { ScoreText } from '../components/ScoreText';
import { AtlasTrophy, AtlasCross } from '../components/AtlasIcons';
import { isAnswerClose, normalizeAnswer } from '../lib/answerMatch';
import { createSeededRng, seededShuffle } from '../lib/rng';
import { normalizeRoundScore } from '../lib/score';
import { prefetchFlagSlugs } from '../lib/flags';
import type { Match } from '../types';
import {
  type Challenge, type ChallengeEntity,
  entityAnswer, entityPrompt, entityFlagUrl, entityAcceptedAnswers, pickDistractors,
} from '../data/challenges';

interface ChallengeQuizProps {
  challenge: Challenge;
  onExit: () => void;
  /** Questions per game (default 10). */
  numQuestions?: number;
  /**
   * Online match: when set (with `onRoundComplete`), the quiz plays one round of a
   * 1v1 series — the questions/length come from `game_data` (shared seed so both
   * players face the same set), and finishing reports a normalized 0–1000 score to
   * the match engine instead of showing the solo result screen.
   */
  matchData?: Match | null;
  onRoundComplete?: (score: number) => void;
}

type QuizMode = 'DUO' | 'CARRE' | 'CASH';
type Feedback = { correct: boolean; points: number; answer: string };

const MODE_POINTS: Record<QuizMode, number> = { DUO: 1, CARRE: 3, CASH: 5 };

/** CASH match: numbers compared numerically/exactly, names fuzzily. */
function matchesCash(input: string, e: ChallengeEntity, kind: 'number' | 'name', lang: 'fr' | 'en'): boolean {
  const a = normalizeAnswer(input);
  if (!a) return false;
  if (kind === 'number') {
    const correct = normalizeAnswer(entityAnswer(e, lang));
    if (a === correct) return true;
    if (/^\d+$/.test(a) && /^\d+$/.test(correct)) return Number(a) === Number(correct);
    return false;
  }
  return isAnswerClose(input, entityAnswer(e, lang), entityAcceptedAnswers(e));
}

export default function ChallengeQuiz({ challenge, onExit, numQuestions = 10, matchData, onRoundComplete }: ChallengeQuizProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);

  // Online round: questions + length are driven by the match (shared seed → both
  // players get the same set; per-round offset so each round of the series differs).
  const gdata = matchData?.game_data as { seed?: number; numQuestions?: number } | null | undefined;
  const isOnline = !!matchData && !!onRoundComplete;
  const effectiveNum = gdata?.numQuestions ?? numQuestions;

  const [seed, setSeed] = useState(() =>
    gdata?.seed != null
      ? ((gdata.seed + (matchData?.current_round ?? 0) * 997) | 0)
      : Math.floor(Math.random() * 2147483647),
  );
  const questions = useMemo(
    () => seededShuffle(challenge.entities, createSeededRng(seed)).slice(0, Math.min(effectiveNum, challenge.entities.length)),
    [challenge.entities, seed, effectiveNum],
  );

  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<QuizMode | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [cashInput, setCashInput] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [over, setOver] = useState(false);
  const awardedRef = useRef(false);

  const entity = questions[index];
  const correctAnswer = entity ? entityAnswer(entity, language) : '';
  const flagUrl = challenge.promptKind === 'flag' && entity ? entityFlagUrl(entity) : null;

  // Warm the flag cache for the whole game up front (flag challenges only).
  useEffect(() => {
    if (challenge.promptKind !== 'flag') return;
    prefetchFlagSlugs(questions.map((e) => e.flagSlug).filter(Boolean) as string[]);
  }, [challenge.promptKind, questions]);

  const pickMode = (m: QuizMode) => {
    Haptics.selectionAsync().catch(() => {});
    if (m !== 'CASH') {
      const n = m === 'DUO' ? 1 : 3;
      const rng = createSeededRng(seed + index * 131 + (m === 'DUO' ? 1 : 3));
      setOptions(seededShuffle([correctAnswer, ...pickDistractors(challenge.entities, entity, n, language, rng)], rng));
    } else {
      setCashInput('');
    }
    setMode(m);
  };

  const resolve = (correct: boolean) => {
    const points = correct ? MODE_POINTS[mode ?? 'DUO'] : 0;
    if (correct) {
      setScore((s) => s + points);
      setCorrectCount((n) => n + 1);
    }
    Haptics.notificationAsync(
      correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    ).catch(() => {});
    announce(correct
      ? tr(language, `Bonne réponse, +${points}`, `Correct, +${points}`)
      : tr(language, `Mauvaise réponse. ${correctAnswer}`, `Wrong. ${correctAnswer}`));
    setFeedback({ correct, points, answer: correctAnswer });
  };

  const next = () => {
    if (index + 1 >= questions.length) {
      // Online: report the normalized round score and hand back to the match
      // engine (which shows waiting-opponent → round summary → next round).
      if (isOnline) {
        if (!awardedRef.current) {
          awardedRef.current = true;
          onRoundComplete!(
            normalizeRoundScore('challenge', score, { numQuestions: questions.length, maxPointsPerQuestion: 5 }),
          );
        }
        return;
      }
      if (!awardedRef.current) {
        awardedRef.current = true;
        track('challenge_completed', { challenge: challenge.id, score, correct: correctCount, total: questions.length });
      }
      setOver(true);
      return;
    }
    setIndex((i) => i + 1);
    setMode(null);
    setOptions([]);
    setCashInput('');
    setFeedback(null);
  };

  const replay = () => {
    setSeed(Math.floor(Math.random() * 2147483647));
    setIndex(0);
    setMode(null);
    setOptions([]);
    setCashInput('');
    setFeedback(null);
    setScore(0);
    setCorrectCount(0);
    setOver(false);
    awardedRef.current = false;
  };

  // ── Result screen ──────────────────────────────────────────────────────────
  if (over) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        <View style={styles.resultCentered}>
          <Text style={[styles.resultTitle, { color: c.text }]}>
            {tr(language, 'Partie terminée', 'Game over')}
          </Text>
          <ScoreText style={[styles.bigScore, { color: '#2a6e3f' }]}>{score}</ScoreText>
          <Text style={[styles.resultSub, { color: c.textMuted }]}>{tr(language, 'points', 'points')}</Text>
          <Text style={[styles.resultSub, { color: c.textMuted, marginTop: 6 }]}>
            {tr(language, `${correctCount} / ${questions.length} bonnes réponses`, `${correctCount} / ${questions.length} correct`)}
          </Text>
          <View style={{ gap: 12, width: '100%', maxWidth: 320, marginTop: 28 }}>
            <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#2a6e3f' }]} onPress={replay} {...a11yButton(tr(language, 'Rejouer', 'Play again'))}>
              <RotateCcw color="#fff" size={18} />
              <Text style={styles.bigBtnText}>{tr(language, 'Rejouer', 'Play again')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bigBtn, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border }]} onPress={onExit} {...a11yButton(tr(language, 'Retour', 'Back'))}>
              <Home color={c.text} size={18} />
              <Text style={[styles.bigBtnText, { color: c.text }]}>{tr(language, 'Retour', 'Back')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={onExit} hitSlop={ICON_HIT_SLOP} {...a11yButton(tr(language, 'Retour', 'Back'))}>
          <ArrowLeft color={c.text} size={22} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]} numberOfLines={1}>
          {language === 'fr' ? challenge.titleFr : challenge.titleEn}
        </Text>
        <ScoreText style={[styles.headerScore, { color: '#2a6e3f' }]}>{score}</ScoreText>
      </View>

      <ScrollView contentContainerStyle={styles.gameArea} keyboardShouldPersistTaps="handled">
        <Text style={[styles.turnIndicator, { color: c.accent }]}>
          {`Question ${index + 1}/${questions.length}`}
        </Text>

        {/* Prompt card */}
        <View style={[styles.card, !isDarkMode && styles.cardLight]}>
          {flagUrl ? (
            <Image source={{ uri: flagUrl }} style={styles.flag} {...a11yImage(tr(language, 'Drapeau à identifier', 'Flag to identify'))} />
          ) : (
            <Text style={[styles.countryName, { color: c.text }]} maxFontSizeMultiplier={1.3}>
              {entityPrompt(entity, language)}
            </Text>
          )}
          <Text style={styles.instruction}>
            {language === 'fr' ? challenge.questionFr : challenge.questionEn}
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
              autoCapitalize={challenge.answerKind === 'number' ? 'none' : 'words'}
              onSubmitEditing={() => { if (cashInput.trim()) resolve(matchesCash(cashInput, entity, challenge.answerKind, language)); }}
            />
            <TouchableOpacity
              style={styles.cashSubmitBtn}
              onPress={() => { if (cashInput.trim()) resolve(matchesCash(cashInput, entity, challenge.answerKind, language)); }}
              {...a11yButton(tr(language, 'Valider', 'Submit'))}
            >
              <Text style={styles.cashSubmitText}>{tr(language, 'VALIDER', 'SUBMIT')}</Text>
            </TouchableOpacity>
          </View>
        ) : (mode === 'DUO' || mode === 'CARRE') && !feedback ? (
          <View style={styles.optionsGrid}>
            {options.map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.optionBtn, !isDarkMode && styles.optionBtnLight]}
                onPress={() => resolve(option === correctAnswer)}
                {...a11yButton(option)}
              >
                <Text style={[styles.optionText, { color: c.text }]}>{option}</Text>
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
                {...a11yButton(index + 1 >= questions.length ? tr(language, 'Voir le score', 'See score') : tr(language, 'Suivant', 'Next'))}
              >
                <Text style={styles.nextBtnText}>
                  {index + 1 >= questions.length ? tr(language, 'Voir le score', 'See score') : tr(language, 'Suivant', 'Next')}
                </Text>
                <ChevronRight color="#fff" size={20} />
              </TouchableOpacity>
            </View>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Styles mirror VersusCapitals' board so the quiz looks identical to the
// country↔capital game.
const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontFamily: FONTS.headingBlack, marginHorizontal: 12 },
  headerScore: { fontSize: 20, fontFamily: FONTS.headingBlack, minWidth: 36, textAlign: 'right' },

  gameArea: { padding: 20, alignItems: 'center', paddingBottom: 40 },
  turnIndicator: { fontSize: 18, fontFamily: FONTS.headingBlack, marginBottom: 20, textTransform: 'uppercase' },
  card: {
    backgroundColor: '#132040', padding: 30, borderRadius: 24, alignItems: 'center',
    marginBottom: 30, width: '100%', maxWidth: 600, borderWidth: 1, borderColor: '#2d4a70',
  },
  cardLight: { backgroundColor: '#e8d9b8', borderColor: '#c4a87a', elevation: 4, shadowOpacity: 0.1 },
  flag: { width: 150, height: 100, borderRadius: 12, marginBottom: 15 },
  countryName: { fontSize: 32, fontFamily: FONTS.headingBlack, color: '#d8e8f4', textAlign: 'center' },
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

  resultCentered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  resultTitle: { fontSize: 26, fontFamily: FONTS.headingBlack, textAlign: 'center' },
  bigScore: { fontSize: 64, fontFamily: FONTS.headingBlack, marginTop: 12 },
  resultSub: { fontFamily: FONTS.mono, fontSize: 14, textAlign: 'center' },
  bigBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12 },
  bigBtnText: { color: '#fff', fontFamily: FONTS.monoBold, fontSize: 16 },
});
