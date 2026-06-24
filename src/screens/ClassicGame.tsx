import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Text,
  TouchableOpacity,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Home, Info, Moon, RefreshCcw, Sun, Trophy } from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';

import type { Language, Match, Selection, SelectionMap, Theme } from '../types';
import { gameData } from '../data/gameData';
import { createSeededRng, seededShuffle } from '../lib/rng';
import { MISSING_RANK, SESSION_SIZE, solveOptimal } from '../lib/gameLogic';
import { track } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { getFlagUrl, prefetchFlags } from '../lib/flags';
import { getEfficiencyColor, getRankColor } from '../lib/ranks';
import { pickLabel, tr } from '../i18n';
import { commonStyles as styles } from '../theme/commonStyles';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { ThemeInfoModal } from '../components/ThemeInfoModal';

const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';

interface ClassicGameProps {
  isDarkMode: boolean;
  language: Language;
  user: User | null;
  matchData?: Match | null;
  onRoundComplete?: (score: number) => void;
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
  matchData,
  onRoundComplete,
  onExit,
  onToggleTheme,
  onToggleLanguage,
}: ClassicGameProps) {
  const c = getColors(isDarkMode);
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

  const rngRef = useRef<(() => number) | null>(null);

  useEffect(() => {
    if (matchData?.game_data?.seed) {
      const roundNumber = matchData.current_round ?? 1;
      rngRef.current = createSeededRng(matchData.game_data.seed + (roundNumber - 1));
    }
    initGame();
    if (!matchData) track('game_started', { mode: 'classic' });
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
    setUsedThemeIds([]);
    setSelections({});
    setOptimalSelections(solveOptimal(selectedThemes, selectedCountries, language));
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

        if (!matchData) track('game_completed', { mode: 'classic', score: gameEfficiency });

        if (user) {
          supabase
            .from('scores')
            .insert({ user_id: user.id, game_mode: 'classic', score: gameEfficiency })
            .then(({ error }) => {
              if (error) {
                console.error('Error saving classic efficiency:', error);
                Alert.alert(tr(language, 'Erreur', 'Error'), tr(language, "Impossible d'enregistrer ton score.", 'Could not save your score.'));
              }
            });
          // Solo coins (server-side daily cap, score-independent). Skip in matches.
          if (!matchData) {
            supabase.rpc('award_solo_coins', { p_game_mode: 'classic' }).then(({ error }) => {
              if (error) console.log('award_solo_coins error:', error);
            });
          }
        }

        if (matchData && onRoundComplete) {
          onRoundComplete(gameEfficiency);
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
                      backgroundColor: c.border,
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
                    onPress={onToggleTheme}
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
                  onPress={onToggleTheme}
                  style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 6 }]}
                >
                  {isDarkMode ? (
                    <Sun color={c.accent} size={16} />
                  ) : (
                    <Moon color={c.textMuted} size={16} />
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
                            : c.border,
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
                  <Trophy color={c.accent} size={48} />
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
                      <Text style={{ fontFamily: FONTS.mono, fontSize: 10, color: c.textMuted }}>
                        {tr(language, 'Optimal : ', 'Optimal: ')}
                        <Text style={{ fontFamily: FONTS.monoBold }}>{optimalTotalValue}</Text>
                      </Text>
                    </View>

                    <View
                      style={{
                        width: 1,
                        height: '80%',
                        backgroundColor: c.border,
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
                      <Text style={{ fontFamily: FONTS.mono, fontSize: 10, color: c.textMuted }}>
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
                              borderRadius: 10,
                              backgroundColor: c.surface,
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
                              borderRightColor: c.border,
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
                                  fontFamily: FONTS.heading,
                                  fontSize: 11,
                                  color: c.text,
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
                                style={{ fontFamily: FONTS.mono, fontSize: 10, color: c.textMuted }}
                                numberOfLines={1}
                              >
                                {optimalCountryName}
                              </Text>
                              <Text
                                style={{
                                  fontFamily: FONTS.monoBold,
                                  fontSize: 14,
                                  color: c.textMuted,
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
                        backgroundColor: c.border,
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
  );
}
