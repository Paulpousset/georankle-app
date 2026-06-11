import { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  Appearance,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Trophy, RefreshCcw, Moon, Sun, Heart, TrendingUp, Home } from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';

import { gameData } from '../data/gameData';
import { supabase } from '../lib/supabase';
import { getFlagUrl } from '../lib/flags';
import type { GameMode, Language } from '../types';

const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';

interface ThemeOption {
  id: string;
  emoji?: string;
  label: { fr: string; en?: string };
  rank: number;
  [key: string]: any;
}

interface StreakGameProps {
  isDarkMode: boolean;
  setIsDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  setGameMode: (mode: GameMode) => void;
  language?: Language;
  setLanguage: React.Dispatch<React.SetStateAction<Language>>;
  user: User | null;
}

export default function StreakGame({
  isDarkMode,
  setIsDarkMode,
  setGameMode,
  language = 'fr',
  setLanguage,
  user,
}: StreakGameProps) {
  const [currentCountry, setCurrentCountry] = useState<any>(null);
  const [options, setOptions] = useState<ThemeOption[]>([]);
  const [bestStreak, setBestStreak] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [revealedRanks, setRevealedRanks] = useState<Record<string, number>>({});

  useEffect(() => {
    initRound();
    if (user) fetchUserBestStreak(user.id);
  }, [user]);

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
    // Pick a random country
    const countries = gameData.countries.filter(
      (c: any) => c.ranks && Object.keys(c.ranks).length >= 4,
    );
    const country = countries[Math.floor(Math.random() * countries.length)];

    // Pick 4 random themes available for this country
    const availableThemeIds = Object.keys(country.ranks);
    const shuffledThemeIds = availableThemeIds.sort(() => Math.random() - 0.5);
    const selectedThemeIds = shuffledThemeIds.slice(0, 4);

    const roundOptions = selectedThemeIds.map((id: string) => ({
      id,
      ...(gameData.themes as any)[id],
      rank: country.ranks[id],
    }));

    setCurrentCountry(country);
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
      setScore((prev) => prev + 1);
      setTimeout(() => {
        initRound();
      }, 1500);
    } else {
      setLastAnswerCorrect(false);
      setGameOver(true);
      if (score > bestStreak) setBestStreak(score);

      // Save score to Supabase if logged in
      if (user) {
        supabase
          .from('scores')
          .insert({
            user_id: user.id,
            game_mode: 'streak',
            score: score,
          })
          .then(({ error }) => {
            if (error) console.log('Error saving streak score:', error);
          });
      }
    }
  };

  const resetGame = () => {
    setScore(0);
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
    <SafeAreaProvider>
      <SafeAreaView style={themeStyles.container}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />

        <View style={themeStyles.header}>
          {!isMobile ? (
            <>
              <TouchableOpacity
                onPress={() => setGameMode('menu')}
                style={[
                  themeStyles.iconBtn,
                  { marginRight: 10, backgroundColor: 'rgba(16, 185, 129, 0.1)' },
                ]}
              >
                <Home color="#10b981" size={20} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={themeStyles.title}>GeoStreak</Text>
              </View>
              <View style={styles.statsContainer}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>STREAK</Text>
                  <Text style={styles.statValue}>{score}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>BEST</Text>
                  <Text style={[styles.statValue, { color: '#fbbf24' }]}>{bestStreak}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={() => setLanguage(language === 'fr' ? 'en' : 'fr')}
                  style={[themeStyles.iconBtn, { minWidth: 40, alignItems: 'center' }]}
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
                <TouchableOpacity
                  onPress={() => setIsDarkMode(!isDarkMode)}
                  style={themeStyles.iconBtn}
                >
                  {isDarkMode ? (
                    <Sun color="#fbbf24" size={20} />
                  ) : (
                    <Moon color="#64748b" size={20} />
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <TouchableOpacity
                  onPress={() => setGameMode('menu')}
                  style={[
                    themeStyles.iconBtn,
                    { marginRight: 8, backgroundColor: 'rgba(16, 185, 129, 0.1)' },
                  ]}
                >
                  <Home color="#10b981" size={18} />
                </TouchableOpacity>
                <Text style={themeStyles.title}>GeoStreak</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={styles.statsContainer}>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>STREAK</Text>
                    <Text style={styles.statValue}>{score}</Text>
                  </View>
                  <View
                    style={{
                      backgroundColor: isDarkMode ? '#334155' : '#e2e8f0',
                      width: 1,
                      height: 20,
                      marginHorizontal: 4,
                    }}
                  />
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>BEST</Text>
                    <Text style={[styles.statValue, { color: '#fbbf24' }]}>{bestStreak}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => setLanguage(language === 'fr' ? 'en' : 'fr')}
                  style={[themeStyles.iconBtn, { minWidth: 40, alignItems: 'center' }]}
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
                <TouchableOpacity
                  onPress={() => setIsDarkMode(!isDarkMode)}
                  style={themeStyles.iconBtn}
                >
                  {isDarkMode ? (
                    <Sun color="#fbbf24" size={18} />
                  ) : (
                    <Moon color="#64748b" size={18} />
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
                  backgroundColor: '#10b98120',
                  padding: 12,
                  borderRadius: 12,
                  marginBottom: 20,
                  borderLeftWidth: 4,
                  borderLeftColor: '#10b981',
                  width: '100%',
                  maxWidth: 700,
                }}
              >
                <Text
                  style={{
                    color: isDarkMode ? '#f8fafc' : '#065f46',
                    fontSize: 17,
                    fontWeight: '600',
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
                <Text style={[styles.countryName, !isDarkMode && { color: '#1e293b' }]}>
                  {language === 'fr'
                    ? currentCountry.name
                    : currentCountry.name_en || currentCountry.name}
                </Text>
                <Text style={styles.instruction}>
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
                  backgroundColor: '#10b98120',
                  padding: 8,
                  borderRadius: 10,
                  marginBottom: 12,
                  borderLeftWidth: 4,
                  borderLeftColor: '#10b981',
                  width: '100%',
                  maxWidth: 700,
                }}
              >
                <Text
                  style={{
                    color: isDarkMode ? '#f8fafc' : '#065f46',
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
                        !isDarkMode && { color: '#1e293b' },
                        { fontSize: 24, textAlign: 'left' },
                      ]}
                    >
                      {language === 'fr'
                        ? currentCountry.name
                        : currentCountry.name_en || currentCountry.name}
                    </Text>
                    <Text style={[styles.instruction, { marginTop: 2, fontSize: 12 }]}>
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
              >
                <Text style={styles.emoji}>{theme.emoji}</Text>
                <Text
                  style={[styles.themeLabel, !isDarkMode && { color: '#1e293b' }]}
                  numberOfLines={2}
                >
                  {language === 'fr' ? theme.label.fr : theme.label.en || theme.label.fr}
                </Text>
                {revealedRanks[theme.id] !== undefined && (
                  <Text style={styles.rankText}>#{revealedRanks[theme.id]}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {gameOver && (
            <View style={styles.gameOverOverlay}>
              <Text style={styles.gameOverTitle}>{language === 'fr' ? 'PERDU !' : 'LOST!'}</Text>
              <Text style={styles.gameOverScore}>
                {language === 'fr' ? 'Score final : ' : 'Final score: '}
                {score}
              </Text>
              <TouchableOpacity style={styles.resetBtn} onPress={resetGame}>
                <RefreshCcw color="#fff" size={20} />
                <Text style={styles.resetBtnText}>
                  {language === 'fr' ? 'RECOMMENCER' : 'RETRY'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', userSelect: 'none' },
  containerLight: { backgroundColor: '#f8fafc' },
  header: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    minHeight: 60,
  },
  headerLight: { backgroundColor: '#fff', borderBottomColor: '#e2e8f0' },
  title: { fontSize: 18, fontWeight: '900', color: '#f8fafc' },
  titleLight: { color: '#1e293b' },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginRight: 5,
  },
  statBox: { alignItems: 'center', paddingHorizontal: 4 },
  statLabel: { fontSize: 7, color: '#64748b', fontWeight: 'bold' },
  statValue: { fontSize: 16, color: '#10b981', fontWeight: '900' },
  iconBtn: { padding: 6, backgroundColor: '#1e293b', borderRadius: 10 },
  iconBtnLight: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  gameArea: {
    flex: 1,
    padding: 16,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 20,
  },
  card: {
    backgroundColor: '#1e293b',
    padding: 25,
    borderRadius: 24,
    alignItems: 'center',
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#334155',
    width: '100%',
    maxWidth: 700,
  },
  cardLight: {
    backgroundColor: '#fff',
    borderColor: '#e2e8f0',
    boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.05)',
  },
  flag: { width: 120, height: 80, borderRadius: 12, marginBottom: 15 },
  countryName: { fontSize: 32, fontWeight: '900', color: '#f8fafc', textAlign: 'center' },
  instruction: { color: '#64748b', fontSize: 14, marginTop: 10 },
  optionsGrid: { gap: 10, width: '100%', maxWidth: 700 },
  themeBtn: {
    backgroundColor: '#1e293b',
    padding: 18,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  themeBtnLight: {
    backgroundColor: '#fff',
    borderColor: '#e2e8f0',
    boxShadow: '0px 2px 5px rgba(0, 0, 0, 0.05)',
  },
  correctBtn: { borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)' },
  wrongBtn: { borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' },
  emoji: { fontSize: 24, marginRight: 15 },
  themeLabel: { color: '#f8fafc', fontSize: 16, fontWeight: '600', flex: 1 },
  rankText: { fontSize: 20, fontWeight: '900', color: '#38bdf8' },
  gameOverOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 24,
    padding: 20,
  },
  gameOverTitle: { fontSize: 48, fontWeight: '900', color: '#ef4444', marginBottom: 10 },
  gameOverScore: { fontSize: 24, color: '#f8fafc', marginBottom: 30 },
  resetBtn: {
    backgroundColor: '#10b981',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resetBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
