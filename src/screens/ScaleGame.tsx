/**
 * « À l'échelle » — two country silhouettes side by side. The left one is drawn
 * at the true scale, the right one starts too big or too small and the player
 * resizes it with a slider until both share the same real-world scale. Each
 * pair scores 0..200 from how close the chosen zoom is to the truth (log
 * error, see src/lib/scale.ts), so a 5-pair run lands on 0..1000 — already the
 * normalized scale that coins expect.
 *
 * Solo only for now (no daily / online surface). Mirrors SilhouetteGame's solo
 * wiring: score save, coins, end-of-run recap.
 */
import { showAlert } from '../lib/alert';
import { useState, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { playSfx } from '../lib/sfx';
import Svg, { ClipPath, Defs, G, Line, Path, Rect } from 'react-native-svg';
import { Moon, Sun, Home, ChevronRight } from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';

import {
  buildScaleRun,
  countryArea,
  scaleCountryName,
  scaledPath,
  scalePoints,
  sliderPosOf,
  trueUnitPx,
  zoomAt,
  SCALE_MAX_POINTS,
  SCALE_SIDE,
  type ScaleQuestion,
} from '../lib/scale';
import { fmtArea } from '../lib/format';
import { track } from '../lib/analytics';
import { awardSoloCoins } from '../lib/coins';
import { earnsCoins, saveSoloScore } from '../lib/soloResult';
import { OffLeaderboardNotice } from '../components/OffLeaderboardNotice';
import { CountryFactCard } from '../components/CountryFactCard';
import { ZoomSlider } from '../components/ZoomSlider';
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

const NUM_PAIRS = 5;
const HALF = SCALE_SIDE / 2;
const GOOD = '#2a6e3f';
const BAD = '#8b1a1a';

/** Grid square: green when close, yellow when roughly right, red otherwise. */
function gridCell(points: number): string {
  if (points >= SCALE_MAX_POINTS * 0.8) return '🟩';
  if (points >= SCALE_MAX_POINTS * 0.4) return '🟨';
  return '🟥';
}

/** « 23 % trop grand » / « 18 % trop petit » / « Parfait ! ». */
function offsetLabel(zoom: number, language: Language): string {
  const pct = Math.round(Math.abs(zoom - 1) * 100);
  if (pct <= 2) return tr(language, 'Pile à l’échelle !', 'Spot on!');
  return zoom > 1
    ? tr(language, '{0} % trop grand', '{0}% too big', [pct])
    : tr(language, '{0} % trop petit', '{0}% too small', [pct]);
}

interface ScaleGameProps {
  setGameMode: (mode: GameMode) => void;
  user: User | null;
  /**
   * Entraînement: nothing is recorded (no coins, no leaderboard) and each
   * reveal offers the country's fact sheet.
   */
  training?: boolean;
}

/** The two countries of a pair, the right one at `zoom` × its true scale. */
function PairBoard({
  q,
  zoom,
  reveal,
  leftColor,
  rightColor,
  dividerColor,
}: {
  q: ScaleQuestion;
  zoom: number;
  /** Draw the true-scale outline of the right country over the guess. */
  reveal: boolean;
  leftColor: string;
  rightColor: string;
  dividerColor: string;
}) {
  const unit = trueUnitPx(q);
  const left = scaledPath(q.left, unit, HALF, HALF);
  const right = scaledPath(q.right, unit * zoom, SCALE_SIDE + HALF, HALF);
  const truth = reveal ? scaledPath(q.right, unit, SCALE_SIDE + HALF, HALF) : null;
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${SCALE_SIDE * 2} ${SCALE_SIDE}`}>
      <Defs>
        <ClipPath id="scale-clip-l">
          <Rect x={0} y={0} width={SCALE_SIDE} height={SCALE_SIDE} />
        </ClipPath>
        <ClipPath id="scale-clip-r">
          <Rect x={SCALE_SIDE} y={0} width={SCALE_SIDE} height={SCALE_SIDE} />
        </ClipPath>
      </Defs>
      <G clipPath="url(#scale-clip-l)">{left && <Path d={left} fill={leftColor} />}</G>
      <G clipPath="url(#scale-clip-r)">
        {right && <Path d={right} fill={rightColor} opacity={reveal ? 0.55 : 1} />}
        {truth && (
          <Path d={truth} fill="none" stroke={GOOD} strokeWidth={1.2} strokeDasharray="3 2" />
        )}
      </G>
      <Line
        x1={SCALE_SIDE}
        y1={6}
        x2={SCALE_SIDE}
        y2={SCALE_SIDE - 6}
        stroke={dividerColor}
        strokeWidth={0.6}
        strokeDasharray="2 2"
      />
    </Svg>
  );
}

export default function ScaleGame({ setGameMode, user, training = false }: ScaleGameProps) {
  const { isDarkMode, setIsDarkMode } = useTheme();
  const { language, openLanguagePicker } = useLanguage();
  const toast = useToast();
  const c = getColors(isDarkMode);
  // Distinct from the left country's accent so the two never read as one shape.
  const rightColor = isDarkMode ? PALETTE.sand : PALETTE.oceanBlue;

  const [run, setRun] = useState<ScaleQuestion[]>(() =>
    buildScaleRun(Math.floor(Math.random() * 2147483647), NUM_PAIRS),
  );
  const [questionIndex, setQuestionIndex] = useState(0);
  const question = run[questionIndex] ?? null;
  const [pos, setPos] = useState(() => (run[0] ? sliderPosOf(run[0], run[0].startZoom) : 0.5));
  /** Points of the current pair once validated (null while still sliding). */
  const [feedback, setFeedback] = useState<{ points: number; zoom: number } | null>(null);
  const [score, setScore] = useState(0);
  const [grid, setGrid] = useState('');
  const [history, setHistory] = useState<{ points: number; zoom: number }[]>([]);
  const [factsFor, setFactsFor] = useState<string | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [coinsEarned, setCoinsEarned] = useState<number | null>(null);
  const [coinsCapped, setCoinsCapped] = useState(false);
  const [coinsSyncFailed, setCoinsSyncFailed] = useState(false);
  const { config: myGlobe } = useMyGameGlobe();
  const awardedRef = useRef(false);

  useEffect(() => {
    track('game_started', { mode: 'scale' });
  }, []);

  const zoom = question ? zoomAt(question, pos) : 1;
  const leftName = question ? scaleCountryName(question.left, language) : '';
  const rightName = question ? scaleCountryName(question.right, language) : '';

  const validate = () => {
    if (!question || feedback) return;
    const points = scalePoints(zoom);
    setScore((s) => s + points);
    setGrid((g) => g + gridCell(points));
    setHistory((h) => [...h, { points, zoom }]);
    const good = points >= SCALE_MAX_POINTS * 0.6;
    Haptics.notificationAsync(
      good ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    ).catch(() => {});
    playSfx(good ? 'correct' : 'wrong');
    announce(`${offsetLabel(zoom, language)}, +${points}`);
    setFeedback({ points, zoom });
  };

  const finishRun = (finalScore: number) => {
    setGameOver(true);
    announce(tr(language, 'Partie terminée. Score {0}.', 'Game over. Score {0}.', [finalScore]));
    track('game_completed', { mode: 'scale', score: finalScore });
    if (user && !awardedRef.current) {
      awardedRef.current = true;
      void saveSoloScore(user, 'scale', finalScore, { training }, () =>
        showAlert(
          tr(language, 'Erreur', 'Error'),
          tr(language, "Impossible d'enregistrer ton score.", 'Could not save your score.'),
        ),
      );
      // The run already scores on the 0..1000 scale coins are computed from.
      if (earnsCoins({ training })) awardSoloCoins('scale', finalScore).then((res) => {
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
    const nq = run[questionIndex + 1];
    setQuestionIndex((i) => i + 1);
    setPos(sliderPosOf(nq, nq.startZoom));
    setFeedback(null);
  };

  /** Remet la manche à zéro sans toucher au tirage. */
  const restartRun = (r: ScaleQuestion[]) => {
    setQuestionIndex(0);
    setPos(r[0] ? sliderPosOf(r[0], r[0].startZoom) : 0.5);
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

  /** Rejoue exactement les mêmes paires, dans le même ordre. */
  const replaySameGame = () => restartRun(run);

  /** Nouveau tirage. */
  const resetGame = () => {
    const fresh = buildScaleRun(Math.floor(Math.random() * 2147483647), NUM_PAIRS);
    setRun(fresh);
    restartRun(fresh);
  };

  if (!question) return null;

  const leftArea = countryArea(question.left);
  const rightArea = countryArea(question.right);

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
          <Text style={[styles.title, { color: c.text }]}>{tr(language, 'À l’échelle', 'To Scale')}</Text>
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

      <ScrollView contentContainerStyle={styles.gameArea} scrollEnabled={!gameOver}>
        <Text style={[styles.turnIndicator, { color: c.accent }]}>
          {tr(language, 'Paire {0}/{1}', 'Pair {0}/{1}', [questionIndex + 1, run.length])}
        </Text>

        <View
          style={[styles.card, !isDarkMode && styles.cardLight]}
          accessible
          accessibilityLabel={tr(
            language,
            '{0} à gauche, {1} à droite',
            '{0} on the left, {1} on the right',
            [leftName, rightName],
          )}
        >
          <View style={styles.namesRow}>
            <Text style={[styles.countryName, { color: c.accent }]} numberOfLines={1}>
              {leftName}
            </Text>
            <Text style={[styles.countryName, { color: rightColor }]} numberOfLines={1}>
              {rightName}
            </Text>
          </View>
          <View style={styles.board} {...a11yHidden}>
            <PairBoard
              q={question}
              zoom={zoom}
              reveal={!!feedback}
              leftColor={c.accent}
              rightColor={rightColor}
              dividerColor={c.border}
            />
          </View>
          {feedback && (
            <View style={styles.namesRow}>
              <Text style={[styles.areaText, { color: c.textMuted }]}>
                {leftArea ? fmtArea(leftArea, language) : ''}
              </Text>
              <Text style={[styles.areaText, { color: c.textMuted }]}>
                {rightArea ? fmtArea(rightArea, language) : ''}
              </Text>
            </View>
          )}
          <Text style={[styles.instruction, { color: c.textMuted }]}>
            {feedback
              ? tr(language, 'Pointillés verts : la vraie taille.', 'Green dashes: the real size.')
              : tr(
                  language,
                  'Agrandis ou réduis le pays de droite pour qu’il soit à la même échelle que celui de gauche.',
                  'Grow or shrink the right country so it matches the scale of the left one.',
                )}
          </Text>
        </View>

        {!feedback ? (
          <>
            <ZoomSlider
              value={pos}
              onChange={setPos}
              accent={rightColor}
              trackColor={c.border}
              label={tr(language, 'Taille de {0}', 'Size of {0}', [rightName])}
              valueText={`${Math.round(pos * 100)} %`}
              minusLabel={tr(language, 'Réduire', 'Shrink')}
              plusLabel={tr(language, 'Agrandir', 'Grow')}
              caption={tr(language, '◀ plus petit · plus grand ▶', '◀ smaller · bigger ▶')}
              captionColor={c.textMuted}
            />
            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: GOOD }]}
              onPress={validate}
              {...a11yButton(tr(language, 'Valider', 'Submit'))}
            >
              <Text style={styles.nextBtnText}>{tr(language, 'VALIDER', 'SUBMIT')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View
            style={[
              styles.feedbackCard,
              feedback.points >= SCALE_MAX_POINTS * 0.6 ? styles.correctCard : styles.wrongCard,
            ]}
          >
            <Text style={[styles.feedbackTitle, { color: c.text }]}>{offsetLabel(feedback.zoom, language)}</Text>
            <Text style={[styles.feedbackSub, { color: c.text }]}>
              {`+${feedback.points} / ${SCALE_MAX_POINTS}`}
            </Text>
            {training && (
              <TouchableOpacity
                style={[styles.learnBtn, { borderColor: c.accent }]}
                onPress={() => setFactsFor(question.right)}
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
              record={{ mode: 'scale', score, ctx: { training } }}
            />
            <Reveal at={END_CHOREO.verdict}>
              <ResultGrid grid={grid} style={{ marginBottom: 10 }} />
              <ScoreText style={[styles.gameOverScore, { color: c.text }]}>{score}</ScoreText>
              <Text style={{ color: c.textMuted, fontFamily: FONTS.mono, fontSize: 14, marginBottom: 16, textAlign: 'center' }}>
                {tr(language, 'sur {0}', 'out of {0}', [run.length * SCALE_MAX_POINTS])}
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

            {/* Recap: every pair with how far off the guess was. */}
            <Reveal at={END_CHOREO.reward}>
              <View style={[styles.recapCard, { backgroundColor: c.card, borderColor: c.border }]}>
                {run.map((q, i) => {
                  const h = history[i];
                  const ok = !!h && h.points >= SCALE_MAX_POINTS * 0.6;
                  return (
                    <TouchableOpacity
                      key={`${q.left}-${q.right}`}
                      onPress={() => setFactsFor(q.right)}
                      style={[styles.recapRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}
                      {...a11yButton(
                        `${scaleCountryName(q.left, language)} / ${scaleCountryName(q.right, language)}, +${h?.points ?? 0}`,
                        { hint: tr(language, 'Voir la fiche du pays', 'See the country facts') },
                      )}
                    >
                      <View style={styles.recapShape} {...a11yHidden}>
                        <PairBoard
                          q={q}
                          zoom={1}
                          reveal={false}
                          leftColor={c.accent}
                          rightColor={rightColor}
                          dividerColor={c.border}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.recapName, { color: c.text }]} numberOfLines={1}>
                          {`${scaleCountryName(q.left, language)} · ${scaleCountryName(q.right, language)}`}
                        </Text>
                        {h && (
                          <Text style={{ color: c.textMuted, fontFamily: FONTS.mono, fontSize: 11 }}>
                            {offsetLabel(h.zoom, language)}
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
                onReplaySame={replaySameGame}
                onNewGame={resetGame}
                share={{ mode: 'scale', summary: `${score}/${run.length * SCALE_MAX_POINTS}` }}
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

  gameArea: { padding: 20, alignItems: 'center', paddingBottom: 40 },
  turnIndicator: { fontSize: 18, fontFamily: FONTS.headingBlack, marginBottom: 16, textTransform: 'uppercase' },
  card: {
    backgroundColor: '#132040', padding: 16, borderRadius: 24, alignItems: 'center',
    marginBottom: 20, width: '100%', maxWidth: 640, borderWidth: 1, borderColor: '#2d4a70',
  },
  cardLight: { backgroundColor: '#e8d9b8', borderColor: '#c4a87a', elevation: 4, shadowOpacity: 0.1 },
  namesRow: { flexDirection: 'row', width: '100%' },
  countryName: { flex: 1, textAlign: 'center', fontSize: 16, fontFamily: FONTS.headingBlack, paddingHorizontal: 4 },
  areaText: { flex: 1, textAlign: 'center', fontSize: 12, fontFamily: FONTS.mono },
  board: { width: '100%', aspectRatio: 2, marginVertical: 6 },
  instruction: { fontSize: 13, fontFamily: FONTS.mono, marginTop: 8, textAlign: 'center' },

  feedbackCard: { padding: 24, borderRadius: 24, alignItems: 'center', width: '100%', maxWidth: 500 },
  correctCard: { backgroundColor: 'rgba(42, 110, 63, 0.15)', borderWidth: 2, borderColor: GOOD },
  wrongCard: { backgroundColor: 'rgba(139, 26, 26, 0.15)', borderWidth: 2, borderColor: BAD },
  feedbackTitle: { fontSize: 22, fontFamily: FONTS.headingBlack, marginBottom: 5, textAlign: 'center' },
  feedbackSub: { fontSize: 16, textAlign: 'center', fontFamily: FONTS.mono },
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
  recapShape: { width: 64, height: 32 },
  recapName: { fontSize: 14, fontFamily: FONTS.heading },
});
