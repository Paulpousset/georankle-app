import { showAlert } from '../lib/alert';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Home, Info, Moon, RefreshCcw, Share2, Sun, Trophy } from 'lucide-react-native';
import { ThemeIcon } from '../components/themeIcons';
import type { User } from '@supabase/supabase-js';

import type { Match, Selection, SelectionMap, Theme } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { gameData } from '../data/gameData';
import { createSeededRng, seededShuffle } from '../lib/rng';
import { MISSING_RANK, SESSION_SIZE, solveOptimal } from '../lib/gameLogic';
import { normalizeRoundScore } from '../lib/score';
import { track } from '../lib/analytics';
import { log } from '../lib/log';
import { supabase } from '../lib/supabase';
import { awardSoloCoins } from '../lib/coins';
import { useToast } from '../components/ToastProvider';
import { useCachedData } from '../lib/cache';
import { getFlagUrl, prefetchFlags } from '../lib/flags';
import { getEfficiencyColor, getRankColor } from '../lib/ranks';
import { pickLabel, tr } from '../i18n';
import { commonStyles as styles } from '../theme/commonStyles';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { ThemeInfoModal } from '../components/ThemeInfoModal';
import { a11yButton, announce, a11yHidden, ICON_HIT_SLOP } from '../lib/a11y';
import { ScoreText } from '../components/ScoreText';
import { SoloCoinReward } from '../components/SoloCoinReward';
import { TopInsetBar } from '../components/TopInsetBar';

import { isMobileLayout as isMobile } from '../lib/layout';

/**
 * A finished classic session, captured so it can be reviewed read-only later
 * (e.g. the local-parcours "ideal game" review per player).
 */
export interface ClassicSessionResult {
  sessionThemes: Theme[];
  rounds: typeof gameData.countries;
  selections: SelectionMap;
  optimalSelections: SelectionMap;
  totalScore: number;
}

interface ClassicGameProps {
  user: User | null;
  matchData?: Match | null;
  onRoundComplete?: (score: number) => void;
  onExit: () => void;
  /** Daily challenge: deterministic seed for today's puzzle (overrides random). */
  dailySeed?: number;
  /** Daily challenge: fired once at game-over with the score + emoji share grid. */
  onDailyComplete?: (score: number, grid?: string) => void;
  /** Daily challenge: replaces "Play again" with "Share" and skips score saving. */
  isDaily?: boolean;
  /** Daily challenge: invoked by the "Share" button on the win screen. */
  onShare?: () => void;
  /** Parcours: capture this session's full result for later review. */
  onSessionData?: (data: ClassicSessionResult) => void;
  /** Review mode: render a finished session read-only (no live game, no saving). */
  reviewData?: ClassicSessionResult | null;
}

/** Emoji cell for the share grid: how close a pick was to the optimal rank. */
function gridCell(mineRank: number, optimalRank: number): string {
  const diff = mineRank - optimalRank;
  if (diff <= 0) return '🟩';
  if (diff <= 10) return '🟨';
  return '🟥';
}

/**
 * Classic GeoRankle: assign each of 8 countries to the best remaining theme,
 * then compare your total against the optimal assignment.
 */
export function ClassicGame({
  user,
  matchData,
  onRoundComplete,
  onExit,
  dailySeed,
  onDailyComplete,
  isDaily,
  onShare,
  onSessionData,
  reviewData,
}: ClassicGameProps) {
  const { isDarkMode, toggleTheme } = useTheme();
  const { language, toggleLanguage } = useLanguage();
  const toast = useToast();
  const c = getColors(isDarkMode);
  // In review mode the relevant state is seeded from the captured session so the
  // results screen renders read-only without any live-game setup (see effect below).
  const [sessionThemes, setSessionThemes] = useState<Theme[]>(() => reviewData?.sessionThemes ?? []);
  const [rounds, setRounds] = useState<typeof gameData.countries>(() => reviewData?.rounds ?? []);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [totalScore, setTotalScore] = useState(() => reviewData?.totalScore ?? 0);
  /** Optimistic best-score bump from the game just finished this session. */
  const [sessionBest, setSessionBest] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(() => !!reviewData);
  /** Solo coins credited for this session (null until the server replies). */
  const [coinsEarned, setCoinsEarned] = useState<number | null>(null);
  /** True when today's per-mode coin cap was already hit (no coins this time). */
  const [coinsCapped, setCoinsCapped] = useState(false);
  /** True when the coin award couldn't reach the server (queued for retry). */
  const [coinsSyncFailed, setCoinsSyncFailed] = useState(false);
  const [usedThemeIds, setUsedThemeIds] = useState<string[]>([]);
  const [selections, setSelections] = useState<SelectionMap>(() => reviewData?.selections ?? {});
  const [optimalSelections, setOptimalSelections] = useState<SelectionMap>(() => reviewData?.optimalSelections ?? {});
  const [showThemeInfo, setShowThemeInfo] = useState<Theme | null>(null);

  const rngRef = useRef<(() => number) | null>(null);

  useEffect(() => {
    // Review mode: state is already seeded from reviewData; skip the live game.
    if (reviewData) return;
    if (dailySeed != null) {
      rngRef.current = createSeededRng(dailySeed);
    } else if (matchData?.game_data?.seed) {
      const roundNumber = matchData.current_round ?? 1;
      rngRef.current = createSeededRng(matchData.game_data.seed + (roundNumber - 1));
    }
    initGame();
    if (!matchData && !isDaily) track('game_started', { mode: 'classic' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchUserBestScores = useCallback(async (): Promise<number | null> => {
    if (!user) return null;
    const { data: scores } = await supabase
      .from('scores')
      .select('score')
      .eq('user_id', user.id)
      .eq('game_mode', 'classic');

    if (scores && scores.length > 0) {
      // Older rows stored total ranks (usually > 100); keep only efficiency (%).
      const validScores = scores.map((s) => s.score).filter((s: number) => s <= 100);
      return validScores.length > 0 ? Math.max(...validScores) : null;
    }
    return null;
  }, [user]);

  // Cached best score (stale-while-revalidate): hydrate instantly and refetch in the
  // background at most once per TTL instead of hitting the network on every mount.
  const { data: cachedBest } = useCachedData<number | null>(
    `classic-best:${user?.id ?? 'anon'}`,
    fetchUserBestScores,
    { enabled: !!user },
  );
  const bestScore = (() => {
    const vals: number[] = [];
    if (cachedBest != null) vals.push(cachedBest);
    if (sessionBest != null) vals.push(sessionBest);
    return vals.length ? Math.max(...vals) : null;
  })();

  const initGame = () => {
    const roundNumber = matchData?.current_round ?? 1;
    const sessions = matchData?.game_data?.sessions as Record<number, { themeIds: string[]; countryCca3s: string[] }> | undefined;
    const prebuilt = sessions?.[roundNumber];

    let selectedThemes: Theme[];
    let selectedCountries: typeof gameData.countries;

    if (prebuilt) {
      // Online mode: use pre-computed session stored in game_data — guaranteed identical for both players.
      selectedThemes = prebuilt.themeIds.map((id: string) => ({ id, ...gameData.themes[id] }));
      selectedCountries = prebuilt.countryCca3s
        .map((cca3: string) => gameData.countries.find((c) => c.cca3 === cca3))
        .filter(Boolean) as typeof gameData.countries;
      // Version drift: an opponent's session may reference a cca3 this build's
      // game_data no longer has. Fewer countries than themes crashed the end
      // screen (rounds[i] undefined) — top up from the local pool instead.
      if (selectedCountries.length < prebuilt.countryCca3s.length) {
        const have = new Set(selectedCountries.map((co) => co.cca3));
        const fillers = gameData.countries.filter(
          (co) => !have.has(co.cca3) && selectedThemes.every((t) => co.ranks && co.ranks[t.id] !== undefined),
        );
        while (selectedCountries.length < prebuilt.countryCca3s.length && fillers.length) {
          selectedCountries.push(fillers.shift()!);
        }
      }
    } else {
      // Solo mode: randomise locally.
      const allThemeIds = Object.keys(gameData.themes).filter((themeId) => {
        const coverage = gameData.countries.filter(
          (c) => c.ranks && c.ranks[themeId] !== undefined,
        ).length;
        return coverage > 10;
      });
      const rand = rngRef.current ?? Math.random;
      selectedThemes = seededShuffle(allThemeIds, rand)
        .slice(0, SESSION_SIZE)
        .map((id) => ({ id, ...gameData.themes[id] }));
      let countries = gameData.countries.filter((c) =>
        selectedThemes.every(
          (theme) =>
            c.ranks && c.ranks[theme.id] !== undefined && c.data && c.data[theme.id] !== undefined,
        ),
      );
      if (countries.length < SESSION_SIZE) {
        countries = [...gameData.countries].sort(
          (a, b) => Object.keys(b.ranks).length - Object.keys(a.ranks).length,
        );
      }
      selectedCountries = seededShuffle(countries, rand).slice(0, SESSION_SIZE);
    }

    setSessionThemes(selectedThemes);
    setRounds(selectedCountries);
    // Warm the flag cache for the whole session so flags don't pop in mid-round.
    prefetchFlags(selectedCountries.map((co) => co.cca3));
    setCurrentRoundIndex(0);
    setTotalScore(0);
    setGameOver(false);
    setCoinsEarned(null);
    setCoinsCapped(false);
    setUsedThemeIds([]);
    setSelections({});
    setOptimalSelections(solveOptimal(selectedThemes, selectedCountries, language));
  };

  const selectTheme = (themeId: string) => {
    if (gameOver || usedThemeIds.includes(themeId)) return;
    // Exactly one pick per round: the round index only advances via a 300 ms
    // setTimeout, so a second fast tap on a DIFFERENT theme card would assign
    // the same country twice, skip one, and (on the last rounds) jump past the
    // end-of-game branch entirely.
    if (usedThemeIds.length !== currentRoundIndex) return;

    const country = rounds[currentRoundIndex];
    if (!country) return;
    const rank = country.ranks[themeId] || MISSING_RANK;

    setSelections((prev) => ({
      ...prev,
      [themeId]: {
        countryName: language === 'fr' ? country.name : country.name_en || country.name,
        rank,
        cca3: country.cca3,
      },
    }));
    setUsedThemeIds((prev) => [...prev, themeId]);
    setTotalScore((prev) => prev + rank);

    if (currentRoundIndex < SESSION_SIZE - 1) {
      // Snappy auto-advance to the next country.
      setTimeout(() => setCurrentRoundIndex((prev) => prev + 1), 300);
    } else {
      setTimeout(() => {
        setGameOver(true);
        const finalScore = totalScore + rank;

        const gameOptimalTotal = Object.values(optimalSelections).reduce(
          (acc, curr) => acc + curr.rank,
          0,
        );
        const gameEfficiency = Math.round((gameOptimalTotal / Math.max(finalScore, 1)) * 100);

        setSessionBest((prev) => (prev === null || gameEfficiency > prev ? gameEfficiency : prev));

        announce(
          tr(
            language,
            `Session terminée. Score total ${finalScore}, efficacité ${gameEfficiency}%.`,
            `Session finished. Total score ${finalScore}, efficiency ${gameEfficiency}%.`,
          ),
        );

        // Daily run: record the result + emoji grid; skip the normal score/coins
        // path (daily results live in their own table). Build the grid from the
        // final picks — include the just-made selection (state hasn't flushed).
        if (isDaily) {
          const grid = sessionThemes
            .map((t) => {
              const mine = t.id === themeId ? rank : selections[t.id]?.rank ?? MISSING_RANK;
              return gridCell(mine, optimalSelections[t.id]?.rank ?? 0);
            })
            .join('');
          onDailyComplete?.(gameEfficiency, grid);
          return;
        }

        if (!matchData) track('game_completed', { mode: 'classic', score: gameEfficiency });

        if (user) {
          supabase
            .from('scores')
            .insert({ user_id: user.id, game_mode: 'classic', score: gameEfficiency })
            .then(({ error }) => {
              if (error) {
                log.error('Error saving classic efficiency:', error);
                showAlert(tr(language, 'Erreur', 'Error'), tr(language, "Impossible d'enregistrer ton score.", 'Could not save your score.'));
              }
            });
          // Solo coins (server-side daily cap; reward scales with performance).
          // Skip in matches. Failures are queued for retry on reconnect and
          // surfaced to the player instead of being swallowed by a console.log.
          if (!matchData) {
            awardSoloCoins('classic', normalizeRoundScore('classic', gameEfficiency)).then((res) => {
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

        if (matchData && onRoundComplete) {
          // Capture the full session (incl. the just-made pick — state hasn't
          // flushed yet) so the parcours can offer an "ideal game" review later.
          const fullSelections: SelectionMap = {
            ...selections,
            [themeId]: {
              countryName: language === 'fr' ? country.name : country.name_en || country.name,
              rank,
              cca3: country.cca3,
            },
          };
          onSessionData?.({
            sessionThemes,
            rounds,
            selections: fullSelections,
            optimalSelections,
            totalScore: finalScore,
          });
          onRoundComplete(normalizeRoundScore('classic', gameEfficiency));
        }
      }, 500);
    }
  };

  // Theme-aware style fragments (mirrors the dark/light layering convention).
  const themeStyles = {
    container: [styles.container, !isDarkMode && styles.containerLight],
    header: [styles.header, !isDarkMode && styles.headerLight],
    title: [styles.title, !isDarkMode && styles.titleLight],
    headerStats: [styles.headerStats, !isDarkMode && styles.headerStatsLight],
    statLabel: [styles.statLabel, !isDarkMode && styles.statLabelLight],
    statValue: [styles.statValue, !isDarkMode && styles.statValueLight],
    statBox: [styles.statBox],
    countryLabel: [styles.countryLabel],
    countryName: [styles.countryName, !isDarkMode && styles.countryNameLight],
    instruction: [styles.instruction],
    themeCard: (isUsed: boolean) => [
      styles.themeCard,
      !isDarkMode && styles.themeCardLight,
      isUsed && (isDarkMode ? styles.usedThemeCard : styles.usedThemeCardLight),
    ],
    themeLabel: [styles.themeLabel, !isDarkMode && styles.themeLabelLight],
    selectionCountry: [styles.selectionCountry],
    winCard: [styles.winCard, !isDarkMode && styles.winCardLight],
    winTitle: [styles.winTitle, !isDarkMode && styles.winTitleLight],
    summaryHeaderText: [styles.summaryHeaderText, !isDarkMode && styles.summaryHeaderTextLight],
    rowThemeLabel: [styles.rowThemeLabel, !isDarkMode && styles.rowThemeLabelLight],
    summaryRow: [styles.summaryRow, !isDarkMode && styles.summaryRowLight],
  };

  if (rounds.length === 0 || sessionThemes.length === 0) {
    return (
      <View style={[styles.container, !isDarkMode && styles.containerLight, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: isDarkMode ? 'white' : 'black' }}>{tr(language, 'Chargement…', 'Loading…')}</Text>
      </View>
    );
  }

  const currentCountry = !gameOver ? rounds[currentRoundIndex] : null;

  const usedOptimalScore = usedThemeIds.reduce(
    (acc, themeId) => acc + (optimalSelections[themeId]?.rank || 0),
    0,
  );
  const currentEfficiency =
    usedThemeIds.length > 0 ? Math.round((usedOptimalScore / Math.max(totalScore, 1)) * 100) : 0;

  const optimalTotalValue = Object.values(optimalSelections).reduce(
    (acc, curr) => acc + curr.rank,
    0,
  );
  const efficiency = gameOver ? Math.round((optimalTotalValue / Math.max(totalScore, 1)) * 100) : 0;

  return (
    <SafeAreaView style={themeStyles.container} edges={['left', 'right', 'bottom']}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        <TopInsetBar color={isDarkMode ? c.background : c.card} />

        <View style={themeStyles.header}>
          {!isMobile ? (
            <>
              <TouchableOpacity
                onPress={onExit}
                hitSlop={ICON_HIT_SLOP}
                {...a11yButton(tr(language, 'Menu', 'Menu'))}
                style={[
                  styles.refreshBtn,
                  !isDarkMode && styles.refreshBtnLight,
                  { padding: 8, marginRight: 10 },
                ]}
              >
                <Home color={c.accent} size={20} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={[themeStyles.title, { fontFamily: FONTS.headingBlack }]}>GeoG</Text>
              </View>

              <View style={{ flex: 1.5, alignItems: 'center' }}>
                <View
                  style={[
                    themeStyles.statBox,
                    { paddingHorizontal: 20, flexDirection: 'row', gap: 15 },
                  ]}
                >
                  <View style={{ alignItems: 'center' }}>
                    <Text style={themeStyles.statLabel}>SCORE</Text>
                    <ScoreText
                      style={[
                        themeStyles.statValue,
                        {
                          fontSize: 32,
                          color: getRankColor(totalScore / (currentRoundIndex || 1)),
                        },
                      ]}
                    >
                      {totalScore}
                    </ScoreText>
                  </View>
                  <View
                    style={{
                      width: 1,
                      height: '60%',
                      backgroundColor: c.border,
                      alignSelf: 'center',
                    }}
                  />
                  <View style={{ alignItems: 'center' }}>
                    <Text style={themeStyles.statLabel}>
                      {tr(language, 'EFFICACITÉ', 'EFFICIENCY')}
                    </Text>
                    <ScoreText
                      style={[
                        themeStyles.statValue,
                        { fontSize: 32, color: getEfficiencyColor(currentEfficiency) },
                      ]}
                    >
                      {currentEfficiency}%
                    </ScoreText>
                  </View>
                </View>
              </View>

              <View
                style={{
                  flex: 1,
                  alignItems: 'flex-end',
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                  gap: 8,
                }}
              >
                <View style={themeStyles.headerStats}>
                  <View style={themeStyles.statBox}>
                    <Text style={themeStyles.statLabel}>ROUND</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                      <Text style={[themeStyles.statValue, { fontSize: 18 }]}>
                        {gameOver ? '8' : currentRoundIndex + 1}
                      </Text>
                      <Text style={styles.statTotal}>/8</Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.statDivider,
                      { backgroundColor: c.border },
                    ]}
                  />
                  <View style={themeStyles.statBox}>
                    <Text style={themeStyles.statLabel}>BEST EFF</Text>
                    <Text
                      style={[
                        themeStyles.statValue,
                        { color: c.accent, fontSize: 18 },
                      ]}
                    >
                      {bestScore === null || bestScore > 100 ? '--' : `${bestScore}%`}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TouchableOpacity
                    onPress={toggleTheme}
                    hitSlop={ICON_HIT_SLOP}
                    {...a11yButton(
                      isDarkMode
                        ? tr(language, 'Passer en thème clair', 'Switch to light theme')
                        : tr(language, 'Passer en thème sombre', 'Switch to dark theme'),
                    )}
                    style={[
                      styles.refreshBtn,
                      !isDarkMode && styles.refreshBtnLight,
                      { padding: 6 },
                    ]}
                  >
                    {isDarkMode ? (
                      <Sun color={c.accent} size={16} />
                    ) : (
                      <Moon color={c.textMuted} size={16} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={toggleLanguage}
                    hitSlop={ICON_HIT_SLOP}
                    {...a11yButton(tr(language, 'Changer de langue', 'Change language'))}
                    style={[
                      styles.refreshBtn,
                      !isDarkMode && styles.refreshBtnLight,
                      {
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        minWidth: 45,
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontFamily: FONTS.monoBold,
                        color: c.text,
                        fontSize: 12,
                      }}
                    >
                      {language.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <TouchableOpacity
                  onPress={onExit}
                  hitSlop={ICON_HIT_SLOP}
                  {...a11yButton(tr(language, 'Menu', 'Menu'))}
                  style={[
                    styles.refreshBtn,
                    !isDarkMode && styles.refreshBtnLight,
                    { padding: 6, marginRight: 8 },
                  ]}
                >
                  <Home color={c.accent} size={18} />
                </TouchableOpacity>
                <Text style={[themeStyles.title, { fontFamily: FONTS.headingBlack }]}>GeoG</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={themeStyles.headerStats}>
                  <View style={themeStyles.statBox}>
                    <Text style={themeStyles.statLabel}>R.</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                      <Text style={[themeStyles.statValue, { fontSize: 16 }]}>
                        {gameOver ? '8' : currentRoundIndex + 1}
                      </Text>
                      <Text style={styles.statTotal}>/8</Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.statDivider,
                      { backgroundColor: c.border },
                    ]}
                  />
                  <View style={themeStyles.statBox}>
                    <Text style={themeStyles.statLabel}>SCORE</Text>
                    <Text
                      style={[
                        themeStyles.statValue,
                        {
                          color: getRankColor(totalScore / (currentRoundIndex || 1)),
                          fontSize: 16,
                        },
                      ]}
                    >
                      {totalScore}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statDivider,
                      { backgroundColor: c.border },
                    ]}
                  />
                  <View style={themeStyles.statBox}>
                    <Text style={themeStyles.statLabel}>{tr(language, 'EFF.', 'EFF.')}</Text>
                    <Text
                      style={[
                        themeStyles.statValue,
                        { color: getEfficiencyColor(currentEfficiency), fontSize: 16 },
                      ]}
                    >
                      {currentEfficiency}%
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={toggleTheme}
                  hitSlop={ICON_HIT_SLOP}
                  {...a11yButton(
                    isDarkMode
                      ? tr(language, 'Passer en thème clair', 'Switch to light theme')
                      : tr(language, 'Passer en thème sombre', 'Switch to dark theme'),
                  )}
                  style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 6 }]}
                >
                  {isDarkMode ? (
                    <Sun color={c.accent} size={16} />
                  ) : (
                    <Moon color={c.textMuted} size={16} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={toggleLanguage}
                  hitSlop={ICON_HIT_SLOP}
                  {...a11yButton(tr(language, 'Changer de langue', 'Change language'))}
                  style={[
                    styles.refreshBtn,
                    !isDarkMode && styles.refreshBtnLight,
                    {
                      paddingHorizontal: 8,
                      paddingVertical: 6,
                      minWidth: 40,
                      alignItems: 'center',
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: FONTS.monoBold,
                      color: c.text,
                      fontSize: 11,
                    }}
                  >
                    {language.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        <View style={{ flex: 1 }}>
          {!gameOver && currentCountry ? (
            <View
              style={{ flex: 1, paddingHorizontal: 15, paddingVertical: 10, alignItems: 'center' }}
            >
              {!isMobile ? (
                <View
                  style={[
                    styles.countryCard,
                    !isDarkMode && styles.countryCardLight,
                    {
                      padding: 15,
                      marginBottom: 10,
                      width: '100%',
                      maxWidth: 500,
                      alignItems: 'center',
                    },
                  ]}
                >
                  <Text style={themeStyles.countryLabel}>
                    {tr(language, 'PAYS ACTUEL', 'CURRENT COUNTRY')}
                  </Text>
                  <Image
                    source={{ uri: getFlagUrl(currentCountry.cca3) }}
                    style={[styles.countryFlag, { height: 50, width: 75, marginVertical: 4 }]}
                  />
                  <Text style={[themeStyles.countryName, { fontSize: 28, marginVertical: 2 }]}>
                    {language === 'fr'
                      ? currentCountry.name
                      : currentCountry.name_en || currentCountry.name}
                  </Text>
                  <Text style={[themeStyles.instruction, { fontSize: 13, marginTop: 2 }]}>
                    {tr(
                      language,
                      'Assignez un thème à ce pays',
                      'Assign a category to this country',
                    )}
                  </Text>
                </View>
              ) : (
                <View
                  style={[
                    styles.countryCard,
                    !isDarkMode && styles.countryCardLight,
                    {
                      padding: 15,
                      marginBottom: 15,
                      width: '100%',
                      maxWidth: 500,
                      alignItems: 'center',
                    },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
                    <Image
                      source={{ uri: getFlagUrl(currentCountry.cca3) }}
                      style={[styles.countryFlag, { height: 60, width: 90, borderRadius: 8 }]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          themeStyles.countryName,
                          { fontSize: 26, textAlign: 'left', fontWeight: '900' },
                        ]}
                      >
                        {language === 'fr'
                          ? currentCountry.name
                          : currentCountry.name_en || currentCountry.name}
                      </Text>
                      <Text
                        style={[
                          themeStyles.instruction,
                          { fontSize: 12, color: c.textMuted },
                        ]}
                      >
                        {tr(language, 'Assignez un thème', 'Assign a category')}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              <View
                style={[
                  styles.themesGrid,
                  {
                    flex: 1,
                    justifyContent: !isMobile ? 'center' : 'flex-start',
                    gap: !isMobile ? 8 : 6,
                    width: '100%',
                    maxWidth: 500,
                  },
                ]}
              >
                {sessionThemes.map((theme) => {
                  const selection: Selection | undefined = selections[theme.id];
                  const isUsed = !!selection;
                  const themeName = pickLabel(theme.label, language);

                  return (
                    <View
                      key={theme.id}
                      style={[
                        themeStyles.themeCard(isUsed),
                        {
                          padding: 10,
                          borderRadius: 12,
                          minHeight: 45,
                          borderLeftWidth: 5,
                          borderLeftColor: isUsed
                            ? getRankColor(selection.rank)
                            : c.border,
                        },
                      ]}
                    >
                      {/* Theme-select tap target. Kept a sibling of the info
                          button (not its parent) so neither renders as a
                          <button> nested inside another <button> on web. */}
                      <TouchableOpacity
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                        onPress={() => selectTheme(theme.id)}
                        disabled={isUsed}
                        {...a11yButton(
                          isUsed
                            ? tr(
                                language,
                                `${themeName}, attribué à ${selection.countryName}, rang ${selection.rank}`,
                                `${themeName}, assigned to ${selection.countryName}, rank ${selection.rank}`,
                              )
                            : themeName,
                          {
                            selected: isUsed,
                            disabled: isUsed,
                            hint: isUsed
                              ? undefined
                              : tr(
                                  language,
                                  'Attribuer le pays actuel à ce thème',
                                  'Assign the current country to this theme',
                                ),
                          },
                        )}
                      >
                        <View style={{ marginRight: 10 }}>
                          <ThemeIcon id={theme.id} color={c.accent} size={20} />
                        </View>
                        <Text
                          style={[themeStyles.themeLabel, { fontSize: 14, flex: 1 }]}
                          numberOfLines={1}
                        >
                          {pickLabel(theme.label, language)}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => setShowThemeInfo(theme)}
                        hitSlop={ICON_HIT_SLOP}
                        {...a11yButton(
                          tr(language, `Infos sur le thème ${themeName}`, `Info about ${themeName} theme`),
                        )}
                        style={{ padding: 5 }}
                      >
                        <Info
                          size={16}
                          color={isUsed ? c.textFaint : c.textMuted}
                        />
                      </TouchableOpacity>

                      {isUsed && (
                        <View style={styles.selectionInfo}>
                          <Text
                            style={[themeStyles.selectionCountry, { fontSize: 10 }]}
                            numberOfLines={1}
                          >
                            {selection.countryName}
                          </Text>
                          <Text
                            style={[
                              styles.selectionRank,
                              { fontSize: 18, color: getRankColor(selection.rank) },
                            ]}
                          >
                            #{selection.rank}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }}>
              <View
                style={[
                  themeStyles.winCard,
                  {
                    flex: 1,
                    padding: 0,
                    overflow: 'hidden',
                    width: '100%',
                    maxWidth: 800,
                    alignSelf: 'center',
                  },
                ]}
              >
                <ScrollView
                  contentContainerStyle={{ padding: 20, paddingBottom: 16 }}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={{ alignItems: 'center', marginBottom: 18 }}>
                    <Trophy color={c.accent} size={44} {...a11yHidden} />
                    <ScoreText
                      style={[themeStyles.winTitle, { fontSize: 28, marginTop: 8, marginBottom: 16 }]}
                    >
                      {tr(language, 'SESSION TERMINÉE', 'SESSION FINISHED')}
                    </ScoreText>

                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        alignSelf: 'stretch',
                        justifyContent: 'center',
                        backgroundColor: c.surface,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: c.border,
                        paddingVertical: 16,
                        gap: 24,
                      }}
                    >
                      <View style={{ alignItems: 'center' }}>
                        <Text style={[themeStyles.statLabel, { fontSize: 11 }]}>
                          {tr(language, 'SCORE TOTAL', 'TOTAL SCORE')}
                        </Text>
                        <ScoreText
                          style={[
                            themeStyles.statValue,
                            { fontSize: 44, lineHeight: 48, color: getRankColor(totalScore / 8) },
                          ]}
                        >
                          {totalScore}
                        </ScoreText>
                        <Text style={{ fontFamily: FONTS.mono, fontSize: 10, color: c.textMuted }}>
                          {tr(language, 'Optimal : ', 'Optimal: ')}
                          <Text style={{ fontFamily: FONTS.monoBold }}>{optimalTotalValue}</Text>
                        </Text>
                      </View>

                      <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: c.border }} />

                      <View style={{ alignItems: 'center' }}>
                        <Text style={[themeStyles.statLabel, { fontSize: 11 }]}>
                          {tr(language, 'EFFICACITÉ', 'EFFICIENCY')}
                        </Text>
                        <ScoreText
                          style={[
                            themeStyles.statValue,
                            { fontSize: 44, lineHeight: 48, color: getEfficiencyColor(efficiency) },
                          ]}
                        >
                          {efficiency}%
                        </ScoreText>
                        <Text style={{ fontFamily: FONTS.mono, fontSize: 10, color: c.textMuted }}>
                          {tr(language, 'Indice de perf', 'Perf index')}
                        </Text>
                      </View>
                    </View>

                    {/* Animated coins + rewarded-ad doubler (solo only, server-credited). */}
                    <SoloCoinReward
                      coinsEarned={coinsEarned}
                      coinsCapped={coinsCapped}
                      coinsSyncFailed={coinsSyncFailed}
                      containerStyle={{ alignSelf: 'stretch', marginTop: 12 }}
                    />
                  </View>

                  <Text
                    style={[
                      themeStyles.summaryHeaderText,
                      { fontSize: 11, marginBottom: 10, marginLeft: 4 },
                    ]}
                  >
                    {tr(language, 'DÉTAIL PAR THÈME', 'BREAKDOWN BY THEME')}
                  </Text>

                  <View style={{ gap: 8 }}>
                    {sessionThemes.map((theme) => {
                      const selection = selections[theme.id];
                      const optimal = optimalSelections[theme.id];
                      // Defensive: an interrupted/degenerate session can leave a
                      // theme without a pick — skip the row instead of crashing.
                      if (!selection || !optimal) return null;
                      const optimalCountryName =
                        language === 'fr'
                          ? optimal.countryName
                          : gameData.countries.find((co) => co.cca3 === optimal.cca3)?.name_en ||
                            optimal.countryName;
                      return (
                        <View
                          key={theme.id}
                          style={{
                            backgroundColor: c.surface,
                            borderRadius: 12,
                            padding: 12,
                            borderLeftWidth: 4,
                            borderLeftColor: getRankColor(selection.rank),
                          }}
                        >
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8,
                              marginBottom: 10,
                            }}
                          >
                            <ThemeIcon id={theme.id} color={c.accent} size={18} />
                            <Text
                              style={[themeStyles.rowThemeLabel, { fontSize: 15, flex: 1 }]}
                              numberOfLines={1}
                            >
                              {pickLabel(theme.label, language)}
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ flex: 1 }}>
                              <Text style={[themeStyles.summaryHeaderText, { marginBottom: 6 }]}>
                                {tr(language, 'VOTRE CHOIX', 'YOUR CHOICE')}
                              </Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Image
                                  source={{ uri: getFlagUrl(selection.cca3) }}
                                  style={{ width: 26, height: 18, borderRadius: 3 }}
                                />
                                <Text
                                  style={{
                                    fontFamily: FONTS.heading,
                                    fontSize: 13,
                                    color: c.text,
                                    flex: 1,
                                  }}
                                  numberOfLines={1}
                                >
                                  {selection.countryName}
                                </Text>
                                <Text
                                  style={{
                                    fontFamily: FONTS.monoBold,
                                    fontSize: 16,
                                    color: getRankColor(selection.rank),
                                  }}
                                >
                                  #{selection.rank}
                                </Text>
                              </View>
                            </View>

                            <View
                              style={{
                                width: 1,
                                alignSelf: 'stretch',
                                backgroundColor: c.border,
                                marginHorizontal: 12,
                              }}
                            />

                            <View style={{ flex: 1 }}>
                              <Text style={[themeStyles.summaryHeaderText, { marginBottom: 6 }]}>
                                {tr(language, 'OPTIMAL', 'OPTIMAL')}
                              </Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Image
                                  source={{ uri: getFlagUrl(optimal.cca3) }}
                                  style={{ width: 26, height: 18, borderRadius: 3, opacity: 0.85 }}
                                />
                                <Text
                                  style={{
                                    fontFamily: FONTS.mono,
                                    fontSize: 12,
                                    color: c.textMuted,
                                    flex: 1,
                                  }}
                                  numberOfLines={1}
                                >
                                  {optimalCountryName}
                                </Text>
                                <Text
                                  style={{
                                    fontFamily: FONTS.monoBold,
                                    fontSize: 16,
                                    color: c.textMuted,
                                  }}
                                >
                                  #{optimal.rank}
                                </Text>
                              </View>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>

                <View
                  style={{
                    flexDirection: 'row',
                    gap: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderTopWidth: 1,
                    borderTopColor: c.border,
                  }}
                >
                  {!reviewData && (isDaily ? (
                    <TouchableOpacity
                      style={[styles.playAgainBtn, { flex: 2, paddingVertical: 14, marginTop: 0 }]}
                      onPress={onShare}
                      {...a11yButton(tr(language, 'Partager', 'Share'))}
                    >
                      <Share2 color="#fff" size={20} {...a11yHidden} />
                      <Text style={[styles.playAgainText, { fontSize: 16 }]}>
                        {tr(language, 'PARTAGER', 'SHARE')}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.playAgainBtn, { flex: 2, paddingVertical: 14, marginTop: 0 }]}
                      onPress={initGame}
                      {...a11yButton(tr(language, 'Rejouer', 'Play again'))}
                    >
                      <RefreshCcw color="#fff" size={20} {...a11yHidden} />
                      <Text style={[styles.playAgainText, { fontSize: 16 }]}>
                        {tr(language, 'REJOUER', 'PLAY AGAIN')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={[
                      styles.playAgainBtn,
                      {
                        backgroundColor: c.border,
                        borderColor: c.border,
                        flex: 1,
                        paddingVertical: 14,
                        marginTop: 0,
                      },
                    ]}
                    onPress={onExit}
                    {...a11yButton(reviewData ? tr(language, 'Retour', 'Back') : tr(language, 'Menu', 'Menu'))}
                  >
                    {reviewData ? (
                      <ArrowLeft color="#fff" size={20} {...a11yHidden} />
                    ) : (
                      <Home color="#fff" size={20} {...a11yHidden} />
                    )}
                    <Text style={[styles.playAgainText, { fontSize: 16 }]}>
                      {reviewData ? tr(language, 'RETOUR', 'BACK') : 'MENU'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>

        <ThemeInfoModal
          theme={showThemeInfo}
          onClose={() => setShowThemeInfo(null)}
        />
    </SafeAreaView>
  );
}
