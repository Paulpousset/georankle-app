import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  Platform,
  FlatList,
  TextInput,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Home, Trophy, Search, XCircle, CheckCircle, RefreshCcw } from 'lucide-react-native';
import Fuse from 'fuse.js';

import gameData from '../../assets/game_data.json';
import countriesStats from '../../assets/countries_stats.json';
import { getFlagUrl } from '../lib/flags';
import type { Language } from '../types';

interface GuessCountryGameProps {
  isDarkMode: boolean;
  language?: Language;
  onBackToMenu: () => void;
}

type Clue = any;
type Country = any;
type Guess = { country: Country; isCorrect: boolean };
type GameState = 'playing' | 'won' | 'lost';

// Define difficulty for each clue type
const CLUE_DIFFICULTY: Record<string, { level: string; type: string; icon?: string }> = {
  flag: { level: 'easy', type: 'visual' },
  capital: { level: 'easy', type: 'text', icon: '🏛️' },
  region: { level: 'easy', type: 'text', icon: '🌍' },

  population: { level: 'medium', type: 'theme' },
  area: { level: 'medium', type: 'theme' },
  forest_area: { level: 'medium', type: 'theme' },
  urban_population: { level: 'medium', type: 'theme' },

  gdp: { level: 'hard', type: 'theme' },
  gdp_per_capita: { level: 'hard', type: 'theme' },
  access_to_electricity: { level: 'hard', type: 'theme' },
  fertility_rate: { level: 'hard', type: 'theme' },
  life_expectancy: { level: 'hard', type: 'theme' },
  military_expenditure: { level: 'hard', type: 'theme' },
  obesity_rate: { level: 'hard', type: 'theme' },
  internet_users: { level: 'hard', type: 'theme' },
  inflation: { level: 'hard', type: 'theme' },
};

export default function GuessCountryGame({
  isDarkMode,
  language = 'fr',
  onBackToMenu,
}: GuessCountryGameProps) {
  const [targetCountry, setTargetCountry] = useState<Country | null>(null);
  const [clues, setClues] = useState<Clue[]>([]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filteredCountries, setFilteredCountries] = useState<Country[]>([]);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [gameState, setGameState] = useState<GameState>('playing'); // playing, won, lost
  const [score, setScore] = useState<number>(0);

  const fuse = React.useMemo(
    () =>
      new Fuse((gameData as any).countries, {
        keys: ['name', 'name_en'],
        threshold: 0.3,
      }),
    [],
  );

  useEffect(() => {
    generateNewRound();
  }, []);

  const generateNewRound = () => {
    // 1. Pick a random country
    const randomCountryIndex = Math.floor(Math.random() * (gameData as any).countries.length);
    const country = (gameData as any).countries[randomCountryIndex];
    setTargetCountry(country);

    // Find matching stats
    const stats: any = (countriesStats as any).find((c: any) => c.cca3 === country.cca3) || {};

    let selectedClues: Clue[] = [];

    // Easy Clue (Flag, Capital, or Region)
    const easyTypes = ['flag', 'capital', 'region'];
    const easyType = easyTypes[Math.floor(Math.random() * easyTypes.length)];
    if (easyType === 'flag') {
      selectedClues.push({ difficulty: 'easy', type: 'flag', value: getFlagUrl(country.cca3) });
    } else if (easyType === 'capital' && stats.capital) {
      selectedClues.push({
        difficulty: 'easy',
        type: 'text',
        label: language === 'fr' ? 'Capitale' : 'Capital',
        value: stats.capital,
        icon: '🏛️',
      });
    } else if (easyType === 'region' && stats.region) {
      selectedClues.push({
        difficulty: 'easy',
        type: 'text',
        label: language === 'fr' ? 'Région' : 'Region',
        value: `${stats.region} (${stats.subregion})`,
        icon: '🌍',
      });
    } else {
      selectedClues.push({ difficulty: 'easy', type: 'flag', value: getFlagUrl(country.cca3) });
    }

    // Medium Clue
    const mediumThemes = Object.keys(CLUE_DIFFICULTY).filter(
      (k) => CLUE_DIFFICULTY[k].level === 'medium',
    );
    const availableMedium = mediumThemes.filter((t) => country.data[t]);
    if (availableMedium.length > 0) {
      const medTheme = availableMedium[Math.floor(Math.random() * availableMedium.length)];
      selectedClues.push({
        difficulty: 'medium',
        type: 'theme',
        id: medTheme,
        value:
          language === 'fr' ? country.data[medTheme].display_fr : country.data[medTheme].display_en,
      });
    }

    // Hard Clue
    const hardThemes = Object.keys(CLUE_DIFFICULTY).filter(
      (k) => CLUE_DIFFICULTY[k].level === 'hard',
    );
    const availableHard = hardThemes.filter((t) => country.data[t]);
    if (availableHard.length > 0) {
      const hardTheme = availableHard[Math.floor(Math.random() * availableHard.length)];
      selectedClues.push({
        difficulty: 'hard',
        type: 'theme',
        id: hardTheme,
        value:
          language === 'fr'
            ? country.data[hardTheme].display_fr
            : country.data[hardTheme].display_en,
      });
    }

    selectedClues = selectedClues.sort(() => Math.random() - 0.5);

    setClues(selectedClues);
    setGuesses([]);
    setGameState('playing');
    setSearchQuery('');
    setFilteredCountries([]);
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (text.length > 1) {
      const results = fuse.search(text);
      setFilteredCountries(results.map((r) => r.item).slice(0, 5));
    } else {
      setFilteredCountries([]);
    }
  };

  const handleGuess = (guessedCountry: Country) => {
    if (gameState !== 'playing') return;

    const isCorrect = guessedCountry.cca3 === targetCountry.cca3;
    const newGuesses = [...guesses, { country: guessedCountry, isCorrect }];
    setGuesses(newGuesses);
    setSearchQuery('');
    setFilteredCountries([]);

    if (isCorrect) {
      setGameState('won');
      setScore(score + 1);
    } else if (newGuesses.length >= 3) {
      setGameState('lost');
    }
  };

  const getDifficultyColor = (diff: string) => {
    if (diff === 'easy') return '#10B981';
    if (diff === 'medium') return '#F59E0B';
    if (diff === 'hard') return '#EF4444';
    return '#64748B';
  };

  const getDifficultyLabel = (diff: string) => {
    if (language === 'fr') {
      return diff === 'easy' ? 'Facile' : diff === 'medium' ? 'Moyen' : 'Difficile';
    }
    return diff === 'easy' ? 'Easy' : diff === 'medium' ? 'Medium' : 'Hard';
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, !isDarkMode && styles.containerLight]}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />

        {/* Header */}
        <View style={[styles.header, !isDarkMode && styles.headerLight]}>
          <TouchableOpacity
            onPress={onBackToMenu}
            style={[styles.iconButton, !isDarkMode && styles.iconButtonLight]}
          >
            <Home color={isDarkMode ? '#f8fafc' : '#1e293b'} size={24} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, !isDarkMode && styles.headerTitleLight]}>
            {language === 'fr' ? 'Devinez le Pays' : 'Guess the Country'}
          </Text>
          <View style={styles.scoreContainer}>
            <Trophy color="#fbbf24" size={20} />
            <Text style={[styles.scoreText, !isDarkMode && styles.scoreTextLight]}>{score}</Text>
          </View>
        </View>

        <View style={styles.content}>
          <Text style={[styles.instructionText, !isDarkMode && styles.instructionTextLight]}>
            {language === 'fr'
              ? 'Trouvez le pays en utilisant ces indices (3 essais) :'
              : 'Find the country using these clues (3 tries):'}
          </Text>

          {/* Clues */}
          <View style={styles.cluesContainer}>
            {clues.map((clue, index) => (
              <View key={index} style={[styles.clueCard, !isDarkMode && styles.clueCardLight]}>
                <View
                  style={[
                    styles.difficultyBadge,
                    { backgroundColor: getDifficultyColor(clue.difficulty) },
                  ]}
                >
                  <Text style={styles.difficultyText}>{getDifficultyLabel(clue.difficulty)}</Text>
                </View>

                <View style={styles.clueContent}>
                  {clue.type === 'flag' ? (
                    <Image source={{ uri: clue.value }} style={styles.flagImage} />
                  ) : clue.type === 'text' ? (
                    <Text style={[styles.clueText, !isDarkMode && styles.clueTextLight]}>
                      {clue.icon} {clue.label} : {clue.value}
                    </Text>
                  ) : (
                    <Text style={[styles.clueText, !isDarkMode && styles.clueTextLight]}>
                      {clue.value}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>

          {/* Game Status */}
          {gameState !== 'playing' && (
            <View style={styles.resultContainer}>
              <Text
                style={[styles.resultTitle, { color: gameState === 'won' ? '#10B981' : '#EF4444' }]}
              >
                {gameState === 'won'
                  ? language === 'fr'
                    ? 'Bravo !'
                    : 'You won!'
                  : language === 'fr'
                    ? 'Perdu !'
                    : 'Game Over!'}
              </Text>
              <Text style={[styles.resultAnswer, !isDarkMode && styles.resultAnswerLight]}>
                {language === 'fr' ? "C'était :" : 'It was:'}{' '}
                {language === 'fr' ? targetCountry?.name : targetCountry?.name_en}
              </Text>
              <Image source={{ uri: getFlagUrl(targetCountry?.cca3) }} style={styles.resultFlag} />

              <TouchableOpacity style={styles.playAgainBtn} onPress={generateNewRound}>
                <RefreshCcw color="#fff" size={20} />
                <Text style={styles.playAgainText}>
                  {language === 'fr' ? 'Rejouer' : 'Play Again'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Input & Autocomplete */}
          {gameState === 'playing' && (
            <View style={styles.searchContainer}>
              <View style={styles.searchBox}>
                <Search color="#64748b" size={20} style={{ marginLeft: 15 }} />
                <TextInput
                  style={[styles.searchInput, !isDarkMode && styles.searchInputLight]}
                  placeholder={
                    language === 'fr'
                      ? `Votre essai (${3 - guesses.length} restants)...`
                      : `Your guess (${3 - guesses.length} left)...`
                  }
                  placeholderTextColor="#64748b"
                  value={searchQuery}
                  onChangeText={handleSearch}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => handleSearch('')} style={{ padding: 15 }}>
                    <XCircle color="#64748b" size={20} />
                  </TouchableOpacity>
                )}
              </View>

              {filteredCountries.length > 0 && (
                <View
                  style={[
                    styles.suggestionsContainer,
                    !isDarkMode && styles.suggestionsContainerLight,
                  ]}
                >
                  {filteredCountries.map((c, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[
                        styles.suggestionItem,
                        !isDarkMode && styles.suggestionItemLight,
                        i !== filteredCountries.length - 1 && styles.suggestionBorder,
                      ]}
                      onPress={() => handleGuess(c)}
                    >
                      <Image source={{ uri: getFlagUrl(c.cca3) }} style={styles.suggestionFlag} />
                      <Text
                        style={[styles.suggestionText, !isDarkMode && styles.suggestionTextLight]}
                      >
                        {language === 'fr' ? c.name : c.name_en}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Previous Guesses */}
          <View style={styles.guessesContainer}>
            {guesses.map((g, i) => (
              <View
                key={i}
                style={[
                  styles.guessCard,
                  !isDarkMode && styles.guessCardLight,
                  { borderColor: g.isCorrect ? '#10B981' : '#EF4444' },
                ]}
              >
                {g.isCorrect ? (
                  <CheckCircle color="#10B981" size={24} />
                ) : (
                  <XCircle color="#EF4444" size={24} />
                )}
                <Text style={[styles.guessText, !isDarkMode && styles.guessTextLight]}>
                  {language === 'fr' ? g.country.name : g.country.name_en}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  containerLight: { backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerLight: { backgroundColor: '#fff', borderBottomColor: '#e2e8f0' },
  iconButton: { padding: 10, backgroundColor: '#334155', borderRadius: 12 },
  iconButtonLight: { backgroundColor: '#f1f5f9' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#f8fafc' },
  headerTitleLight: { color: '#1e293b' },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  scoreText: { color: '#fbbf24', fontWeight: 'bold', fontSize: 18 },
  scoreTextLight: { color: '#d97706' },
  content: { flex: 1, padding: 20 },
  instructionText: { color: '#94a3b8', fontSize: 16, marginBottom: 20, textAlign: 'center' },
  instructionTextLight: { color: '#475569' },
  cluesContainer: { gap: 15, marginBottom: 30 },
  clueCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    minHeight: 90,
    justifyContent: 'center',
  },
  clueCardLight: { backgroundColor: '#fff', borderColor: '#e2e8f0' },
  difficultyBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomRightRadius: 12,
  },
  difficultyText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  clueContent: { marginTop: 10, width: '100%', alignItems: 'center' },
  flagImage: { width: 80, height: 50, borderRadius: 4, resizeMode: 'cover' },
  clueText: { fontSize: 16, fontWeight: '600', color: '#f8fafc', textAlign: 'center' },
  clueTextLight: { color: '#1e293b' },
  searchContainer: { zIndex: 10 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  searchInput: { flex: 1, padding: 15, color: '#f8fafc', fontSize: 16 },
  searchInputLight: { color: '#1e293b' },
  suggestionsContainer: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  suggestionsContainerLight: { backgroundColor: '#fff', borderColor: '#e2e8f0' },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', padding: 15, gap: 15 },
  suggestionBorder: { borderBottomWidth: 1, borderBottomColor: '#334155' },
  suggestionItemLight: { borderBottomColor: '#e2e8f0' },
  suggestionFlag: { width: 30, height: 20, borderRadius: 2 },
  suggestionText: { color: '#f8fafc', fontSize: 16, fontWeight: '500' },
  suggestionTextLight: { color: '#1e293b' },
  guessesContainer: { marginTop: 20, gap: 10 },
  guessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 15,
    borderRadius: 12,
    gap: 15,
    borderWidth: 1,
  },
  guessCardLight: { backgroundColor: '#fff' },
  guessText: { color: '#f8fafc', fontSize: 16, fontWeight: 'bold' },
  guessTextLight: { color: '#1e293b' },
  resultContainer: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  resultTitle: { fontSize: 28, fontWeight: 'bold', marginBottom: 10 },
  resultAnswer: { fontSize: 18, color: '#94a3b8', marginBottom: 15 },
  resultAnswerLight: { color: '#475569' },
  resultFlag: { width: 120, height: 80, borderRadius: 8, marginBottom: 20 },
  playAgainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 12,
    gap: 10,
  },
  playAgainText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
