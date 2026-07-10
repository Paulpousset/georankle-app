/**
 * « Plus ou Moins » — two countries, one theme, tap the higher one; the chain
 * runs until the first mistake. The whole question chain is precomputed from a
 * seed (src/lib/higherLower.ts), so daily and online rounds are identical for
 * everyone sharing the seed. Mirrors StreakGame's solo / daily / match wiring.
 */
import { showAlert } from '../lib/alert';
import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { RefreshCcw, Moon, Sun, Home, Share2, Coins } from 'lucide-react-native';
import { ThemeIcon } from '../components/themeIcons';
import type { User } from '@supabase/supabase-js';

import { gameData } from '../data/gameData';
import { buildHigherLowerRun, higherSide, type HLPair } from '../lib/higherLower';
import { normalizeRoundScore } from '../lib/score';
import { track } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { log } from '../lib/log';
import { awardSoloCoins } from '../lib/coins';
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
import { RewardedAdButton } from '../components/RewardedAdButton';
import { TopInsetBar } from '../components/TopInsetBar';

import { isMobileLayout as isMobile } from '../lib/layout';

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
  /** Daily challenge: fired once at game-over with the score. */
  onDailyComplete?: (score: number, grid?: string) => void;
  /** Daily challenge: replaces "Retry" with "Share" and skips score saving. */
  isDaily?: boolean;
  /** Daily challenge: invoked by the "Share" button on the game-over overlay. */
  onShare?: () => void;
  /** Daily challenge: reports the live score so a mid-game quit can lock it in. */
  onDailyScoreChange?: (score: number) => void;
}

export default function HigherLowerGame({
  setGameMode,
  user,
  matchData,
  onRoundComplete,
  dailySeed,
  onDailyComplete,
  isDaily,
  onShare,
  onDailyScoreChange,
}: HigherLowerGameProps) {
  const { isDarkMode, setIsDarkMode } = useTheme();
  const { language, setLanguage } = useLanguage();
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
    return buildHigherLowerRun(seed);
  });
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  /** Which side the player tapped this question (null until they answer). */
  const [picked, setPicked] = useState<'a' | 'b' | null>(null);
  const [coinsEarned, setCoinsEarned] = useState<number | null>(null);
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

  const finishRun = (finalScore: number) => {
    if (finalScore > best) setBest(finalScore);
    if (!isDaily) {
      if (!matchData) track('game_completed', { mode: 'higherlower', score: finalScore });
      if (user) {
        supabase
          .from('scores')
          .insert({ user_id: user.id, game_mode: 'higherlower', score: finalScore })
          .then(({ error }) => {
            if (error) {
              log.error('Error saving higherlower score:', error);
              showAlert(
                tr(language, 'Erreur', 'Error'),
                tr(language, "Impossible d'enregistrer ton score.", 'Could not save your score.'),
              );
            }
          });
        if (!matchData) {
          awardSoloCoins('higherlower').then((res) => {
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

    if (correct) {
      announce(tr(language, `Correct ! Série ${score + 1}`, `Correct! Chain ${score + 1}`));
      setScore((prev) => prev + 1);
      timerRef.current = setTimeout(() => {
        answeredRef.current = false;
        setPicked(null);
        // The precomputed chain is ~100 questions deep; wrap defensively if a
        // player somehow outruns it by reseeding a fresh run.
        if (questionIndex + 1 >= run.length) {
          setRun(buildHigherLowerRun(Math.floor(Math.random() * 2147483647)));
          setQuestionIndex(0);
        } else {
          setQuestionIndex((i) => i + 1);
        }
      }, NEXT_DELAY);
    } else {
      announce(
        tr(language, `Faux ! Perdu. Ton score : ${score}`, `Wrong! Game over. Your score: ${score}`),
      );
      finishRun(score);
    }
  };

  const resetGame = () => {
    setScore(0);
    setQuestionIndex(0);
    setPicked(null);
    setGameOver(false);
    setCoinsEarned(null);
    setCoinsCapped(false);
    setCoinsSyncFailed(false);
    setRun(buildHigherLowerRun(Math.floor(Math.random() * 2147483647)));
  };

  if (!pair) return null;

  const theme = (gameData.themes as Record<string, { label: { fr: string; en?: string } }>)[
    pair.themeId
  ];
  const themeLabel = language === 'fr' ? theme?.label.fr : theme?.label.en ?? theme?.label.fr;
  const themeDesc = getThemeShortDescription(pair.themeId, language);
  const winner = higherSide(pair);

  const countryCard = (side: 'a' | 'b') => {
    const entry = pair[side];
    const name = language === 'fr' ? entry.name : entry.name_en;
    const revealed = picked !== null;
    const isWinner = winner === side;
    const display = language === 'fr' ? entry.display_fr : entry.display_en;
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
            <ScoreText style={styles.gameOverTitle}>
              {tr(language, 'PERDU !', 'LOST!')}
            </ScoreText>
            <Text style={[styles.gameOverScore, { color: c.text }]}>
              {tr(language, 'Ta série : ', 'Your chain: ')}
              {score}
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
    alignItems: 'center',
    borderRadius: 16,
    padding: 20,
  },
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
