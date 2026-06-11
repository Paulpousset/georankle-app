import { useEffect, useState } from 'react';
import {
  Image,
  Platform,
  Text,
  TouchableOpacity,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Home, Info, Moon, RefreshCcw, Sun, Trophy } from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';

import type { Language, Selection, SelectionMap, Theme } from '../types';
import { gameData } from '../data/gameData';
import { supabase } from '../lib/supabase';
import { getFlagUrl } from '../lib/flags';
import { getEfficiencyColor, getRankColor } from '../lib/ranks';
import { pickLabel, tr } from '../i18n';
import { commonStyles as styles } from '../theme/commonStyles';
import { ThemeInfoModal } from '../components/ThemeInfoModal';

const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';

const SESSION_SIZE = 8;
/** Default rank used when a country has no value for a theme. */
const MISSING_RANK = 200;

interface ClassicGameProps {
  isDarkMode: boolean;
  language: Language;
  user: User | null;
  onExit: () => void;
  onToggleTheme: () => void;
  onToggleLanguage: () => void;
}

/**
 * Classic GeoRankle: assign each of 8 countries to the best remaining theme,
 * then compare your total against the optimal assignment.
 */
export function ClassicGame({
  isDarkMode,
  language,
  user,
  onExit,
  onToggleTheme,
  onToggleLanguage,
}: ClassicGameProps) {
  const [sessionThemes, setSessionThemes] = useState<Theme[]>([]);
  const [rounds, setRounds] = useState<typeof gameData.countries>([]);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [usedThemeIds, setUsedThemeIds] = useState<string[]>([]);
  const [selections, setSelections] = useState<SelectionMap>({});
  const [optimalSelections, setOptimalSelections] = useState<SelectionMap>({});
  const [showThemeInfo, setShowThemeInfo] = useState<Theme | null>(null);

  useEffect(() => {
    initGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) fetchUserBestScores(user.id);
    else setBestScore(null);
  }, [user]);

  const fetchUserBestScores = async (userId: string) => {
    const { data: scores } = await supabase
      .from('scores')
      .select('score')
      .eq('user_id', userId)
      .eq('game_mode', 'classic');

    if (scores && scores.length > 0) {
      // Older rows stored total ranks (usually > 100); keep only efficiency (%).
      const validScores = scores.map((s) => s.score).filter((s: number) => s <= 100);
      setBestScore(validScores.length > 0 ? Math.max(...validScores) : null);
    }
  };

  /**
   * Brute-force search (with branch-and-bound pruning) for the country→theme
   * assignment that minimizes the total rank.
   */
  const solveOptimal = (currentThemes: Theme[], currentRounds: typeof gameData.countries) => {
    if (currentThemes.length < SESSION_SIZE || currentRounds.length < SESSION_SIZE) return {};

    let bestMapping: SelectionMap = {};
    let minTotal = Infinity;

    const themeIds = currentThemes.map((t) => t.id);
    const matrix = currentRounds.map((country) =>
      themeIds.map((themeId) => country.ranks[themeId] || MISSING_RANK),
    );

    const solve = (
      countryIdx: number,
      usedThemes: number,
      currentSum: number,
      currentMapping: SelectionMap,
    ) => {
      if (countryIdx === SESSION_SIZE) {
        if (currentSum < minTotal) {
          minTotal = currentSum;
          bestMapping = { ...currentMapping };
        }
        return;
      }

      for (let themeIdx = 0; themeIdx < SESSION_SIZE; themeIdx++) {
        if (usedThemes & (1 << themeIdx)) continue;
        const rank = matrix[countryIdx][themeIdx];
        if (currentSum + rank >= minTotal) continue;

        const country = currentRounds[countryIdx];
        const nextMapping: SelectionMap = {
          ...currentMapping,
          [themeIds[themeIdx]]: {
            countryName: language === 'fr' ? country.name : country.name_en || country.name,
            rank,
            cca3: country.cca3,
          },
        };
        solve(countryIdx + 1, usedThemes | (1 << themeIdx), currentSum + rank, nextMapping);
      }
    };

    solve(0, 0, 0, {});
    return bestMapping;
  };

  const initGame = () => {
    // 1. Pick 8 themes that are present in a meaningful number of countries.
    const allThemeIds = Object.keys(gameData.themes).filter((themeId) => {
      const coverage = gameData.countries.filter(
        (c) => c.ranks && c.ranks[themeId] !== undefined,
      ).length;
      return coverage > 10;
    });
    const shuffledThemes = [...allThemeIds].sort(() => Math.random() - 0.5);
    const selectedThemes: Theme[] = shuffledThemes
      .slice(0, SESSION_SIZE)
      .map((id) => ({ id, ...gameData.themes[id] }));

    // 2. Pick 8 countries that have data for every selected theme.
    let countries = gameData.countries.filter((c) =>
      selectedThemes.every(
        (theme) =>
          c.ranks && c.ranks[theme.id] !== undefined && c.data && c.data[theme.id] !== undefined,
      ),
    );

    // Fallback: if too few countries cover all 8 themes, prefer the ones with
    // the most data available.
    if (countries.length < SESSION_SIZE) {
      console.warn('Not enough countries with all 8 themes, falling back...');
      countries = [...gameData.countries].sort(
        (a, b) => Object.keys(b.ranks).length - Object.keys(a.ranks).length,
      );
    }

    const selectedCountries = [...countries].sort(() => Math.random() - 0.5).slice(0, SESSION_SIZE);

    setSessionThemes(selectedThemes);
    setRounds(selectedCountries);
    setCurrentRoundIndex(0);
    setTotalScore(0);
    setGameOver(false);
    setUsedThemeIds([]);
    setSelections({});
    setOptimalSelections(solveOptimal(selectedThemes, selectedCountries));
  };

  const selectTheme = (themeId: string) => {
    if (gameOver || usedThemeIds.includes(themeId)) return;

    const country = rounds[currentRoundIndex];
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

        setBestScore((prev) => (prev === null || gameEfficiency > prev ? gameEfficiency : prev));

        if (user) {
          supabase
            .from('scores')
            .insert({ user_id: user.id, game_mode: 'classic', score: gameEfficiency })
            .then(({ error }) => {
              if (error) console.error('Error saving classic efficiency:', error);
            });
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
      <View style={[styles.container, !isDarkMode && styles.containerLight]}>
        <Text style={{ color: isDarkMode ? 'white' : 'black' }}>Chargement...</Text>
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
    <SafeAreaProvider>
      <SafeAreaView style={themeStyles.container}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />

        <View style={themeStyles.header}>
          {!isMobile ? (
            <>
              <TouchableOpacity
                onPress={onExit}
                style={[
                  styles.refreshBtn,
                  !isDarkMode && styles.refreshBtnLight,
                  {
                    padding: 8,
                    marginRight: 10,
                    backgroundColor: isDarkMode
                      ? 'rgba(16, 185, 129, 0.1)'
                      : 'rgba(16, 185, 129, 0.05)',
                  },
                ]}
              >
                <Home color="#10b981" size={20} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={themeStyles.title}>GeoRankle</Text>
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
                    <Text
                      style={[
                        themeStyles.statValue,
                        {
                          fontSize: 32,
                          color: getRankColor(totalScore / (currentRoundIndex || 1)),
                        },
                      ]}
                    >
                      {totalScore}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 1,
                      height: '60%',
                      backgroundColor: isDarkMode ? '#334155' : '#e2e8f0',
                      alignSelf: 'center',
                    }}
                  />
                  <View style={{ alignItems: 'center' }}>
                    <Text style={themeStyles.statLabel}>
                      {tr(language, 'EFFICACITÉ', 'EFFICIENCY')}
                    </Text>
                    <Text
                      style={[
                        themeStyles.statValue,
                        { fontSize: 32, color: getEfficiencyColor(currentEfficiency) },
                      ]}
                    >
                      {currentEfficiency}%
                    </Text>
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
                      { backgroundColor: isDarkMode ? '#334155' : '#e2e8f0' },
                    ]}
                  />
                  <View style={themeStyles.statBox}>
                    <Text style={themeStyles.statLabel}>BEST EFF</Text>
                    <Text
                      style={[
                        themeStyles.statValue,
                        { color: isDarkMode ? '#fbbf24' : '#d97706', fontSize: 18 },
                      ]}
                    >
                      {bestScore === null || bestScore > 100 ? '--' : `${bestScore}%`}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TouchableOpacity
                    onPress={onToggleTheme}
                    style={[
                      styles.refreshBtn,
                      !isDarkMode && styles.refreshBtnLight,
                      { padding: 6 },
                    ]}
                  >
                    {isDarkMode ? (
                      <Sun color="#fbbf24" size={16} />
                    ) : (
                      <Moon color="#64748b" size={16} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={onToggleLanguage}
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
                        color: isDarkMode ? '#fff' : '#1e293b',
                        fontWeight: 'bold',
                        fontSize: 13,
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
                  style={[
                    styles.refreshBtn,
                    !isDarkMode && styles.refreshBtnLight,
                    {
                      padding: 6,
                      marginRight: 8,
                      backgroundColor: isDarkMode
                        ? 'rgba(16, 185, 129, 0.1)'
                        : 'rgba(16, 185, 129, 0.05)',
                    },
                  ]}
                >
                  <Home color="#10b981" size={18} />
                </TouchableOpacity>
                <Text style={themeStyles.title}>GeoRankle</Text>
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
                      { backgroundColor: isDarkMode ? '#334155' : '#e2e8f0' },
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
                </View>

                <TouchableOpacity
                  onPress={onToggleTheme}
                  style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 6 }]}
                >
                  {isDarkMode ? (
                    <Sun color="#fbbf24" size={16} />
                  ) : (
                    <Moon color="#64748b" size={16} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onToggleLanguage}
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
                      color: isDarkMode ? '#fff' : '#1e293b',
                      fontWeight: 'bold',
                      fontSize: 12,
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
                          { fontSize: 13, color: isDarkMode ? '#94a3b8' : '#64748b' },
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

                  return (
                    <TouchableOpacity
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
                            : isDarkMode
                              ? '#334155'
                              : '#cbd5e1',
                        },
                      ]}
                      onPress={() => selectTheme(theme.id)}
                      disabled={isUsed}
                    >
                      <Text style={[styles.emoji, { fontSize: 20, marginRight: 10 }]}>
                        {theme.emoji}
                      </Text>
                      <Text
                        style={[themeStyles.themeLabel, { fontSize: 14, flex: 1 }]}
                        numberOfLines={1}
                      >
                        {pickLabel(theme.label, language)}
                      </Text>

                      <TouchableOpacity
                        onPress={(e: GestureResponderEvent) => {
                          e.stopPropagation();
                          setShowThemeInfo(theme);
                        }}
                        style={{ padding: 5 }}
                      >
                        <Info
                          size={16}
                          color={
                            isUsed
                              ? isDarkMode
                                ? '#475569'
                                : '#94a3b8'
                              : isDarkMode
                                ? '#94a3b8'
                                : '#64748b'
                          }
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
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={{ flex: 1, padding: 20, alignItems: 'center' }}>
              <View
                style={[
                  themeStyles.winCard,
                  {
                    flex: 1,
                    padding: 30,
                    justifyContent: 'space-between',
                    width: '100%',
                    maxWidth: 800,
                  },
                ]}
              >
                <View style={{ alignItems: 'center' }}>
                  <Trophy color="#fbbf24" size={48} />
                  <Text
                    style={[themeStyles.winTitle, { fontSize: 32, marginTop: 10, marginBottom: 5 }]}
                  >
                    {tr(language, 'SESSION TERMINÉE', 'SESSION FINISHED')}
                  </Text>

                  <View style={{ flexDirection: 'row', gap: 30, marginBottom: 20 }}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={[themeStyles.statLabel, { fontSize: 12 }]}>
                        {tr(language, 'SCORE TOTAL', 'TOTAL SCORE')}
                      </Text>
                      <Text
                        style={[
                          themeStyles.statValue,
                          { fontSize: 48, lineHeight: 48, color: getRankColor(totalScore / 8) },
                        ]}
                      >
                        {totalScore}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#64748b' }}>
                        {tr(language, 'Optimal : ', 'Optimal: ')}
                        <Text style={{ fontWeight: 'bold' }}>{optimalTotalValue}</Text>
                      </Text>
                    </View>

                    <View
                      style={{
                        width: 1,
                        height: '80%',
                        backgroundColor: isDarkMode ? '#334155' : '#e2e8f0',
                        alignSelf: 'center',
                      }}
                    />

                    <View style={{ alignItems: 'center' }}>
                      <Text style={[themeStyles.statLabel, { fontSize: 12 }]}>
                        {tr(language, 'EFFICACITÉ', 'EFFICIENCY')}
                      </Text>
                      <Text
                        style={[
                          themeStyles.statValue,
                          { fontSize: 48, lineHeight: 48, color: getEfficiencyColor(efficiency) },
                        ]}
                      >
                        {efficiency}%
                      </Text>
                      <Text style={{ fontSize: 12, color: '#64748b' }}>
                        {tr(language, 'Indice de perf', 'Perf index')}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={[styles.summaryTable, { flex: 1, marginVertical: 10 }]}>
                  <View style={[styles.summaryHeader, { marginBottom: 8, paddingHorizontal: 15 }]}>
                    <Text style={[themeStyles.summaryHeaderText, { flex: 1.5, fontSize: 12 }]}>
                      {tr(language, 'THÈME', 'THEME')}
                    </Text>
                    <Text style={[themeStyles.summaryHeaderText, { flex: 2.2, fontSize: 12 }]}>
                      {tr(language, 'VOTRE CHOIX', 'YOUR CHOICE')}
                    </Text>
                    <Text style={[themeStyles.summaryHeaderText, { flex: 2.2, fontSize: 12 }]}>
                      {tr(language, 'SCORE OPTIMAL', 'OPTIMAL SCORE')}
                    </Text>
                  </View>

                  <View style={{ flex: 1, gap: 4 }}>
                    {sessionThemes.map((theme) => {
                      const selection = selections[theme.id];
                      const optimal = optimalSelections[theme.id];
                      const optimalCountryName =
                        language === 'fr'
                          ? optimal.countryName
                          : gameData.countries.find((c) => c.cca3 === optimal.cca3)?.name_en ||
                            optimal.countryName;
                      return (
                        <View
                          key={theme.id}
                          style={[
                            themeStyles.summaryRow,
                            {
                              padding: 8,
                              borderRadius: 12,
                              backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f1f5f9',
                            },
                          ]}
                        >
                          <View
                            style={{
                              flex: 1.5,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <Text style={{ fontSize: 16 }}>{theme.emoji}</Text>
                            <Text
                              style={[themeStyles.rowThemeLabel, { fontSize: 12 }]}
                              numberOfLines={1}
                            >
                              {pickLabel(theme.label, language)}
                            </Text>
                          </View>

                          <View
                            style={{
                              flex: 2.2,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8,
                              borderRightWidth: 1,
                              borderRightColor: isDarkMode ? '#334155' : '#e2e8f0',
                              paddingRight: 8,
                            }}
                          >
                            <Image
                              source={{ uri: getFlagUrl(selection.cca3) }}
                              style={{ width: 24, height: 16, borderRadius: 3 }}
                            />
                            <View style={{ flex: 1 }}>
                              <Text
                                style={{
                                  fontSize: 11,
                                  color: isDarkMode ? '#f8fafc' : '#1e293b',
                                  fontWeight: '700',
                                }}
                                numberOfLines={1}
                              >
                                {selection.countryName}
                              </Text>
                              <Text
                                style={{
                                  fontSize: 14,
                                  fontWeight: '900',
                                  color: getRankColor(selection.rank),
                                  lineHeight: 16,
                                }}
                              >
                                #{selection.rank}
                              </Text>
                            </View>
                          </View>

                          <View
                            style={{
                              flex: 2.2,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8,
                              paddingLeft: 8,
                            }}
                          >
                            <Image
                              source={{ uri: getFlagUrl(optimal.cca3) }}
                              style={{ width: 24, height: 16, borderRadius: 3, opacity: 0.8 }}
                            />
                            <View style={{ flex: 1 }}>
                              <Text
                                style={{ fontSize: 11, color: '#64748b', fontWeight: '500' }}
                                numberOfLines={1}
                              >
                                {optimalCountryName}
                              </Text>
                              <Text
                                style={{
                                  fontSize: 14,
                                  fontWeight: '900',
                                  color: '#64748b',
                                  lineHeight: 16,
                                }}
                              >
                                #{optimal.rank}
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 15, width: '100%', marginTop: 10 }}>
                  <TouchableOpacity
                    style={[styles.playAgainBtn, { flex: 2, paddingVertical: 14 }]}
                    onPress={initGame}
                  >
                    <RefreshCcw color="#fff" size={20} />
                    <Text style={[styles.playAgainText, { fontSize: 16 }]}>
                      {tr(language, 'REJOUER', 'PLAY AGAIN')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.playAgainBtn,
                      {
                        backgroundColor: isDarkMode ? '#334155' : '#94a3b8',
                        flex: 1,
                        paddingVertical: 14,
                      },
                    ]}
                    onPress={onExit}
                  >
                    <Home color="#fff" size={20} />
                    <Text style={[styles.playAgainText, { fontSize: 16 }]}>MENU</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>

        <ThemeInfoModal
          theme={showThemeInfo}
          isDarkMode={isDarkMode}
          language={language}
          onClose={() => setShowThemeInfo(null)}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
