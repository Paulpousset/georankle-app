/**
 * « Plus ou Moins » — two countries, one theme, tap the higher one; the chain
 * runs until the first mistake. The whole question chain is precomputed from a
 * seed (src/lib/higherLower.ts), so daily and online rounds are identical for
 * everyone sharing the seed. Mirrors StreakGame's solo / daily / match wiring.
 */
import { showAlert } from '../lib/alert';
import { useState, useEffect, useRef } from 'react';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Moon, Sun, Home } from 'lucide-react-native';
import { ThemeIcon } from '../components/themeIcons';
import type { User } from '@supabase/supabase-js';

import { gameData } from '../data/gameData';
import { buildHigherLowerRun, higherSide, type HLPair } from '../lib/higherLower';
import { normalizeRoundScore } from '../lib/score';
import { track } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { awardSoloCoins } from '../lib/coins';
import { earnsCoins, saveSoloScore } from '../lib/soloResult';
import { OffLeaderboardNotice } from '../components/OffLeaderboardNotice';
import { RunRecap, type RecapEntry } from '../components/RunRecap';
import type { ContinentId } from '../data/continents';
import { useToast } from '../components/ToastProvider';
import { getFlagUrl, prefetchFlags } from '../lib/flags';
import type { GameMode, Match } from '../types';
import { getColors } from '../theme/colors';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { getThemeShortDescription } from '../i18n/themeDescriptions';
import { a11yButton, announce, a11yHidden, ICON_HIT_SLOP } from '../lib/a11y';
import { ScoreText } from '../components/ScoreText';
import { SoloCoinReward } from '../components/SoloCoinReward';
import { SoloEndActions } from '../components/SoloEndActions';
import { EndGlobe } from '../components/end/EndGlobe';
import { Reveal } from '../components/end/Reveal';
import { END_CHOREO } from '../lib/motion';
import { useMyGameGlobe } from '../lib/myGlobe';
import { TopInsetBar } from '../components/TopInsetBar';

import { isMobileLayout as isMobile } from '../lib/layout';
import { countryName } from '../lib/geoNames';
import { themeDisplay } from '../lib/themeDisplay';
import { playSfx } from '../lib/sfx';

/** Reveal linger before the next pair (correct) or game over (wrong). */
const NEXT_DELAY = 1400;
const GAME_OVER_DELAY = 1800;

interface HigherLowerGameProps {
  setGameMode: (mode: GameMode) => void;
  user: User | null;
  matchData?: Match | null;
  onRoundComplete?: (score: number) => void;
  /** Daily challenge: deterministic seed for today's puzzle (overrides random). */
  dailySeed?: number;
  /**
   * Daily/league: the puzzle's UTC date (`YYYY-MM-DD`). Freezes the theme pool
   * to the version in force that day, so two players on different app builds
   * get the same chain. Leave undefined for free solo play.
   */
  poolDate?: string;
  /** Daily challenge: fired once at game-over with the score. */
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
/** Solo continent scope: narrows the country chain. Null = worldwide. */
  scope?: ContinentId | null;
}

export default function HigherLowerGame({
  setGameMode,
  user,
  matchData,
  onRoundComplete,
  dailySeed,
  poolDate,
  onDailyComplete,
  isDaily,
  onShare,
  onDailyScoreChange,
  scope = null,
  training = false,
}: HigherLowerGameProps) {
  const { isDarkMode, setIsDarkMode } = useTheme();
  const { language, openLanguagePicker } = useLanguage();
  const toast = useToast();
  const c = getColors(isDarkMode);

  // The chain is fully determined by the seed, known at mount: daily seed,
  // match seed + round offset, or a fresh random for casual solo.
  const [run, setRun] = useState<HLPair[]>(() => {
    const seed =
      dailySeed ??
      (matchData?.game_data?.seed
        ? matchData.game_data.seed + ((matchData.current_round ?? 1) - 1)
        : Math.floor(Math.random() * 2147483647));
    return buildHigherLowerRun(seed, undefined, { continent: scope, poolDate });
  });
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  /** Which side the player tapped this question (null until they answer). */
  const [picked, setPicked] = useState<'a' | 'b' | null>(null);
  const [recap, setRecap] = useState<RecapEntry[]>([]);
  const [coinsEarned, setCoinsEarned] = useState<number | null>(null);
  const { config: myGlobe } = useMyGameGlobe();
  const [coinsCapped, setCoinsCapped] = useState(false);
  const [coinsSyncFailed, setCoinsSyncFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Synchronous multitouch guard (state `picked` updates async).
  const answeredRef = useRef(false);

  // Surface the running score so the daily host can lock it in on a mid-game quit.
  useEffect(() => {
    if (isDaily) onDailyScoreChange?.(score);
  }, [isDaily, score, onDailyScoreChange]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const fetchBest = async (userId: string): Promise<number> => {
    const { data } = await supabase
      .from('scores')
      .select('score')
      .eq('user_id', userId)
      .eq('game_mode', 'higherlower');
    return data && data.length > 0 ? Math.max(...data.map((s) => s.score)) : 0;
  };

  useEffect(() => {
    if (user) {
      fetchBest(user.id).then((b) => {
        if (b > 0) setBest(b);
      });
    }
    if (!matchData && !isDaily) track('game_started', { mode: 'higherlower' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the next pair's flags warm.
  useEffect(() => {
    const next = run[questionIndex + 1];
    if (next) prefetchFlags([next.a.cca3, next.b.cca3]);
  }, [run, questionIndex]);

  const pair = run[questionIndex] ?? null;

  const finishRun = (finalScore: number, runRecap: RecapEntry[] = recap) => {
    if (finalScore > best) setBest(finalScore);
    if (!isDaily) {
      if (!matchData) {
        track('game_completed', { mode: 'higherlower', score: finalScore, scope: scope ?? 'world' });
      }
      if (user) {
        void saveSoloScore(user, 'higherlower', finalScore, { scope, training }, () =>
          showAlert(
            tr(language, 'Erreur', 'Error'),
            tr(language, "Impossible d'enregistrer ton score.", 'Could not save your score.'),
          ),
        );
        if (!matchData) {
          if (earnsCoins({ training })) awardSoloCoins('higherlower', normalizeRoundScore('higherlower', finalScore)).then((res) => {
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
      }
    }
    timerRef.current = setTimeout(() => {
      setGameOver(true);
      if (matchData && onRoundComplete) {
        onRoundComplete(normalizeRoundScore('higherlower', finalScore));
      }
      if (isDaily) onDailyComplete?.(finalScore);
    }, GAME_OVER_DELAY);
  };

  const handleChoice = (side: 'a' | 'b') => {
    if (!pair || picked || gameOver) return;
    // Two simultaneous taps (one per card) both passed the async `picked`
    // check → stale score saved and a 'lost' overlay over the next pair.
    if (answeredRef.current) return;
    answeredRef.current = true;
    setPicked(side);
    const correct = side === higherSide(pair);
    // Record the pair so the game-over screen can replay the whole chain: the
    // theme, which country actually won it, and by how much.
    const winner = higherSide(pair) === 'a' ? pair.a : pair.b;
    const loser = higherSide(pair) === 'a' ? pair.b : pair.a;
    const nameOf = (e: typeof winner) => countryName(e, language);
    const valueOf = (e: typeof winner) => themeDisplay(pair.themeId, e, language);
    // Built eagerly rather than through a setState updater: a wrong answer
    // ends the run in this same handler, and `recap` state wouldn't have
    // flushed in time to include the losing pair.
    const nextRecap: RecapEntry[] = [
      ...recap,
      {
        cca3: winner.cca3,
        prompt: `${nameOf(pair.a)} / ${nameOf(pair.b)}`,
        yourAnswer: correct ? undefined : nameOf(loser),
        correctAnswer: valueOf(winner) || nameOf(winner),
        ok: correct,
      },
    ];
    setRecap(nextRecap);
    playSfx(correct ? 'correct' : 'wrong');

    if (correct) {
      announce(tr(language, 'Correct ! Série {0}', 'Correct! Chain {0}', [score + 1]));
      setScore((prev) => prev + 1);
      timerRef.current = setTimeout(() => {
        answeredRef.current = false;
        setPicked(null);
        // The precomputed chain is ~100 questions deep; wrap defensively if a
        // player somehow outruns it by reseeding a fresh run.
        if (questionIndex + 1 >= run.length) {
          setRun(buildHigherLowerRun(Math.floor(Math.random() * 2147483647), undefined, { continent: scope }));
          setQuestionIndex(0);
        } else {
          setQuestionIndex((i) => i + 1);
        }
      }, NEXT_DELAY);
    } else if (training) {
      // Entraînement: a miss costs the chain but not the run — the whole point
      // is to keep meeting countries instead of restarting every few seconds.
      announce(
        tr(
          language, 'Faux. {0}. On continue.', 'Wrong. {0}. Keep going.', [valueOf(winner) || nameOf(winner)],
        ),
      );
      timerRef.current = setTimeout(() => {
        answeredRef.current = false;
        setPicked(null);
        if (questionIndex + 1 >= run.length) {
          setRun(buildHigherLowerRun(Math.floor(Math.random() * 2147483647), undefined, { continent: scope }));
          setQuestionIndex(0);
        } else {
          setQuestionIndex((i) => i + 1);
        }
      }, GAME_OVER_DELAY);
    } else {
      announce(
        tr(language, 'Faux ! Perdu. Ton score : {0}', 'Wrong! Game over. Your score: {0}', [score]),
      );
      finishRun(score, nextRecap);
    }
  };

  const resetGame = () => {
    // Le garde anti-multitouch est armé à chaque réponse et n'est désarmé qu'à
    // l'ouverture de la question SUIVANTE — ce qui n'arrive jamais sur la
    // réponse qui termine la partie. Laissé armé, il faisait sortir
    // handleChoice immédiatement sur la partie rejouée : les cartes
    // répondaient au toucher, et rien ne se passait.
    answeredRef.current = false;
    // Et le timer de fin de partie n'a pas à survivre au « Rejouer ».
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setScore(0);
    setQuestionIndex(0);
    setRecap([]);
    setPicked(null);
    setGameOver(false);
    setCoinsEarned(null);
    setCoinsCapped(false);
    setCoinsSyncFailed(false);
    setRun(buildHigherLowerRun(Math.floor(Math.random() * 2147483647), undefined, { continent: scope }));
  };

  if (!pair) return null;

  const theme = (gameData.themes as Record<string, { label: { fr: string; en?: string } }>)[
    pair.themeId
  ];
  const themeLabel = tr(language, theme?.label.fr, theme?.label.en ?? theme?.label.fr);
  const themeDesc = getThemeShortDescription(pair.themeId, language);
  const winner = higherSide(pair);

  const countryCard = (side: 'a' | 'b') => {
    const entry = pair[side];
    const name = countryName(entry, language);
    const revealed = picked !== null;
    const isWinner = winner === side;
    const display = themeDisplay(pair.themeId, entry, language);
    return (
      <TouchableOpacity
        key={side}
        onPress={() => handleChoice(side)}
        disabled={revealed}
        style={[
          styles.countryBtn,
          { backgroundColor: c.card, borderColor: c.border },
          revealed && isWinner && styles.correctBtn,
          revealed && !isWinner && picked === side && styles.wrongBtn,
        ]}
        {...a11yButton(name, {
          disabled: revealed,
          hint: tr(language, 'Choisir ce pays', 'Pick this country'),
        })}
      >
        <Image source={{ uri: getFlagUrl(entry.cca3) }} style={styles.flag} />
        <View style={{ flex: 1 }}>
          <ScoreText
            style={[styles.countryName, { color: c.text }]}
            numberOfLines={2}
            adjustsFontSizeToFit
          >
            {name}
          </ScoreText>
          {revealed && (
            <Text style={[styles.valueText, { color: isWinner ? '#2a6e3f' : c.textMuted }]}>
              {display}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

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
          <Text style={[styles.title, { color: c.text }]}>
            {tr(language, 'Plus ou Moins', 'Higher or Lower')}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.statsContainer, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={styles.statBox}>
              <Text style={[styles.statLabel, { color: c.textFaint }]}>
                {tr(language, 'SÉRIE', 'CHAIN')}
              </Text>
              <ScoreText style={[styles.statValue, { color: c.accent }]}>{score}</ScoreText>
            </View>
            <View style={{ backgroundColor: c.border, width: 1, height: 20, marginHorizontal: 4 }} />
            <View style={styles.statBox}>
              <Text style={[styles.statLabel, { color: c.textFaint }]}>BEST</Text>
              <ScoreText style={[styles.statValue, { color: c.accent }]}>{best}</ScoreText>
            </View>
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

      <View style={styles.gameArea}>
        {/* Question: the theme both countries are compared on. */}
        <View
          style={[
            styles.questionCard,
            { backgroundColor: c.surface, borderLeftColor: c.accent },
          ]}
        >
          <View {...a11yHidden}>
            <ThemeIcon id={pair.themeId} color={c.accent} size={26} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.questionTheme, { color: c.text }]}>{themeLabel}</Text>
            {!!themeDesc && (
              <Text style={[styles.questionDesc, { color: c.textMuted }]}>{themeDesc}</Text>
            )}
            <Text style={[styles.questionSub, { color: c.textMuted }]}>
              {tr(language, 'Quel pays est au-dessus ?', 'Which country is higher?')}
            </Text>
          </View>
        </View>

        {countryCard('a')}

        <View style={styles.vsRow} {...a11yHidden}>
          <View style={[styles.vsLine, { backgroundColor: c.border }]} />
          <Text style={[styles.vsText, { color: c.textFaint }]}>VS</Text>
          <View style={[styles.vsLine, { backgroundColor: c.border }]} />
        </View>

        {countryCard('b')}

        {gameOver && !matchData && (
          <View
            style={[
              styles.gameOverOverlay,
              { backgroundColor: isDarkMode ? 'rgba(10,22,40,0.96)' : 'rgba(242,232,208,0.97)' },
            ]}
          >
            {/* Le récap fait maintenant tenir globe + pièces + réponses : sur un
                petit écran ça dépasse, donc ça défile. */}
            <ScrollView
              style={{ alignSelf: 'stretch' }}
              contentContainerStyle={styles.gameOverContent}
              showsVerticalScrollIndicator={false}
            >
            <EndGlobe
              config={myGlobe}
              size={96}
              accent="#8b1a1a"
              animate
              style={{ marginBottom: 12 }}
              record={isDaily ? undefined : { mode: 'higherlower', score, ctx: { scope, training } }}
            />
            <Reveal at={END_CHOREO.verdict}>
            <ScoreText style={styles.gameOverTitle}>
              {tr(language, 'PERDU !', 'LOST!')}
            </ScoreText>
            <Text style={[styles.gameOverScore, { color: c.text }]}>
              {tr(language, 'Ta série : ', 'Your chain: ')}
              {score}
            </Text>
            {!isDaily && <OffLeaderboardNotice run={{ scope, training }} color={c.textMuted} />}
            </Reveal>
            {/* Pièces + doubleur pub AVANT le récap : la récompense d'abord,
                la solution juste après. */}
            <Reveal at={END_CHOREO.detail}>
            <SoloCoinReward
              coinsEarned={coinsEarned}
              coinsCapped={coinsCapped}
              coinsSyncFailed={coinsSyncFailed}
              containerStyle={{ alignSelf: 'stretch', maxWidth: 380, marginBottom: 14 }}
            />
            </Reveal>
            <Reveal at={END_CHOREO.reward}>
            <View style={{ alignSelf: 'stretch', maxWidth: 380, marginBottom: 18 }}>
              <RunRecap entries={recap} mistakesFirst={false} maxHeight={200} />
            </View>
            </Reveal>
            {/* La chaîne casse à la première erreur : pas de « même partie »
                à rejouer, seulement une nouvelle tentative. */}
            <Reveal at={END_CHOREO.actions}>
            <View style={{ alignSelf: 'stretch', maxWidth: 380 }}>
              <SoloEndActions
                onShare={isDaily ? onShare : undefined}
                onNewGame={isDaily ? undefined : resetGame}
                share={{ mode: 'higherlower', summary: tr(language, 'Série de {0}', 'Streak of {0}', [score]) }}
                onMenu={() => setGameMode('menu')}
              />
            </View>
            </Reveal>
            </ScrollView>
          </View>
        )}
      </View>
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  statBox: { alignItems: 'center', paddingHorizontal: 4 },
  statLabel: { fontSize: 7, fontFamily: FONTS.mono, letterSpacing: 0.5 },
  statValue: { fontSize: 16, fontFamily: FONTS.monoBold },
  iconBtn: { padding: 6, borderRadius: 10, borderWidth: 1 },
  gameArea: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    paddingTop: 16,
    width: '100%',
  },
  questionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderLeftWidth: 4,
    width: '100%',
    maxWidth: 700,
    marginBottom: 14,
  },
  questionTheme: { fontFamily: FONTS.headingBlack, fontSize: 20 },
  questionDesc: { fontFamily: FONTS.mono, fontSize: 11, lineHeight: 15, marginTop: 3 },
  questionSub: { fontFamily: FONTS.mono, fontSize: 12, marginTop: 4 },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 18,
    borderRadius: 16,
    borderWidth: 2,
    width: '100%',
    maxWidth: 700,
  },
  correctBtn: { borderColor: '#2a6e3f', backgroundColor: 'rgba(42,110,63,0.15)' },
  wrongBtn: { borderColor: '#8b1a1a', backgroundColor: 'rgba(139,26,26,0.15)' },
  flag: { width: 84, height: 56, borderRadius: 8 },
  countryName: { fontSize: 22, fontFamily: FONTS.headingBlack },
  valueText: { fontFamily: FONTS.mono, fontSize: 13, marginTop: 4 },
  vsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    maxWidth: 700,
    marginVertical: 10,
  },
  vsLine: { flex: 1, height: 1 },
  vsText: { fontFamily: FONTS.monoBold, fontSize: 12, letterSpacing: 1 },
  gameOverOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    borderRadius: 16,
    padding: 20,
  },
  gameOverContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  gameOverTitle: { fontSize: 44, fontFamily: FONTS.headingBlack, color: '#8b1a1a', marginBottom: 10 },
  gameOverScore: { fontSize: 22, fontFamily: FONTS.mono, marginBottom: 30 },
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
