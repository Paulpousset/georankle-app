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
import { Home, Info, Moon, Sun, Trophy } from 'lucide-react-native';
import { ThemeIcon } from '../components/themeIcons';
import type { User } from '@supabase/supabase-js';

import type { Match, Selection, SelectionMap, Theme } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { gameData } from '../data/gameData';
import { createSeededRng, seededShuffle } from '../lib/rng';
import { THEME_POOL_LATEST, themePoolFor } from '../lib/themePool';
import { MISSING_RANK, SESSION_SIZE, solveOptimal } from '../lib/gameLogic';
import { normalizeRoundScore } from '../lib/score';
import { track } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { awardSoloCoins } from '../lib/coins';
import { earnsCoins, saveSoloScore } from '../lib/soloResult';
import { OffLeaderboardNotice } from '../components/OffLeaderboardNotice';
import { CountryFactCard } from '../components/CountryFactCard';
import { filterByContinent, type ContinentId } from '../data/continents';
import { useToast } from '../components/ToastProvider';
import { useCachedData } from '../lib/cache';
import { getFlagUrl, prefetchFlags } from '../lib/flags';
import { getEfficiencyColor, getRankColor } from '../lib/ranks';
import { pickLabel, tr } from '../i18n';
import { commonStyles as styles } from '../theme/commonStyles';
import { getColors, RANK_COLORS } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { ThemeInfoModal } from '../components/ThemeInfoModal';
import { a11yButton, announce, a11yHidden, ICON_HIT_SLOP } from '../lib/a11y';
import { ScoreText } from '../components/ScoreText';
import { SoloCoinReward } from '../components/SoloCoinReward';
import { SoloEndActions } from '../components/SoloEndActions';
import { PlayerGlobe } from '../components/PlayerGlobe';
import { useMyGameGlobe } from '../lib/myGlobe';
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
  /**
   * Daily/league: the puzzle's UTC date (`YYYY-MM-DD`). Freezes the theme pool
   * to the version in force that day, so two players on different app builds
   * draw the same 8 themes. Leave undefined for free solo play.
   */
  poolDate?: string;
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
    /**
   * Entraînement: no mistake ends the run, every answer is explained, and
   * nothing is recorded (no coins, no leaderboard).
   */
  training?: boolean;
/** Solo continent scope: narrows the 8-country session. Null = worldwide. */
  scope?: ContinentId | null;
}

/** Emoji cell for the share grid: how close a pick was to the optimal rank. */
function gridCell(mineRank: number, optimalRank: number): string {
  const diff = mineRank - optimalRank;
  if (diff <= 0) return '🟩';
  if (diff <= 10) return '🟨';
  return '🟥';
}

/**
 * Conteneur des 8 cartes de thème.
 *
 * Web grand écran : une simple View en deux colonnes — les 4 lignes tiennent
 * toujours, rien ne peut déborder sur la carte du pays.
 * Compact (natif + web mobile) : une ScrollView, parce que 8 cartes à hauteur
 * fixe dépassent l'écran d'un iPhone SE — sans elle la 8ᵉ carte est coupée.
 */
function ThemesGrid({
  wide,
  maxWidth,
  style,
  children,
}: {
  wide: boolean;
  maxWidth: number;
  style: React.ComponentProps<typeof View>['style'];
  children: React.ReactNode;
}) {
  if (wide) return <View style={style}>{children}</View>;
  return (
    <ScrollView
      style={{ flex: 1, width: '100%', maxWidth }}
      contentContainerStyle={style}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
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
  poolDate,
  onDailyComplete,
  isDaily,
  onShare,
  onSessionData,
  reviewData,
  scope = null,
  training = false,
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
  /** Country whose fact sheet is open from the end-of-game breakdown. */
  const [factsFor, setFactsFor] = useState<string | null>(null);
  const [coinsEarned, setCoinsEarned] = useState<number | null>(null);
  /** True when today's per-mode coin cap was already hit (no coins this time). */
  const [coinsCapped, setCoinsCapped] = useState(false);
  /** True when the coin award couldn't reach the server (queued for retry). */
  const [coinsSyncFailed, setCoinsSyncFailed] = useState(false);
  const { config: myGlobe } = useMyGameGlobe();
  const [usedThemeIds, setUsedThemeIds] = useState<string[]>([]);
  const [selections, setSelections] = useState<SelectionMap>(() => reviewData?.selections ?? {});
  const [optimalSelections, setOptimalSelections] = useState<SelectionMap>(() => reviewData?.optimalSelections ?? {});
  const [showThemeInfo, setShowThemeInfo] = useState<Theme | null>(null);

  const rngRef = useRef<(() => number) | null>(null);
  /**
   * Minuteries d'avancement de manche. ClassicGame était le SEUL écran de jeu à
   * ne pas les nettoyer (StreakGame, HigherLowerGame et VersusCapitals le font
   * tous). Or celle de 300 ms exécute toute la chaîne de fin de partie —
   * saveSoloScore, awardSoloCoins, onDailyComplete, setGameOver, track. Quitter
   * dans les 300 ms qui suivent le dernier thème faisait tourner tout ça sur un
   * composant démonté.
   */
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current != null) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  // Web grand écran : la colonne de jeu fait 900 px (DesktopStage), on y met
  // deux thèmes par ligne et on respire. Sur natif/mobile, rien ne change.
  const wide = !isMobile;
  /** Hauteur figée d'une carte de thème : la carte ne doit PAS grandir quand
   *  elle est choisie, sinon la colonne déborde sur la carte du pays. */
  const THEME_CARD_HEIGHT = wide ? 64 : 58;
  /** Largeur du bloc « pays attribué + rang », réservée dès le départ. */
  const SELECTION_SLOT_WIDTH = wide ? 96 : 76;
  /** Largeur utile de la colonne de jeu. */
  const CONTENT_MAX_WIDTH = wide ? 860 : 500;

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
      // Solo mode: randomise locally, within the continent scope when there is
      // one. A theme is only usable if enough of the *scoped* pool has a rank
      // for it — an absolute "> 10" would let a 35-country continent pick
      // themes barely anyone in it covers, and the 8-country session below
      // would then come up short.
      const pool = filterByContinent(gameData.countries, scope);
      const minCoverage = scope ? Math.max(3, Math.floor(pool.length / 4)) : 10;
      // The theme pool is FROZEN BY DATE for the daily and the league: it lives
      // in themePool.ts, not in Object.keys(gameData.themes), because that JSON
      // ships inside the binary. Shuffling 41 ids doesn't yield the same 8 as
      // shuffling 29, so deriving it from the bundle handed two players on
      // different app versions two different puzzles for the same day. Free
      // solo play compares to nobody and keeps the newest pool.
      const themePool = poolDate ? themePoolFor(poolDate) : THEME_POOL_LATEST;
      const allThemeIds = themePool.filter((themeId) => {
        const coverage = pool.filter((c) => c.ranks && c.ranks[themeId] !== undefined).length;
        return coverage > minCoverage;
      });
      const rand = rngRef.current ?? Math.random;
      selectedThemes = seededShuffle(allThemeIds, rand)
        .slice(0, SESSION_SIZE)
        .map((id) => ({ id, ...gameData.themes[id] }));
      let countries = pool.filter((c) =>
        selectedThemes.every(
          (theme) =>
            c.ranks && c.ranks[theme.id] !== undefined && c.data && c.data[theme.id] !== undefined,
        ),
      );
      if (countries.length < SESSION_SIZE) {
        // Rare draw where the 8 themes don't intersect on 8 countries: fall
        // back to the best-documented countries *of the same pool*, so a scoped
        // session never silently escapes its continent.
        countries = [...pool].sort(
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

  /**
   * Rejoue la session à l'identique : mêmes 8 pays, mêmes 8 thèmes, donc même
   * placement optimal — on ne touche qu'à la progression et au score. C'est la
   * seule façon de vérifier qu'on a compris son 62 % d'efficacité.
   */
  const replaySameGame = () => {
    setCurrentRoundIndex(0);
    setTotalScore(0);
    setGameOver(false);
    setCoinsEarned(null);
    setCoinsCapped(false);
    setCoinsSyncFailed(false);
    setUsedThemeIds([]);
    setSelections({});
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
      advanceTimerRef.current = setTimeout(
        () => setCurrentRoundIndex((prev) => prev + 1),
        300,
      );
    } else {
      advanceTimerRef.current = setTimeout(() => {
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

        if (!matchData) {
          track('game_completed', { mode: 'classic', score: gameEfficiency, scope: scope ?? 'world' });
        }

        if (user) {
          void saveSoloScore(user, 'classic', gameEfficiency, { scope, training }, () =>
            showAlert(tr(language, 'Erreur', 'Error'), tr(language, "Impossible d'enregistrer ton score.", 'Could not save your score.')),
          );
          // Solo coins (server-side daily cap; reward scales with performance).
          // Skip in matches. Failures are queued for retry on reconnect and
          // surfaced to the player instead of being swallowed by a console.log.
          if (!matchData) {
            if (earnsCoins({ training })) awardSoloCoins('classic', normalizeRoundScore('classic', gameEfficiency)).then((res) => {
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
    countryLabel: [styles.countryLabel, !isDarkMode && styles.countryLabelLight],
    countryName: [styles.countryName, !isDarkMode && styles.countryNameLight],
    instruction: [styles.instruction, !isDarkMode && styles.instructionLight],
    themeCard: (isUsed: boolean) => [
      styles.themeCard,
      !isDarkMode && styles.themeCardLight,
      isUsed && (isDarkMode ? styles.usedThemeCard : styles.usedThemeCardLight),
    ],
    themeLabel: [styles.themeLabel, !isDarkMode && styles.themeLabelLight],
    selectionCountry: [styles.selectionCountry, !isDarkMode && styles.selectionCountryLight],
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
              style={{
                flex: 1,
                paddingHorizontal: 15,
                paddingVertical: 10,
                alignItems: 'center',
                // Large : pays + grille forment un bloc centré (sinon la grille
                // se centre seule et laisse un trou sous la carte du pays).
                justifyContent: wide ? 'center' : 'flex-start',
              }}
            >
              {!isMobile ? (
                <View
                  style={[
                    styles.countryCard,
                    !isDarkMode && styles.countryCardLight,
                    {
                      padding: 15,
                      marginBottom: 14,
                      width: '100%',
                      maxWidth: CONTENT_MAX_WIDTH,
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

              <ThemesGrid
                wide={wide}
                maxWidth={CONTENT_MAX_WIDTH}
                style={[
                  styles.themesGrid,
                  {
                    width: '100%',
                    maxWidth: CONTENT_MAX_WIDTH,
                    gap: wide ? 12 : 6,
                    ...(wide
                      ? {
                          // Deux colonnes : 8 thèmes tiennent en 4 lignes, la
                          // colonne ne peut plus mordre sur la carte du pays.
                          flexDirection: 'row' as const,
                          flexWrap: 'wrap' as const,
                          justifyContent: 'space-between' as const,
                        }
                      : { justifyContent: 'flex-start' as const, paddingBottom: 8 }),
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
                          // Hauteur FIGÉE : la carte réserve dès le départ la place
                          // du pays attribué, elle ne grandit donc pas au clic.
                          height: THEME_CARD_HEIGHT,
                          width: wide ? '48.5%' : '100%',
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
                          <ThemeIcon id={theme.id} color={c.accent} size={wide ? 22 : 20} />
                        </View>
                        <Text
                          style={[themeStyles.themeLabel, { fontSize: wide ? 15 : 14, flex: 1 }]}
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

                      {/* Emplacement réservé en permanence (même vide) : c'est ce
                          qui empêche la carte de changer de gabarit au clic. */}
                      <View style={[styles.selectionInfo, { width: SELECTION_SLOT_WIDTH }]}>
                        {isUsed && (
                          <>
                            <Text
                              style={[themeStyles.selectionCountry, { fontSize: wide ? 11 : 10 }]}
                              numberOfLines={1}
                            >
                              {selection.countryName}
                            </Text>
                            <Text
                              style={[
                                styles.selectionRank,
                                { fontSize: wide ? 20 : 18, color: getRankColor(selection.rank) },
                              ]}
                            >
                              #{selection.rank}
                            </Text>
                          </>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ThemesGrid>
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
                    maxWidth: wide ? 868 : 800,
                    alignSelf: 'center',
                    // winCard centre ses enfants : sans ça le ScrollView se
                    // réduit à la largeur de son contenu (~500 px) et le récap
                    // reste étroit au milieu d'une carte large.
                    alignItems: 'stretch',
                  },
                ]}
              >
                <ScrollView
                  contentContainerStyle={{ padding: wide ? 26 : 20, paddingBottom: 16 }}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={{ alignItems: 'center', marginBottom: 18 }}>
                    {/* Le globe équipé ouvre l'écran de fin : c'est la vitrine
                        de ce qu'on achète en boutique. */}
                    {!reviewData && (
                      <PlayerGlobe
                        config={myGlobe}
                        size={wide ? 128 : 104}
                        accent={c.accent}
                        animate
                        style={{ marginBottom: 10 }}
                      />
                    )}
                    <Trophy color={c.accent} size={wide ? 52 : 44} {...a11yHidden} />
                    <ScoreText
                      style={[
                        themeStyles.winTitle,
                        { fontSize: wide ? 34 : 28, marginTop: 8, marginBottom: 16 },
                      ]}
                    >
                      {tr(language, 'SESSION TERMINÉE', 'SESSION FINISHED')}
                    </ScoreText>

                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        alignSelf: 'stretch',
                        // Large : les deux chiffres occupent la carte au lieu de
                        // se serrer au milieu d'un bloc de 868 px.
                        justifyContent: wide ? 'space-evenly' : 'center',
                        backgroundColor: c.surface,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: c.border,
                        paddingVertical: wide ? 20 : 16,
                        gap: wide ? 0 : 24,
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

                    {!isDaily && !matchData && (
                      <OffLeaderboardNotice run={{ scope, training }} color={c.textMuted} />
                    )}
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
                      { fontSize: wide ? 13 : 11, marginBottom: 10, marginLeft: 4 },
                    ]}
                  >
                    {tr(language, 'DÉTAIL PAR THÈME', 'BREAKDOWN BY THEME')}
                  </Text>

                  <View style={{ gap: wide ? 12 : 8 }}>
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
                            padding: wide ? 16 : 12,
                            borderLeftWidth: wide ? 5 : 4,
                            borderLeftColor: getRankColor(selection.rank),
                          }}
                        >
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8,
                              marginBottom: wide ? 12 : 10,
                            }}
                          >
                            <ThemeIcon id={theme.id} color={c.accent} size={wide ? 22 : 18} />
                            <Text
                              style={[
                                themeStyles.rowThemeLabel,
                                { fontSize: wide ? 18 : 15, flex: 1 },
                              ]}
                              numberOfLines={1}
                            >
                              {pickLabel(theme.label, language)}
                            </Text>
                            {/* Écart au choix optimal, lisible d'un coup d'œil. */}
                            <Text
                              style={{
                                fontFamily: FONTS.monoBold,
                                fontSize: wide ? 13 : 11,
                                color:
                                  selection.rank <= optimal.rank
                                    ? RANK_COLORS.excellent
                                    : c.textMuted,
                              }}
                            >
                              {selection.rank <= optimal.rank
                                ? tr(language, 'PARFAIT', 'PERFECT')
                                : `+${selection.rank - optimal.rank}`}
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[
                                  themeStyles.summaryHeaderText,
                                  { marginBottom: 6, fontSize: wide ? 12 : undefined },
                                ]}
                              >
                                {tr(language, 'VOTRE CHOIX', 'YOUR CHOICE')}
                              </Text>
                              <TouchableOpacity
                                onPress={() => setFactsFor(selection.cca3)}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: wide ? 12 : 8 }}
                                {...a11yButton(
                                  tr(language, 'Fiche du pays, votre choix', 'Country facts, your choice'),
                                  { hint: tr(language, 'Voir ses données', 'See its data') },
                                )}
                              >
                                <Image
                                  source={{ uri: getFlagUrl(selection.cca3) }}
                                  style={
                                    wide
                                      ? { width: 40, height: 27, borderRadius: 4 }
                                      : { width: 26, height: 18, borderRadius: 3 }
                                  }
                                />
                                <Text
                                  style={{
                                    fontFamily: FONTS.heading,
                                    fontSize: wide ? 18 : 13,
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
                                    fontSize: wide ? 24 : 16,
                                    color: getRankColor(selection.rank),
                                  }}
                                >
                                  #{selection.rank}
                                </Text>
                              </TouchableOpacity>
                            </View>

                            <View
                              style={{
                                width: 1,
                                alignSelf: 'stretch',
                                backgroundColor: c.border,
                                marginHorizontal: wide ? 20 : 12,
                              }}
                            />

                            <View style={{ flex: 1 }}>
                              <Text
                                style={[
                                  themeStyles.summaryHeaderText,
                                  { marginBottom: 6, fontSize: wide ? 12 : undefined },
                                ]}
                              >
                                {tr(language, 'MEILLEUR CHOIX', 'BEST PICK')}
                              </Text>
                              <TouchableOpacity
                                onPress={() => setFactsFor(optimal.cca3)}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: wide ? 12 : 8 }}
                                {...a11yButton(
                                  tr(language, 'Fiche du pays, meilleur choix', 'Country facts, best pick'),
                                  { hint: tr(language, 'Voir ses données', 'See its data') },
                                )}
                              >
                                <Image
                                  source={{ uri: getFlagUrl(optimal.cca3) }}
                                  style={
                                    wide
                                      ? { width: 40, height: 27, borderRadius: 4, opacity: 0.9 }
                                      : { width: 26, height: 18, borderRadius: 3, opacity: 0.85 }
                                  }
                                />
                                <Text
                                  style={{
                                    fontFamily: wide ? FONTS.heading : FONTS.mono,
                                    fontSize: wide ? 18 : 12,
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
                                    fontSize: wide ? 24 : 16,
                                    color: c.textMuted,
                                  }}
                                >
                                  #{optimal.rank}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>

                <CountryFactCard cca3={factsFor} onClose={() => setFactsFor(null)} />

                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderTopWidth: 1,
                    borderTopColor: c.border,
                  }}
                >
                  <SoloEndActions
                    onShare={!reviewData && isDaily ? onShare : undefined}
                    onReplaySame={reviewData || isDaily ? undefined : replaySameGame}
                    onNewGame={reviewData || isDaily ? undefined : initGame}
                    onMenu={onExit}
                    menuLabel={reviewData ? tr(language, 'Retour', 'Back') : undefined}
                  />
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
