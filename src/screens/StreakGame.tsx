import { useState, useEffect, useRef } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  Appearance,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Trophy, RefreshCcw, Moon, Sun, Heart, TrendingUp, Home, Share2, Coins } from 'lucide-react-native';
import { ThemeIcon } from '../components/themeIcons';
import type { User } from '@supabase/supabase-js';

import { gameData } from '../data/gameData';
import { createSeededRng, seededShuffle } from '../lib/rng';
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
import { a11yButton, announce, a11yHidden, ICON_HIT_SLOP } from '../lib/a11y';
import { ScoreText } from '../components/ScoreText';

const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';

// How long the revealed ranks stay on screen (correct answer highlighted green)
// before the game-over screen appears / the match advances.
const GAME_OVER_DELAY = 1800;

interface ThemeOption {
  id: string;
  emoji?: string;
  label: { fr: string; en?: string };
  rank: number;
  [key: string]: any;
}

interface StreakGameProps {
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

export default function StreakGame({
  setGameMode,
  user,
  matchData,
  onRoundComplete,
  dailySeed,
  onDailyComplete,
  isDaily,
  onShare,
  onDailyScoreChange,
}: StreakGameProps) {
  const { isDarkMode, setIsDarkMode } = useTheme();
  const { language, setLanguage } = useLanguage();
  const toast = useToast();
  const c = getColors(isDarkMode);
  const [currentCountry, setCurrentCountry] = useState<any>(null);
  const [options, setOptions] = useState<ThemeOption[]>([]);
  const [bestStreak, setBestStreak] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [gameOver, setGameOver] = useState<boolean>(false);
  /** Solo coins credited for this run (null until the server replies). */
  const [coinsEarned, setCoinsEarned] = useState<number | null>(null);
  /** True when today's per-mode coin cap was already hit (no coins this run). */
  const [coinsCapped, setCoinsCapped] = useState(false);
  /** True when the coin award couldn't reach the server (queued for retry). */
  const [coinsSyncFailed, setCoinsSyncFailed] = useState(false);
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [revealedRanks, setRevealedRanks] = useState<Record<string, number>>({});
  const rngRef = useRef<(() => number) | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Surface the running score so the daily host can lock it in on a mid-game quit.
  useEffect(() => {
    if (isDaily) onDailyScoreChange?.(score);
  }, [isDaily, score, onDailyScoreChange]);

  // Clear any pending reveal timer if the screen unmounts mid-reveal.
  useEffect(
    () => () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (dailySeed != null) {
      rngRef.current = createSeededRng(dailySeed);
    } else if (matchData?.game_data?.seed) {
      const roundNumber = matchData.current_round ?? 1;
      rngRef.current = createSeededRng(matchData.game_data.seed + (roundNumber - 1));
    }
    initRound();
    if (user) fetchUserBestStreak(user.id);
    if (!matchData && !isDaily) track('game_started', { mode: 'streak' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchUserBestStreak = async (userId: string) => {
    const { data: scores } = await supabase
      .from('scores')
      .select('score')
      .eq('user_id', userId)
      .eq('game_mode', 'streak');

    if (scores && scores.length > 0) {
      const maxStreak = Math.max(...scores.map((s: any) => s.score));
      setBestStreak(maxStreak);
    }
  };

  const initRound = () => {
    const rand = rngRef.current ?? Math.random;
    const countries = gameData.countries.filter(
      (c: any) => c.ranks && Object.keys(c.ranks).length >= 4,
    );
    const country = countries[Math.floor(rand() * countries.length)];

    const availableThemeIds = Object.keys(country.ranks);
    const shuffledThemeIds = seededShuffle(availableThemeIds, rand);
    const selectedThemeIds = shuffledThemeIds.slice(0, 4);

    const roundOptions = selectedThemeIds.map((id: string) => ({
      id,
      ...(gameData.themes as any)[id],
      rank: country.ranks[id],
    }));

    setCurrentCountry(country);
    prefetchFlags([country.cca3]);
    setOptions(roundOptions);
    setLastAnswerCorrect(null);
    setRevealedRanks({});
    setGameOver(false);
  };

  const handleChoice = (themeId: string) => {
    if (gameOver) return;

    const chosenOption = options.find((o) => o.id === themeId)!;
    const minRank = Math.min(...options.map((o) => o.rank));

    const isCorrect = chosenOption.rank === minRank;

    // Reveal all ranks
    const newRevealed: Record<string, number> = {};
    options.forEach((o) => (newRevealed[o.id] = o.rank));
    setRevealedRanks(newRevealed);

    if (isCorrect) {
      setLastAnswerCorrect(true);
      announce(tr(language, `Correct ! Streak ${score + 1}`, `Correct! Streak ${score + 1}`));
      setScore((prev) => prev + 1);
      revealTimerRef.current = setTimeout(() => {
        initRound();
      }, 1500);
    } else {
      setLastAnswerCorrect(false);
      announce(
        tr(
          language,
          `Faux ! Perdu. Votre score : ${score}`,
          `Wrong! Game over. Your score: ${score}`,
        ),
      );
      if (score > bestStreak) setBestStreak(score);

      // Daily run: record the result, skip the normal score/coins path (daily
      // results live in their own table).
      if (!isDaily) {
        if (!matchData) track('game_completed', { mode: 'streak', score });

        if (user) {
          supabase
            .from('scores')
            .insert({ user_id: user.id, game_mode: 'streak', score })
            .then(({ error }) => {
              if (error) {
                log.error('Error saving streak score:', error);
                Alert.alert(
                  language === 'fr' ? 'Erreur' : 'Error',
                  language === 'fr' ? "Impossible d'enregistrer ton score." : 'Could not save your score.',
                );
              }
            });
          // Solo coins (server-side daily cap, score-independent). Skip in matches.
          // Failures are queued for retry on reconnect and surfaced to the player.
          if (!matchData) {
            awardSoloCoins('streak').then((res) => {
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

      // Keep the revealed ranks on screen for a moment so the player can see the
      // correct answer (highlighted in green) before the game-over screen appears
      // or the match advances to the next round.
      revealTimerRef.current = setTimeout(() => {
        setGameOver(true);
        if (matchData && onRoundComplete) onRoundComplete(score);
        if (isDaily) onDailyComplete?.(score);
      }, GAME_OVER_DELAY);
    }
  };

  const resetGame = () => {
    setScore(0);
    setCoinsEarned(null);
    setCoinsCapped(false);
    initRound();
  };

  if (!currentCountry) return null;

  const themeStyles = {
    container: [styles.container, !isDarkMode && styles.containerLight],
    header: [styles.header, !isDarkMode && styles.headerLight],
    title: [styles.title, !isDarkMode && styles.titleLight],
    card: [styles.card, !isDarkMode && styles.cardLight],
    iconBtn: [styles.iconBtn, !isDarkMode && styles.iconBtnLight],
    themeBtn: (id: string) => [
      styles.themeBtn,
      !isDarkMode && styles.themeBtnLight,
      revealedRanks[id] !== undefined &&
        (options.find((o) => o.id === id)!.rank === Math.min(...options.map((o) => o.rank))
          ? styles.correctBtn
          : styles.wrongBtn),
    ],
  };

  return (
    <SafeAreaView style={themeStyles.container}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />

        <View style={themeStyles.header}>
          {!isMobile ? (
            <>
              <TouchableOpacity
                onPress={() => setGameMode('menu')}
                style={[themeStyles.iconBtn, { marginRight: 10 }]}
                hitSlop={ICON_HIT_SLOP}
                {...a11yButton(tr(language, 'Menu', 'Menu'))}
              >
                <Home color={c.accent} size={20} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={themeStyles.title}>GeoStreak</Text>
              </View>
              <View style={[styles.statsContainer, { backgroundColor: c.surface, borderColor: c.border }]}>
                <View style={styles.statBox}>
                  <Text style={[styles.statLabel, { color: c.textFaint }]}>STREAK</Text>
                  <Text style={[styles.statValue, { color: c.accent }]}>{score}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statLabel, { color: c.textFaint }]}>BEST</Text>
                  <Text style={[styles.statValue, { color: c.accent }]}>{bestStreak}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={() => setLanguage(language === 'fr' ? 'en' : 'fr')}
                  style={[themeStyles.iconBtn, { minWidth: 40, alignItems: 'center' }]}
                  hitSlop={ICON_HIT_SLOP}
                  {...a11yButton(tr(language, 'Changer de langue', 'Change language'))}
                >
                  <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 11 }}>
                    {language.toUpperCase()}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setIsDarkMode(!isDarkMode)}
                  style={themeStyles.iconBtn}
                  hitSlop={ICON_HIT_SLOP}
                  {...a11yButton(
                    isDarkMode
                      ? tr(language, 'Mode clair', 'Light mode')
                      : tr(language, 'Mode sombre', 'Dark mode'),
                  )}
                >
                  {isDarkMode ? (
                    <Sun color={c.accent} size={20} />
                  ) : (
                    <Moon color={c.textMuted} size={20} />
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <TouchableOpacity
                  onPress={() => setGameMode('menu')}
                  style={[themeStyles.iconBtn, { marginRight: 8 }]}
                  hitSlop={ICON_HIT_SLOP}
                  {...a11yButton(tr(language, 'Menu', 'Menu'))}
                >
                  <Home color={c.accent} size={18} />
                </TouchableOpacity>
                <Text style={themeStyles.title}>GeoStreak</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.statsContainer, { backgroundColor: c.surface, borderColor: c.border }]}>
                  <View style={styles.statBox}>
                    <Text style={[styles.statLabel, { color: c.textFaint }]}>STREAK</Text>
                    <Text style={[styles.statValue, { color: c.accent }]}>{score}</Text>
                  </View>
                  <View
                    style={{
                      backgroundColor: c.border,
                      width: 1,
                      height: 20,
                      marginHorizontal: 4,
                    }}
                  />
                  <View style={styles.statBox}>
                    <Text style={[styles.statLabel, { color: c.textFaint }]}>BEST</Text>
                    <Text style={[styles.statValue, { color: c.accent }]}>{bestStreak}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => setLanguage(language === 'fr' ? 'en' : 'fr')}
                  style={[themeStyles.iconBtn, { minWidth: 40, alignItems: 'center' }]}
                  hitSlop={ICON_HIT_SLOP}
                  {...a11yButton(tr(language, 'Changer de langue', 'Change language'))}
                >
                  <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 11 }}>
                    {language.toUpperCase()}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setIsDarkMode(!isDarkMode)}
                  style={themeStyles.iconBtn}
                  hitSlop={ICON_HIT_SLOP}
                  {...a11yButton(
                    isDarkMode
                      ? tr(language, 'Mode clair', 'Light mode')
                      : tr(language, 'Mode sombre', 'Dark mode'),
                  )}
                >
                  {isDarkMode ? (
                    <Sun color={c.accent} size={18} />
                  ) : (
                    <Moon color={c.textMuted} size={18} />
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        <View style={styles.gameArea}>
          {!isMobile ? (
            <>
              <View
                style={{
                  backgroundColor: isDarkMode ? 'rgba(74,158,255,0.08)' : 'rgba(192,74,26,0.08)',
                  padding: 12,
                  borderRadius: 12,
                  marginBottom: 20,
                  borderLeftWidth: 4,
                  borderLeftColor: c.accent,
                  width: '100%',
                  maxWidth: 700,
                }}
              >
                <Text
                  style={{
                    color: c.text,
                    fontFamily: FONTS.mono,
                    fontSize: 13,
                    textAlign: 'center',
                  }}
                >
                  {language === 'fr'
                    ? 'Trouvez le thème où ce pays est le mieux classé mondialement. Une seule erreur et le streak retombe à zéro !'
                    : 'Find the theme where this country ranks best globally. One mistake and your streak resets to zero!'}
                </Text>
              </View>
              <View style={themeStyles.card}>
                <Image source={{ uri: getFlagUrl(currentCountry.cca3) }} style={styles.flag} />
                <ScoreText style={[styles.countryName, !isDarkMode && { color: c.text }]}>
                  {language === 'fr'
                    ? currentCountry.name
                    : currentCountry.name_en || currentCountry.name}
                </ScoreText>
                <Text style={[styles.instruction, { color: c.textMuted }]}>
                  {language === 'fr'
                    ? 'Quel est son meilleur classement ?'
                    : 'What is its best ranking?'}
                </Text>
              </View>
            </>
          ) : (
            <>
              <View
                style={{
                  backgroundColor: isDarkMode ? 'rgba(74,158,255,0.08)' : 'rgba(192,74,26,0.08)',
                  padding: 8,
                  borderRadius: 10,
                  marginBottom: 12,
                  borderLeftWidth: 4,
                  borderLeftColor: c.accent,
                  width: '100%',
                  maxWidth: 700,
                }}
              >
                <Text
                  style={{
                    color: c.text,
                    fontSize: 13,
                    fontWeight: '600',
                    textAlign: 'center',
                  }}
                >
                  {language === 'fr'
                    ? 'Trouvez le thème où ce pays est le mieux classé mondialement.'
                    : 'Find the theme where this country ranks best globally.'}
                </Text>
              </View>
              <View style={[themeStyles.card, { padding: 15 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
                  <Image
                    source={{ uri: getFlagUrl(currentCountry.cca3) }}
                    style={[styles.flag, { marginBottom: 0, width: 80, height: 55 }]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.countryName,
                        !isDarkMode && { color: c.text },
                        { fontSize: 24, textAlign: 'left' },
                      ]}
                    >
                      {language === 'fr'
                        ? currentCountry.name
                        : currentCountry.name_en || currentCountry.name}
                    </Text>
                    <Text style={[styles.instruction, { marginTop: 2, fontSize: 12, color: c.textMuted }]}>
                      {language === 'fr'
                        ? 'Quel est son meilleur classement ?'
                        : 'What is its best ranking?'}
                    </Text>
                  </View>
                </View>
              </View>
            </>
          )}

          <View style={styles.optionsGrid}>
            {options.map((theme) => (
              <TouchableOpacity
                key={theme.id}
                style={themeStyles.themeBtn(theme.id)}
                onPress={() => handleChoice(theme.id)}
                disabled={revealedRanks[theme.id] !== undefined}
                {...a11yButton(
                  language === 'fr' ? theme.label.fr : theme.label.en || theme.label.fr,
                  {
                    disabled: revealedRanks[theme.id] !== undefined,
                    hint: tr(language, 'Choisir ce thème', 'Pick this theme'),
                  },
                )}
              >
                <View style={styles.emoji} {...a11yHidden}>
                  <ThemeIcon id={theme.id} color={c.accent} size={20} />
                </View>
                <Text
                  style={[styles.themeLabel, !isDarkMode && { color: c.text }]}
                  numberOfLines={2}
                >
                  {language === 'fr' ? theme.label.fr : theme.label.en || theme.label.fr}
                </Text>
                {revealedRanks[theme.id] !== undefined && (
                  <Text style={[styles.rankText, { color: c.accent }]}>#{revealedRanks[theme.id]}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {gameOver && !matchData && (
            <View
              style={[
                styles.gameOverOverlay,
                { backgroundColor: isDarkMode ? 'rgba(10,22,40,0.96)' : 'rgba(242,232,208,0.97)' },
              ]}
            >
              <ScoreText style={styles.gameOverTitle}>{language === 'fr' ? 'PERDU !' : 'LOST!'}</ScoreText>
              <Text style={[styles.gameOverScore, { color: c.text }]}>
                {language === 'fr' ? 'Votre score : ' : 'Your score: '}
                {score}
              </Text>
              {/* Coins earned for this run (solo only, server-credited). */}
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
                        {language === 'fr' ? 'pièces gagnées' : 'coins earned'}
                      </Text>
                    </>
                  ) : coinsSyncFailed ? (
                    <Text style={{ color: '#c0392b', fontSize: 13, fontFamily: FONTS.mono, textAlign: 'center' }}>
                      {language === 'fr'
                        ? 'Pièces non synchronisées — réessai à la reconnexion'
                        : 'Coins not synced — will retry on reconnect'}
                    </Text>
                  ) : (
                    <Text style={{ color: c.textMuted, fontSize: 13, fontFamily: FONTS.mono }}>
                      {coinsCapped
                        ? (language === 'fr' ? 'Plafond quotidien atteint' : 'Daily coin cap reached')
                        : (language === 'fr' ? 'Aucune pièce cette fois' : 'No coins this time')}
                    </Text>
                  )}
                </View>
              )}
              {isDaily ? (
                <TouchableOpacity
                  style={styles.resetBtn}
                  onPress={onShare}
                  {...a11yButton(tr(language, 'Partager', 'Share'))}
                >
                  <Share2 color="#fff" size={20} />
                  <Text style={styles.resetBtnText}>
                    {language === 'fr' ? 'PARTAGER' : 'SHARE'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.resetBtn}
                  onPress={resetGame}
                  {...a11yButton(tr(language, 'Recommencer', 'Retry'))}
                >
                  <RefreshCcw color="#fff" size={20} />
                  <Text style={styles.resetBtnText}>
                    {language === 'fr' ? 'RECOMMENCER' : 'RETRY'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628', userSelect: 'none' as any },
  containerLight: { backgroundColor: '#f2e8d0' },
  header: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a70',
    minHeight: 60,
  },
  headerLight: { backgroundColor: '#e8d9b8', borderBottomColor: '#c4a87a' },
  title: { fontSize: 18, fontFamily: FONTS.headingBlack, color: '#d8e8f4' },
  titleLight: { color: '#2c1810' },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2d50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginRight: 5,
    borderWidth: 1,
    borderColor: '#2d4a70',
  },
  statBox: { alignItems: 'center', paddingHorizontal: 4 },
  statLabel: { fontSize: 7, fontFamily: FONTS.mono, color: '#4a6a88', letterSpacing: 0.5 },
  statValue: { fontSize: 16, fontFamily: FONTS.monoBold, color: '#4a9eff' },
  iconBtn: { padding: 6, backgroundColor: '#1a2d50', borderRadius: 10, borderWidth: 1, borderColor: '#2d4a70' },
  iconBtnLight: { backgroundColor: '#f8f2e3', borderColor: '#c4a87a' },
  gameArea: {
    flex: 1,
    padding: 16,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 20,
  },
  card: {
    backgroundColor: '#132040',
    padding: 25,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 15,
    borderWidth: 2,
    borderColor: '#2d4a70',
    width: '100%',
    maxWidth: 700,
  },
  cardLight: { backgroundColor: '#e8d9b8', borderColor: '#c4a87a' },
  flag: { width: 120, height: 80, borderRadius: 10, marginBottom: 15 },
  countryName: { fontSize: 32, fontFamily: FONTS.headingBlack, color: '#d8e8f4', textAlign: 'center' },
  instruction: { fontFamily: FONTS.mono, color: '#4a6a88', fontSize: 12, marginTop: 10 },
  optionsGrid: { gap: 10, width: '100%', maxWidth: 700 },
  themeBtn: {
    backgroundColor: '#132040',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#2d4a70',
  },
  themeBtnLight: { backgroundColor: '#f8f2e3', borderColor: '#c4a87a' },
  correctBtn: { borderColor: '#2a6e3f', backgroundColor: 'rgba(42,110,63,0.15)' },
  wrongBtn: { borderColor: '#8b1a1a', backgroundColor: 'rgba(139,26,26,0.15)' },
  emoji: { fontSize: 22, marginRight: 14 },
  themeLabel: { fontFamily: FONTS.heading, color: '#d8e8f4', fontSize: 15, flex: 1 },
  rankText: { fontSize: 18, fontFamily: FONTS.monoBold, color: '#4a9eff' },
  gameOverOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(10,22,40,0.96)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    padding: 20,
  },
  gameOverTitle: { fontSize: 44, fontFamily: FONTS.headingBlack, color: '#8b1a1a', marginBottom: 10 },
  gameOverScore: { fontSize: 22, fontFamily: FONTS.mono, color: '#d8e8f4', marginBottom: 30 },
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
