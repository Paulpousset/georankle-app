import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  Home,
  Users,
  Trophy,
  Timer,
  CheckCircle,
  HelpCircle,
  Eye,
  Moon,
  Sun,
} from 'lucide-react-native';
import Fuse from 'fuse.js';

import { getFlagUrl } from '../lib/flags';
import type { GameMode, Language } from '../types';
import countriesStats from '../../assets/countries_stats.json';

const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';

interface VersusCapitalsProps {
  isDarkMode: boolean;
  setIsDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  setGameMode: (mode: GameMode) => void;
  language: Language;
}

interface Option {
  id: string;
  name: string;
}

interface OptionsState {
  carre: Option[];
  duo: Option[];
}

interface Feedback {
  correct: boolean;
  selectedId?: string;
  mode: string;
  points: number;
  answer: string;
}

type ScoreMap = { [key: number]: number };

export default function VersusCapitals({
  isDarkMode,
  setIsDarkMode,
  setGameMode,
  language,
}: VersusCapitalsProps) {
  const [numPlayers, setNumPlayers] = useState<number | null>(null); // null, 2, or 3
  const [gameType, setGameType] = useState<string>('CAPITAL'); // 'CAPITAL', 'FLAG', or 'MIX'
  const [currentQuestionType, setCurrentQuestionType] = useState<string>('CAPITAL'); // Resolved type for current question
  const [totalRounds, setTotalRounds] = useState<number>(5); // Default 5 turns per match
  const [matchFormat, setMatchFormat] = useState<number>(1); // 1 = BO1, 3 = BO3, 5 = BO5 etc.
  const [matchScores, setMatchScores] = useState<ScoreMap>({ 1: 0, 2: 0, 3: 0, 4: 0 }); // Global sets won

  const [currentPlayer, setCurrentPlayer] = useState<number>(1);
  const [scores, setScores] = useState<ScoreMap>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [question, setQuestion] = useState<any>(null);
  const [options, setOptions] = useState<OptionsState | any[]>([]);
  const [mode, setMode] = useState<string | null>(null); // 'DUO', 'CARRE', 'CASH'
  const [cashInput, setCashInput] = useState<string>('');
  const [usedCountries, setUsedCountries] = useState<Set<string>>(new Set());
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [matchOver, setMatchOver] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [winner, setWinner] = useState<number | null>(null); // Winner of current set
  const [matchWinner, setMatchWinner] = useState<number | null>(null); // Winner of global match

  useEffect(() => {
    if (numPlayers) {
      initRound();
    }
  }, [currentRound, currentPlayer, numPlayers]);

  const initRound = () => {
    if (gameOver) return;

    let activeType = gameType;
    if (gameType === 'MIX') {
      const setsPlayed = matchScores[1] + matchScores[2] + matchScores[3];
      activeType = setsPlayed % 2 === 0 ? 'CAPITAL' : 'FLAG';
    }
    setCurrentQuestionType(activeType);

    // Pick a random country not used in this game
    const availableCountries = countriesStats.filter(
      (c: any) => !usedCountries.has(c.cca3) && c.capital !== 'N/A',
    );

    // Fallback if we ran out (shouldn't happen with 10 rounds)
    const sourceList = availableCountries.length > 0 ? availableCountries : countriesStats;
    const country = sourceList[Math.floor(Math.random() * sourceList.length)];

    setUsedCountries((prev) => new Set([...prev, country.cca3]));

    // Preparations for Duo/Carre
    const wrs = countriesStats
      .filter(
        (c: any) =>
          c.cca3 !== country.cca3 &&
          (activeType === 'CAPITAL' ? c.capital !== country.capital : true) &&
          c.capital !== 'N/A',
      )
      .sort(() => Math.random() - 0.5);

    const getOptionName = (c: any) => {
      if (activeType === 'CAPITAL') return c.capital;
      return language === 'fr' ? c.name : c.name_en || c.name;
    };

    const carreOptions = [
      { id: 'correct', name: getOptionName(country) },
      ...wrs
        .slice(0, 3)
        .map((w: any, idx: number) => ({ id: `wrong-${idx}`, name: getOptionName(w) })),
    ].sort(() => Math.random() - 0.5);

    const duoOptions = [
      { id: 'correct', name: getOptionName(country) },
      { id: 'wrong-0', name: getOptionName(wrs[0]) },
    ].sort(() => Math.random() - 0.5);

    setQuestion(country);
    setOptions({ carre: carreOptions, duo: duoOptions });
    setFeedback(null);
    setMode(null);
    setCashInput('');
  };

  const handleAnswer = (option: Option, selectedMode: string) => {
    if (feedback) return;

    const isCorrect = option.id === 'correct';
    const points = selectedMode === 'CASH' ? 5 : selectedMode === 'CARRE' ? 3 : 1;
    const correctAnswer =
      currentQuestionType === 'CAPITAL'
        ? question.capital
        : language === 'fr'
          ? question.name
          : question.name_en || question.name;
    setFeedback({
      correct: isCorrect,
      selectedId: option.id,
      mode: selectedMode,
      points: points,
      answer: correctAnswer,
    });

    if (isCorrect) {
      setScores((prev) => ({ ...prev, [currentPlayer]: prev[currentPlayer] + points }));
    }

    proceedNext();
  };

  const handleCashSubmit = () => {
    if (feedback || !cashInput.trim()) return;

    // Configuration de Fuse.js pour du fuzzy matching
    const fuse = new Fuse([question], {
      keys: [
        currentQuestionType === 'CAPITAL' ? 'capital' : language === 'fr' ? 'name' : 'name_en',
      ],
      threshold: 0.35,
      ignoreLocation: true,
      includeScore: true,
    });

    const results = fuse.search(cashInput);
    const isCorrect = results.length > 0;
    const points = 5;
    const correctAnswer =
      currentQuestionType === 'CAPITAL'
        ? question.capital
        : language === 'fr'
          ? question.name
          : question.name_en || question.name;

    setFeedback({ correct: isCorrect, mode: 'CASH', answer: correctAnswer, points: points });

    if (isCorrect) {
      setScores((prev) => ({ ...prev, [currentPlayer]: prev[currentPlayer] + points }));
    }

    proceedNext();
  };

  const togglePoints = () => {
    if (!feedback) return;

    const wasCorrect = feedback.correct;
    const points = feedback.points;

    setFeedback((prev) => (prev ? { ...prev, correct: !wasCorrect } : prev));

    if (wasCorrect) {
      // Was correct, now wrong -> subtract points
      setScores((prev) => ({ ...prev, [currentPlayer]: prev[currentPlayer] - points }));
    } else {
      // Was wrong, now correct -> add points
      setScores((prev) => ({ ...prev, [currentPlayer]: prev[currentPlayer] + points }));
    }
  };

  const proceedNext = () => {
    setTimeout(() => {
      if (currentPlayer === numPlayers) {
        if (currentRound >= totalRounds) {
          // Finale
          setGameOver(true);
        } else {
          setCurrentRound((prev) => prev + 1);
          setCurrentPlayer(1);
        }
      } else {
        setCurrentPlayer((prev) => prev + 1);
      }
    }, 2000);
  };

  useEffect(() => {
    if (gameOver && !matchOver) {
      let bestScore = -1;
      let winners: number[] = [];
      for (let i = 1; i <= numPlayers!; i++) {
        if (scores[i] > bestScore) {
          bestScore = scores[i];
          winners = [i];
        } else if (scores[i] === bestScore) {
          winners.push(i);
        }
      }

      const roundWinner = winners.length === 1 ? winners[0] : 0;
      setWinner(roundWinner);

      if (roundWinner !== 0) {
        // Update Match Score
        const newMatchScores = { ...matchScores, [roundWinner]: matchScores[roundWinner] + 1 };
        setMatchScores(newMatchScores);

        // Check if someone won the match (Best of X means first to ceil(X/2))
        const winsNeeded = Math.ceil(matchFormat / 2);
        if (newMatchScores[roundWinner] >= winsNeeded) {
          setMatchWinner(roundWinner);
          setMatchOver(true);
        }
      }
    }
  }, [gameOver]);

  const nextSet = () => {
    setScores({ 1: 0, 2: 0, 3: 0 });
    setCurrentRound(1);
    setCurrentPlayer(1);
    // Note: Used countries are intentionally NOT reset to avoid duplicates in the same match
    setGameOver(false);
    setWinner(null);
    setFeedback(null);
  };

  const resetMatch = () => {
    setScores({ 1: 0, 2: 0, 3: 0, 4: 0 });
    setMatchScores({ 1: 0, 2: 0, 3: 0, 4: 0 });
    setCurrentRound(1);
    setCurrentPlayer(1);
    setUsedCountries(new Set());
    setGameOver(false);
    setMatchOver(false);
    setWinner(null);
    setMatchWinner(null);
    setFeedback(null);
  };

  const quitToMenu = () => {
    resetMatch();
    setNumPlayers(null);
  };

  const playerColor =
    currentPlayer === 1
      ? '#3b82f6'
      : currentPlayer === 2
        ? '#ef4444'
        : currentPlayer === 3
          ? '#10b981'
          : '#f59e0b';

  if (!numPlayers) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={[styles.container, !isDarkMode && styles.containerLight]}>
          <StatusBar style={isDarkMode ? 'light' : 'dark'} />
          <View style={styles.menuContainer}>
            <View
              style={{
                position: 'absolute',
                top: isMobile ? 10 : 20,
                left: 20,
                zIndex: 10,
              }}
            >
              <TouchableOpacity
                onPress={() => setGameMode('menu')}
                style={{
                  width: 45,
                  height: 45,
                  borderRadius: 12,
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Home color="#10b981" size={24} />
              </TouchableOpacity>
            </View>

            <View
              style={{
                position: 'absolute',
                top: isMobile ? 10 : 20,
                right: 20,
                zIndex: 10,
              }}
            >
              <TouchableOpacity
                onPress={() => setIsDarkMode(!isDarkMode)}
                style={{
                  width: 45,
                  height: 45,
                  borderRadius: 12,
                  backgroundColor: isDarkMode ? '#1e293b' : '#e2e8f0',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                {isDarkMode ? (
                  <Sun color="#fbbf24" size={24} />
                ) : (
                  <Moon color="#475569" size={24} />
                )}
              </TouchableOpacity>
            </View>

            <Trophy
              color="#fbbf24"
              size={80}
              style={{ marginBottom: 10, marginTop: isMobile ? 60 : 0 }}
            />
            <Text style={[styles.menuTitle, !isDarkMode && { color: '#1e293b' }]}>
              {language === 'fr' ? 'VERSUS' : 'VERSUS'}
            </Text>

            <View
              style={{
                flexDirection: 'row',
                gap: 10,
                marginBottom: 30,
                backgroundColor: isDarkMode ? '#1e293b' : '#e2e8f0',
                padding: 5,
                borderRadius: 15,
              }}
            >
              <TouchableOpacity
                style={[
                  { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
                  gameType === 'CAPITAL' && { backgroundColor: '#3b82f6' },
                ]}
                onPress={() => setGameType('CAPITAL')}
              >
                <Text
                  style={{
                    color: gameType === 'CAPITAL' ? '#fff' : isDarkMode ? '#94a3b8' : '#64748b',
                    fontWeight: '900',
                  }}
                >
                  {language === 'fr' ? 'CAPITALES' : 'CAPITALS'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
                  gameType === 'FLAG' && { backgroundColor: '#3b82f6' },
                ]}
                onPress={() => setGameType('FLAG')}
              >
                <Text
                  style={{
                    color: gameType === 'FLAG' ? '#fff' : isDarkMode ? '#94a3b8' : '#64748b',
                    fontWeight: '900',
                  }}
                >
                  {language === 'fr' ? 'DRAPEAUX' : 'FLAGS'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
                  gameType === 'MIX' && { backgroundColor: '#3b82f6' },
                ]}
                onPress={() => setGameType('MIX')}
              >
                <Text
                  style={{
                    color: gameType === 'MIX' ? '#fff' : isDarkMode ? '#94a3b8' : '#64748b',
                    fontWeight: '900',
                  }}
                >
                  MIX
                </Text>
              </TouchableOpacity>
            </View>

            {/* Match Format Selection */}
            <View style={{ marginBottom: 15, width: '100%', maxWidth: 400 }}>
              <Text
                style={{
                  color: isDarkMode ? '#cbd5e1' : '#475569',
                  fontWeight: 'bold',
                  marginBottom: 10,
                  marginLeft: 5,
                  fontSize: 12,
                  letterSpacing: 1,
                }}
              >
                {language === 'fr' ? 'FORMAT DU MATCH' : 'MATCH FORMAT'}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  backgroundColor: isDarkMode ? '#1e293b' : '#e2e8f0',
                  padding: 5,
                  borderRadius: 15,
                }}
              >
                {[1, 3, 5, 7].map((format) => (
                  <TouchableOpacity
                    key={format}
                    style={[
                      { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
                      matchFormat === format && { backgroundColor: '#8b5cf6' },
                    ]}
                    onPress={() => setMatchFormat(format)}
                  >
                    <Text
                      style={{
                        color: matchFormat === format ? '#fff' : isDarkMode ? '#94a3b8' : '#64748b',
                        fontWeight: 'bold',
                      }}
                    >
                      BO{format}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Rounds per set Selection */}
            <View style={{ marginBottom: 30, width: '100%', maxWidth: 400 }}>
              <Text
                style={{
                  color: isDarkMode ? '#cbd5e1' : '#475569',
                  fontWeight: 'bold',
                  marginBottom: 10,
                  marginLeft: 5,
                  fontSize: 12,
                  letterSpacing: 1,
                }}
              >
                {language === 'fr' ? 'TOURS PAR MANCHE' : 'TURNS PER SET'}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  backgroundColor: isDarkMode ? '#1e293b' : '#e2e8f0',
                  padding: 5,
                  borderRadius: 15,
                }}
              >
                {[3, 5, 10, 15].map((rounds) => (
                  <TouchableOpacity
                    key={rounds}
                    style={[
                      { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
                      totalRounds === rounds && { backgroundColor: '#10b981' },
                    ]}
                    onPress={() => setTotalRounds(rounds)}
                  >
                    <Text
                      style={{
                        color: totalRounds === rounds ? '#fff' : isDarkMode ? '#94a3b8' : '#64748b',
                        fontWeight: 'bold',
                      }}
                    >
                      {rounds}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.modeSelectionGrid}>
              <TouchableOpacity style={styles.playerPickBtn} onPress={() => setNumPlayers(2)}>
                <Users color="#fff" size={28} />
                <Text style={styles.playerPickText}>1 VS 1</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.playerPickBtn, { backgroundColor: '#8b5cf6' }]}
                onPress={() => setNumPlayers(3)}
              >
                <Users color="#fff" size={28} />
                <Text style={styles.playerPickText}>1 VS 1 VS 1</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.playerPickBtn, { backgroundColor: '#f59e0b' }]}
                onPress={() => setNumPlayers(4)}
              >
                <Users color="#fff" size={28} />
                <Text style={styles.playerPickText}>1 VS 1 VS 1 VS 1</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (!question) return null;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, !isDarkMode && styles.containerLight]}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />

        {/* Header */}
        <View style={[styles.header, !isDarkMode && styles.headerLight]}>
          {!isMobile ? (
            <>
              <TouchableOpacity
                onPress={() => setNumPlayers(null)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 10,
                }}
              >
                <Home color="#10b981" size={20} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setIsDarkMode(!isDarkMode)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: isDarkMode ? '#1e293b' : '#e2e8f0',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 10,
                }}
              >
                {isDarkMode ? (
                  <Sun color="#fbbf24" size={20} />
                ) : (
                  <Moon color="#475569" size={20} />
                )}
              </TouchableOpacity>
              <View style={[styles.scoreBoard, !isDarkMode && styles.scoreBoardLight]}>
                <View
                  style={[
                    styles.playerScore,
                    currentPlayer === 1 && { borderBottomWidth: 3, borderBottomColor: '#3b82f6' },
                  ]}
                >
                  <Text style={[styles.playerLabel, { color: '#3b82f6' }]}>P1</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                    <Text style={[styles.scoreValue, !isDarkMode && { color: '#1e293b' }]}>
                      {scores[1]}
                    </Text>
                    {matchFormat > 1 && (
                      <Text style={{ color: '#3b82f6', fontSize: 10, fontWeight: 'bold' }}>
                        ⭐{matchScores[1]}
                      </Text>
                    )}
                  </View>
                </View>
                <View
                  style={[
                    styles.playerScore,
                    currentPlayer === 2 && { borderBottomWidth: 3, borderBottomColor: '#ef4444' },
                  ]}
                >
                  <Text style={[styles.playerLabel, { color: '#ef4444' }]}>P2</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                    <Text style={[styles.scoreValue, !isDarkMode && { color: '#1e293b' }]}>
                      {scores[2]}
                    </Text>
                    {matchFormat > 1 && (
                      <Text style={{ color: '#ef4444', fontSize: 10, fontWeight: 'bold' }}>
                        ⭐{matchScores[2]}
                      </Text>
                    )}
                  </View>
                </View>
                {numPlayers >= 3 && (
                  <View
                    style={[
                      styles.playerScore,
                      currentPlayer === 3 && { borderBottomWidth: 3, borderBottomColor: '#10b981' },
                    ]}
                  >
                    <Text style={[styles.playerLabel, { color: '#10b981' }]}>P3</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                      <Text style={[styles.scoreValue, !isDarkMode && { color: '#1e293b' }]}>
                        {scores[3]}
                      </Text>
                      {matchFormat > 1 && (
                        <Text style={{ color: '#10b981', fontSize: 10, fontWeight: 'bold' }}>
                          ⭐{matchScores[3]}
                        </Text>
                      )}
                    </View>
                  </View>
                )}
                {numPlayers === 4 && (
                  <View
                    style={[
                      styles.playerScore,
                      currentPlayer === 4 && { borderBottomWidth: 3, borderBottomColor: '#f59e0b' },
                    ]}
                  >
                    <Text style={[styles.playerLabel, { color: '#f59e0b' }]}>P4</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                      <Text style={[styles.scoreValue, !isDarkMode && { color: '#1e293b' }]}>
                        {scores[4]}
                      </Text>
                      {matchFormat > 1 && (
                        <Text style={{ color: '#f59e0b', fontSize: 10, fontWeight: 'bold' }}>
                          ⭐{matchScores[4]}
                        </Text>
                      )}
                    </View>
                  </View>
                )}
                <View style={styles.roundInfo}>
                  <Text style={styles.roundText}>
                    {currentRound}/{totalRounds}
                  </Text>
                  {matchFormat > 1 && (
                    <Text
                      style={{
                        color: '#8b5cf6',
                        fontSize: 8,
                        fontWeight: 'bold',
                        textAlign: 'center',
                        marginTop: 2,
                      }}
                    >
                      BO{matchFormat}
                    </Text>
                  )}
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <TouchableOpacity
                  onPress={() => setNumPlayers(null)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: 8,
                  }}
                >
                  <Home color="#10b981" size={18} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setIsDarkMode(!isDarkMode)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: isDarkMode ? '#1e293b' : '#e2e8f0',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: 8,
                  }}
                >
                  {isDarkMode ? (
                    <Sun color="#fbbf24" size={16} />
                  ) : (
                    <Moon color="#475569" size={16} />
                  )}
                </TouchableOpacity>
                <View style={styles.roundInfo}>
                  <Text style={styles.roundText}>
                    {currentRound}/{totalRounds}
                  </Text>
                  {matchFormat > 1 && (
                    <Text
                      style={{
                        color: '#8b5cf6',
                        fontSize: 7,
                        fontWeight: 'bold',
                        textAlign: 'center',
                      }}
                    >
                      BO{matchFormat}
                    </Text>
                  )}
                </View>
              </View>

              <View style={[styles.scoreBoard, !isDarkMode && styles.scoreBoardLight]}>
                <View
                  style={[
                    styles.playerScore,
                    currentPlayer === 1 && { borderBottomWidth: 3, borderBottomColor: '#3b82f6' },
                  ]}
                >
                  <Text style={[styles.playerLabel, { color: '#3b82f6' }]}>P1</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                    <Text style={[styles.scoreValue, !isDarkMode && { color: '#1e293b' }]}>
                      {scores[1]}
                    </Text>
                    {matchFormat > 1 && (
                      <Text style={{ color: '#3b82f6', fontSize: 9, fontWeight: 'bold' }}>
                        ⭐{matchScores[1]}
                      </Text>
                    )}
                  </View>
                </View>
                <View
                  style={[
                    styles.playerScore,
                    currentPlayer === 2 && { borderBottomWidth: 3, borderBottomColor: '#ef4444' },
                  ]}
                >
                  <Text style={[styles.playerLabel, { color: '#ef4444' }]}>P2</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                    <Text style={[styles.scoreValue, !isDarkMode && { color: '#1e293b' }]}>
                      {scores[2]}
                    </Text>
                    {matchFormat > 1 && (
                      <Text style={{ color: '#ef4444', fontSize: 9, fontWeight: 'bold' }}>
                        ⭐{matchScores[2]}
                      </Text>
                    )}
                  </View>
                </View>
                {numPlayers >= 3 && (
                  <View
                    style={[
                      styles.playerScore,
                      currentPlayer === 3 && { borderBottomWidth: 3, borderBottomColor: '#10b981' },
                    ]}
                  >
                    <Text style={[styles.playerLabel, { color: '#10b981' }]}>P3</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                      <Text style={[styles.scoreValue, !isDarkMode && { color: '#1e293b' }]}>
                        {scores[3]}
                      </Text>
                      {matchFormat > 1 && (
                        <Text style={{ color: '#10b981', fontSize: 9, fontWeight: 'bold' }}>
                          ⭐{matchScores[3]}
                        </Text>
                      )}
                    </View>
                  </View>
                )}
                {numPlayers === 4 && (
                  <View
                    style={[
                      styles.playerScore,
                      currentPlayer === 4 && { borderBottomWidth: 3, borderBottomColor: '#f59e0b' },
                    ]}
                  >
                    <Text style={[styles.playerLabel, { color: '#f59e0b' }]}>P4</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                      <Text style={[styles.scoreValue, !isDarkMode && { color: '#1e293b' }]}>
                        {scores[4]}
                      </Text>
                      {matchFormat > 1 && (
                        <Text style={{ color: '#f59e0b', fontSize: 9, fontWeight: 'bold' }}>
                          ⭐{matchScores[4]}
                        </Text>
                      )}
                    </View>
                  </View>
                )}
              </View>
            </>
          )}
        </View>

        <View style={styles.gameArea}>
          <Text
            style={[
              styles.turnIndicator,
              {
                color: playerColor,
                fontSize: isMobile ? 16 : 18,
                marginBottom: isMobile ? 10 : 20,
              },
            ]}
          >
            {language === 'fr' ? `Tour Joueur ${currentPlayer}` : `Player ${currentPlayer}'s Turn`}
          </Text>

          {!isMobile ? (
            <View style={[styles.card, !isDarkMode && styles.cardLight]}>
              <Image source={{ uri: getFlagUrl(question.cca3) }} style={styles.flag} />
              {currentQuestionType === 'CAPITAL' && (
                <Text style={[styles.countryName, !isDarkMode && { color: '#1e293b' }]}>
                  {language === 'fr' ? question.name : question.name_en || question.name}
                </Text>
              )}
              <Text style={styles.instruction}>
                {currentQuestionType === 'CAPITAL'
                  ? language === 'fr'
                    ? 'Quelle est la capitale ?'
                    : 'What is the capital?'
                  : language === 'fr'
                    ? 'Quel est ce pays ?'
                    : 'What is this country?'}
              </Text>
            </View>
          ) : (
            <View style={[styles.card, !isDarkMode && styles.cardLight, { padding: 15 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
                <Image
                  source={{ uri: getFlagUrl(question.cca3) }}
                  style={[styles.flag, { marginBottom: 0, width: 80, height: 55 }]}
                />
                <View style={{ flex: 1 }}>
                  {currentQuestionType === 'CAPITAL' && (
                    <Text
                      style={[
                        styles.countryName,
                        !isDarkMode && { color: '#1e293b' },
                        { fontSize: 22, textAlign: 'left' },
                      ]}
                    >
                      {language === 'fr' ? question.name : question.name_en || question.name}
                    </Text>
                  )}
                  <Text style={[styles.instruction, { marginTop: 2, fontSize: 12 }]}>
                    {currentQuestionType === 'CAPITAL'
                      ? language === 'fr'
                        ? 'Quelle est la capitale ?'
                        : 'What is the capital?'
                      : language === 'fr'
                        ? 'Quel est ce pays ?'
                        : 'What is this country?'}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {!mode && !feedback ? (
            <View style={styles.modeSelection}>
              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  !isDarkMode && styles.modeBtnLight,
                  { borderColor: '#ef4444' },
                ]}
                onPress={() => setMode('DUO')}
              >
                <HelpCircle color="#ef4444" size={24} />
                <Text style={[styles.modeBtnTitle, { color: '#ef4444' }]}>DUO</Text>
                <Text style={styles.modeBtnPoints}>1 PT</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  !isDarkMode && styles.modeBtnLight,
                  { borderColor: '#3b82f6' },
                ]}
                onPress={() => setMode('CARRE')}
              >
                <Eye color="#3b82f6" size={24} />
                <Text style={[styles.modeBtnTitle, { color: '#3b82f6' }]}>CARRÉ</Text>
                <Text style={styles.modeBtnPoints}>3 PTS</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  !isDarkMode && styles.modeBtnLight,
                  { borderColor: '#10b981' },
                ]}
                onPress={() => setMode('CASH')}
              >
                <CheckCircle color="#10b981" size={24} />
                <Text style={[styles.modeBtnTitle, { color: '#10b981' }]}>CASH</Text>
                <Text style={styles.modeBtnPoints}>5 PTS</Text>
              </TouchableOpacity>
            </View>
          ) : mode === 'CASH' && !feedback ? (
            <View style={styles.cashContainer}>
              <TouchableOpacity
                style={{
                  alignSelf: 'flex-start',
                  marginBottom: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
                onPress={() => setMode(null)}
              >
                <Text style={{ color: '#3b82f6', fontWeight: 'bold' }}>
                  ← {language === 'fr' ? 'RETOUR' : 'BACK'}
                </Text>
              </TouchableOpacity>
              <TextInput
                style={[styles.cashInput, !isDarkMode && styles.cashInputLight]}
                placeholder="Réponse..."
                placeholderTextColor="#64748b"
                value={cashInput}
                onChangeText={setCashInput}
                autoFocus
                onSubmitEditing={handleCashSubmit}
              />
              <TouchableOpacity style={styles.cashSubmitBtn} onPress={handleCashSubmit}>
                <Text style={styles.cashSubmitText}>VALIDER</Text>
              </TouchableOpacity>
            </View>
          ) : (mode === 'DUO' || mode === 'CARRE') && !feedback ? (
            <View style={styles.optionsGrid}>
              <TouchableOpacity
                style={{ alignSelf: 'flex-start', marginBottom: 10 }}
                onPress={() => setMode(null)}
              >
                <Text style={{ color: '#3b82f6', fontWeight: 'bold' }}>
                  ← {language === 'fr' ? 'RETOUR' : 'BACK'}
                </Text>
              </TouchableOpacity>
              {(mode === 'DUO'
                ? (options as OptionsState).duo
                : (options as OptionsState).carre
              ).map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.optionBtn, !isDarkMode && styles.optionBtnLight]}
                  onPress={() => handleAnswer(option, mode)}
                >
                  <Text style={[styles.optionText, !isDarkMode && { color: '#1e293b' }]}>
                    {option.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            feedback && (
              <View
                style={[
                  styles.feedbackCard,
                  feedback.correct ? styles.correctCard : styles.wrongCard,
                ]}
              >
                <Text style={styles.feedbackEmoji}>{feedback.correct ? '🏆' : '❌'}</Text>
                <Text style={[styles.feedbackTitle, !isDarkMode && { color: '#1e293b' }]}>
                  {feedback.correct ? 'BIEN JOUÉ !' : 'DOMMAGE...'}
                </Text>
                <Text style={styles.feedbackSub}>
                  {feedback.correct
                    ? `+${feedback.points} point(s)`
                    : `La réponse était : ${feedback.answer}`}
                </Text>

                <TouchableOpacity
                  style={{
                    marginTop: 15,
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: feedback.correct
                      ? 'rgba(239, 68, 68, 0.2)'
                      : 'rgba(16, 185, 129, 0.2)',
                    borderColor: feedback.correct ? '#ef4444' : '#10b981',
                    borderWidth: 1,
                  }}
                  onPress={togglePoints}
                >
                  <Text
                    style={{ color: feedback.correct ? '#ef4444' : '#10b981', fontWeight: 'bold' }}
                  >
                    {feedback.correct
                      ? language === 'fr'
                        ? 'MARQUER COMME FAUX'
                        : 'MARK AS WRONG'
                      : language === 'fr'
                        ? 'MARQUER COMME JUSTE'
                        : 'MARK AS CORRECT'}
                  </Text>
                </TouchableOpacity>
              </View>
            )
          )}
        </View>

        {gameOver && (
          <View style={[styles.overlay, !isDarkMode && styles.overlayLight]}>
            <Trophy color={matchOver ? '#fbbf24' : '#cbd5e1'} size={80} />
            <Text style={[styles.winnerTitle, !isDarkMode && { color: '#1e293b' }]}>
              {!matchOver
                ? winner === 0
                  ? language === 'fr'
                    ? 'ÉGALITÉ !'
                    : 'TIE !'
                  : `MANCHE GAGNÉE P${winner}`
                : matchWinner === 0
                  ? language === 'fr'
                    ? 'ÉGALITÉ DU MATCH !'
                    : 'MATCH TIE !'
                  : `VICTOIRE DU MATCH P${matchWinner} !`}
            </Text>

            <Text
              style={[styles.finalScore, !isDarkMode && { color: '#64748b' }, { marginBottom: 10 }]}
            >
              {language === 'fr' ? 'Score de la manche :' : 'Set score:'} {scores[1]} - {scores[2]}{' '}
              {numPlayers === 3 ? `- ${scores[3]}` : ''}
            </Text>

            {matchFormat > 1 && (
              <Text
                style={[styles.finalScore, { color: '#8b5cf6', fontSize: 24, marginBottom: 40 }]}
              >
                {language === 'fr' ? 'Match (Étoiles) :' : 'Match (Stars):'} {matchScores[1]} ⭐ -{' '}
                {matchScores[2]} ⭐ {numPlayers === 3 ? `- ${matchScores[3]} ⭐` : ''}
              </Text>
            )}

            <View
              style={{ gap: 15, width: '100%', maxWidth: 300, marginTop: matchFormat > 1 ? 0 : 30 }}
            >
              {!matchOver ? (
                <TouchableOpacity style={styles.resetBtn} onPress={nextSet}>
                  <Text style={styles.resetBtnText}>
                    {language === 'fr' ? 'MANCHE SUIVANTE' : 'NEXT SET'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.resetBtn} onPress={resetMatch}>
                  <Text style={styles.resetBtnText}>
                    {language === 'fr' ? 'REJOUER LE MATCH' : 'PLAY MATCH AGAIN'}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.resetBtn,
                  { backgroundColor: 'transparent', borderWidth: 2, borderColor: '#64748b' },
                ]}
                onPress={quitToMenu}
              >
                <Text style={styles.resetBtnText}>
                  {language === 'fr' ? 'MENU PRINCIPAL' : 'MAIN MENU'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  containerLight: { backgroundColor: '#f8fafc' },
  header: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    justifyContent: 'space-between',
    minHeight: 60,
  },
  headerLight: { backgroundColor: '#fff', borderBottomColor: '#e2e8f0' },
  menuContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  backBtn: { position: 'absolute', top: isMobile ? 60 : 20, left: 20 },
  menuTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 40,
  },

  modeSelectionGrid: { width: '100%', maxWidth: 400, gap: 15 },
  playerPickBtn: {
    backgroundColor: '#3b82f6',
    padding: 20,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 15,
    width: '100%',
  },
  playerPickText: { color: '#fff', fontSize: 24, fontWeight: '900' },

  scoreBoard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  scoreBoardLight: {
    backgroundColor: '#e2e8f0',
  },
  playerScore: { alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2 },
  playerLabel: { fontSize: 8, fontWeight: 'bold', marginBottom: -2 },
  scoreValue: { fontSize: 16, fontWeight: '900', color: '#f8fafc' },
  roundInfo: {
    marginLeft: 15,
    borderLeftWidth: 1,
    borderLeftColor: '#334155',
    paddingLeft: 10,
    justifyContent: 'center',
  },
  roundText: { color: '#64748b', fontSize: 12, fontWeight: 'bold' },
  iconBtn: { padding: 8, backgroundColor: '#1e293b', borderRadius: 10 },

  gameArea: { flex: 1, padding: 20, alignItems: 'center' },
  turnIndicator: { fontSize: 18, fontWeight: '900', marginBottom: 20, textTransform: 'uppercase' },
  card: {
    backgroundColor: '#1e293b',
    padding: 30,
    borderRadius: 24,
    alignItems: 'center',
    marginBottom: 30,
    width: '100%',
    maxWidth: 600,
  },
  cardLight: { backgroundColor: '#fff', elevation: 4, shadowOpacity: 0.1 },
  flag: { width: 120, height: 80, borderRadius: 12, marginBottom: 15 },
  countryName: { fontSize: 32, fontWeight: '900', color: '#f8fafc', textAlign: 'center' },
  instruction: { color: '#64748b', fontSize: 14, marginTop: 10 },

  optionsGrid: { gap: 12, width: '100%', maxWidth: 500 },
  optionBtn: {
    backgroundColor: '#1e293b',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#334155',
  },
  optionBtnLight: { backgroundColor: '#fff', borderColor: '#e2e8f0', elevation: 2 },
  optionText: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold' },

  modeSelection: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    maxWidth: 500,
    justifyContent: 'center',
  },
  modeBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    padding: 15,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
  },
  modeBtnLight: { backgroundColor: '#fff', borderColor: '#e2e8f0' },
  modeBtnTitle: { fontSize: 14, fontWeight: '900', marginTop: 8 },
  modeBtnPoints: { fontSize: 10, color: '#64748b', fontWeight: 'bold' },

  cashContainer: { width: '100%', maxWidth: 500, gap: 12 },
  cashInput: {
    backgroundColor: '#1e293b',
    color: '#fff',
    padding: 20,
    borderRadius: 16,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    borderWidth: 2,
    borderColor: '#334155',
  },
  cashInputLight: { backgroundColor: '#fff', color: '#1e293b', borderColor: '#e2e8f0' },
  cashSubmitBtn: {
    backgroundColor: '#10b981',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  cashSubmitText: { color: '#fff', fontWeight: '900', fontSize: 16 },

  feedbackCard: {
    padding: 30,
    borderRadius: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 500,
  },
  correctCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 2,
    borderColor: '#10b981',
  },
  wrongCard: { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 2, borderColor: '#ef4444' },
  feedbackEmoji: { fontSize: 40, marginBottom: 10 },
  feedbackTitle: { fontSize: 24, fontWeight: '900', color: '#fff', marginBottom: 5 },
  feedbackSub: { fontSize: 16, color: '#94a3b8', textAlign: 'center', fontWeight: 'bold' },

  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  overlayLight: { backgroundColor: 'rgba(248, 250, 252, 0.98)' },
  winnerTitle: { fontSize: 40, fontWeight: '900', color: '#fff', marginVertical: 20 },
  finalScore: { fontSize: 32, color: '#94a3b8', marginBottom: 40 },
  resetBtn: {
    backgroundColor: '#10b981',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  resetBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
});
