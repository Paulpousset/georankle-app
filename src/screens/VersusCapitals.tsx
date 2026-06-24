import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  TextInput,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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

import * as Haptics from 'expo-haptics';
import { track } from '../lib/analytics';
import { getFlagUrl } from '../lib/flags';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import type { GameMode, Language, Match } from '../types';

const PLAYER_COLORS = ['#4a9eff', '#8b1a1a', '#2a6e3f', '#c4872a'];
import countriesStats from '../../assets/countries_stats.json';

function createSeededRng(seed: number) {
  let s = seed;
  return function () {
    s = (s + 0x9e3779b9) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';

interface VersusCapitalsProps {
  isDarkMode: boolean;
  setIsDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  setGameMode: (mode: GameMode) => void;
  language: Language;
  soloMode?: boolean;
  initialGameType?: string;
  matchData?: Match | null;
  onRoundComplete?: (score: number) => void;
  onExit?: () => void;
  /**
   * When set (local hot-seat parcours), replaces the internal P1/P2 board with a
   * live standings strip of every player. The current player's running manche
   * total is `baseScores[currentIdx] + scores[1]` (the points earned this turn).
   */
  localBanner?: {
    names: string[];
    baseScores: number[];
    currentIdx: number;
    colors: string[];
  };
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

// Normalise une chaîne : minuscules, sans accents, sans espaces/ponctuation superflus
const normalizeAnswer = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les accents
    .replace(/[^a-z0-9]/g, '') // retire espaces, tirets, apostrophes…
    .trim();

// Distance de Levenshtein entre deux chaînes
const levenshtein = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
};

// Vérifie si la réponse de l'utilisateur est suffisamment proche de la bonne réponse.
// Tolérance proportionnelle à la longueur : 1 faute jusqu'à 8 lettres, 2 au-delà.
const isAnswerClose = (input: string, answer: string): boolean => {
  const a = normalizeAnswer(input);
  const b = normalizeAnswer(answer);
  if (!a || !b) return false;
  if (a === b) return true;
  // La réponse doit avoir une longueur comparable (évite qu'une lettre valide tout)
  if (Math.abs(a.length - b.length) > 2) return false;
  const tolerance = b.length <= 8 ? 1 : 2;
  return levenshtein(a, b) <= tolerance;
};

export default function VersusCapitals({
  isDarkMode,
  setIsDarkMode,
  setGameMode,
  language,
  soloMode = false,
  initialGameType,
  matchData,
  onRoundComplete,
  onExit,
  localBanner,
}: VersusCapitalsProps) {
  const insets = useSafeAreaInsets();
  const c = getColors(isDarkMode);
  const isOnline = !!matchData;
  const rngRef = useRef<(() => number) | null>(null);

  // Analytics mode string for solo play, derived from the chosen quiz type.
  const soloAnalyticsMode =
    initialGameType === 'FLAG'
      ? 'quiz-flag'
      : initialGameType === 'MIX'
        ? 'quiz-mix'
        : 'quiz-capital';

  const [numPlayers, setNumPlayers] = useState<number | null>(
    isOnline ? 1 : null,
  );
  const [gameType, setGameType] = useState<string>(
    isOnline ? ((matchData?.game_data?.questionType as string) ?? 'MIX') : (initialGameType ?? 'CAPITAL'),
  );
  const [currentQuestionType, setCurrentQuestionType] = useState<string>('CAPITAL');
  const [totalRounds, setTotalRounds] = useState<number>(
    isOnline ? ((matchData?.game_data?.roundsPerSet as number) ?? 5) : 5,
  );
  const [matchFormat, setMatchFormat] = useState<number>(1);
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
    if (matchData?.game_data?.seed != null) {
      const roundNumber = matchData.current_round ?? 1;
      rngRef.current = createSeededRng(matchData.game_data.seed + (roundNumber - 1));
    }
  }, [matchData?.game_data?.seed, matchData?.current_round]);

  useEffect(() => {
    if (soloMode) track('game_started', { mode: soloAnalyticsMode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (numPlayers) {
      initRound();
    }
  }, [currentRound, currentPlayer, numPlayers]);

  const initRound = () => {
    if (gameOver) return;

    const rng = rngRef.current ?? Math.random;

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

    const sourceList = availableCountries.length > 0 ? availableCountries : countriesStats;
    const country = sourceList[Math.floor(rng() * sourceList.length)];

    setUsedCountries((prev) => new Set([...prev, country.cca3]));

    // Preparations for Duo/Carre
    const wrs = countriesStats
      .filter(
        (c: any) =>
          c.cca3 !== country.cca3 &&
          (activeType === 'CAPITAL' ? c.capital !== country.capital : true) &&
          c.capital !== 'N/A',
      )
      .sort(() => rng() - 0.5);

    const getOptionName = (c: any) => {
      if (activeType === 'CAPITAL') return language === 'fr' ? c.capital_fr || c.capital : c.capital;
      return language === 'fr' ? c.name : c.name_en || c.name;
    };

    const carreOptions = [
      { id: 'correct', name: getOptionName(country) },
      ...wrs
        .slice(0, 3)
        .map((w: any, idx: number) => ({ id: `wrong-${idx}`, name: getOptionName(w) })),
    ].sort(() => rng() - 0.5);

    const duoOptions = [
      { id: 'correct', name: getOptionName(country) },
      { id: 'wrong-0', name: getOptionName(wrs[0]) },
    ].sort(() => rng() - 0.5);

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
        ? language === 'fr'
          ? question.capital_fr || question.capital
          : question.capital
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

    Haptics.impactAsync(
      isCorrect ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy,
    ).catch(() => {});

    if (isCorrect) {
      setScores((prev) => ({ ...prev, [currentPlayer]: prev[currentPlayer] + points }));
    }

    proceedNext();
  };

  const handleCashSubmit = () => {
    if (feedback || !cashInput.trim()) return;

    const points = 5;
    const correctAnswer =
      currentQuestionType === 'CAPITAL'
        ? language === 'fr'
          ? question.capital_fr || question.capital
          : question.capital
        : language === 'fr'
          ? question.name
          : question.name_en || question.name;

    const isCorrect = isAnswerClose(cashInput, correctAnswer);

    setFeedback({ correct: isCorrect, mode: 'CASH', answer: correctAnswer, points: points });

    Haptics.impactAsync(
      isCorrect ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy,
    ).catch(() => {});

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
      if (isOnline && onRoundComplete) {
        onRoundComplete(scores[1]);
        return;
      }

      if (soloMode) track('game_completed', { mode: soloAnalyticsMode, score: scores[1] });

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
        const newMatchScores = { ...matchScores, [roundWinner]: matchScores[roundWinner] + 1 };
        setMatchScores(newMatchScores);

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
    if (isOnline && onExit) onExit();
    else if (soloMode) setGameMode('menu');
    else setNumPlayers(null);
  };

  const playerColor = PLAYER_COLORS[(currentPlayer - 1) % 4];

  // Live parcours standings strip (hot-seat). Shows every player's running
  // manche total, with the current player highlighted by name — replaces the
  // internal P1/P2 board so each turn no longer looks like "Player 1".
  const renderLocalBanner = () => {
    if (!localBanner) return null;
    const { names: pnames, baseScores, currentIdx, colors } = localBanner;
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: 'center', gap: 6, paddingRight: 8 }}
      >
        {pnames.map((nm, p) => {
          const isCur = p === currentIdx;
          const total = (baseScores[p] ?? 0) + (isCur ? scores[1] : 0);
          const color = colors[p % colors.length];
          return (
            <View
              key={p}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: isCur ? color : c.card,
                borderRadius: 12,
                paddingHorizontal: 9,
                paddingVertical: 5,
                borderWidth: 1,
                borderColor: isCur ? color : c.border,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  maxWidth: 80,
                  color: isCur ? '#fff' : c.textMuted,
                  fontSize: 11,
                  fontFamily: FONTS.monoBold,
                }}
              >
                {nm}
              </Text>
              <Text style={{ color: isCur ? '#fff' : c.text, fontSize: 14, fontWeight: 'bold' }}>
                {total}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    );
  };

  if (!numPlayers) {
    return (
      <SafeAreaView style={[styles.container, !isDarkMode && styles.containerLight]}>
          <StatusBar style={isDarkMode ? 'light' : 'dark'} />
          <View style={styles.menuContainer}>
            <View
              style={{
                position: 'absolute',
                top: insets.top + 10,
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
                <Home color="#2a6e3f" size={24} />
              </TouchableOpacity>
            </View>

            <View
              style={{
                position: 'absolute',
                top: insets.top + 10,
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
                  backgroundColor: c.card,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                {isDarkMode ? (
                  <Sun color="#c4872a" size={24} />
                ) : (
                  <Moon color="#4a6a88" size={24} />
                )}
              </TouchableOpacity>
            </View>

            <Trophy
              color="#c4872a"
              size={80}
              style={{ marginBottom: 10, marginTop: isMobile ? 60 : 0 }}
            />
            <Text style={[styles.menuTitle, { color: c.text }]}>
              {soloMode
                ? gameType === 'CAPITAL'
                  ? language === 'fr' ? 'CAPITALES' : 'CAPITALS'
                  : gameType === 'FLAG'
                    ? language === 'fr' ? 'DRAPEAUX' : 'FLAGS'
                    : 'MIX'
                : language === 'fr' ? 'VERSUS' : 'VERSUS'}
            </Text>

            {!soloMode && <View
              style={{
                flexDirection: 'row',
                gap: 10,
                marginBottom: 30,
                backgroundColor: c.card,
                padding: 5,
                borderRadius: 15,
              }}
            >
              <TouchableOpacity
                style={[
                  { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
                  gameType === 'CAPITAL' && { backgroundColor: '#4a9eff' },
                ]}
                onPress={() => setGameType('CAPITAL')}
              >
                <Text
                  style={{
                    color: gameType === 'CAPITAL' ? '#fff' : c.textMuted,
                    fontWeight: '900',
                  }}
                >
                  {language === 'fr' ? 'CAPITALES' : 'CAPITALS'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
                  gameType === 'FLAG' && { backgroundColor: '#4a9eff' },
                ]}
                onPress={() => setGameType('FLAG')}
              >
                <Text
                  style={{
                    color: gameType === 'FLAG' ? '#fff' : c.textMuted,
                    fontWeight: '900',
                  }}
                >
                  {language === 'fr' ? 'DRAPEAUX' : 'FLAGS'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
                  gameType === 'MIX' && { backgroundColor: '#4a9eff' },
                ]}
                onPress={() => setGameType('MIX')}
              >
                <Text
                  style={{
                    color: gameType === 'MIX' ? '#fff' : c.textMuted,
                    fontWeight: '900',
                  }}
                >
                  MIX
                </Text>
              </TouchableOpacity>
            </View>}

            {!soloMode && <View style={{ marginBottom: 15, width: '100%', maxWidth: 400 }}>
              <Text
                style={{
                  color: c.textMuted,
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
                  backgroundColor: c.card,
                  padding: 5,
                  borderRadius: 15,
                }}
              >
                {[1, 3, 5, 7].map((format) => (
                  <TouchableOpacity
                    key={format}
                    style={[
                      { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
                      matchFormat === format && { backgroundColor: '#c04a1a' },
                    ]}
                    onPress={() => setMatchFormat(format)}
                  >
                    <Text
                      style={{
                        color: matchFormat === format ? '#fff' : c.textMuted,
                        fontWeight: 'bold',
                      }}
                    >
                      BO{format}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>}

            {/* Rounds per set Selection */}
            <View style={{ marginBottom: 30, width: '100%', maxWidth: 400 }}>
              <Text
                style={{
                  color: c.textMuted,
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
                  backgroundColor: c.card,
                  padding: 5,
                  borderRadius: 15,
                }}
              >
                {[3, 5, 10, 15].map((rounds) => (
                  <TouchableOpacity
                    key={rounds}
                    style={[
                      { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
                      totalRounds === rounds && { backgroundColor: '#2a6e3f' },
                    ]}
                    onPress={() => setTotalRounds(rounds)}
                  >
                    <Text
                      style={{
                        color: totalRounds === rounds ? '#fff' : c.textMuted,
                        fontWeight: 'bold',
                      }}
                    >
                      {rounds}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {soloMode ? (
              <View style={styles.modeSelectionGrid}>
                <TouchableOpacity
                  style={[styles.playerPickBtn, { backgroundColor: '#2a6e3f' }]}
                  onPress={() => setNumPlayers(1)}
                >
                  <Timer color="#fff" size={28} />
                  <Text style={styles.playerPickText}>{language === 'fr' ? 'JOUER' : 'PLAY'}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.modeSelectionGrid}>
                <TouchableOpacity style={styles.playerPickBtn} onPress={() => setNumPlayers(2)}>
                  <Users color="#fff" size={28} />
                  <Text style={styles.playerPickText}>1 VS 1</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.playerPickBtn, { backgroundColor: '#c04a1a' }]}
                  onPress={() => setNumPlayers(3)}
                >
                  <Users color="#fff" size={28} />
                  <Text style={styles.playerPickText}>1 VS 1 VS 1</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.playerPickBtn, { backgroundColor: '#c4872a' }]}
                  onPress={() => setNumPlayers(4)}
                >
                  <Users color="#fff" size={28} />
                  <Text style={styles.playerPickText}>1 VS 1 VS 1 VS 1</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
      </SafeAreaView>
    );
  }

  if (!question) return null;

  return (
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
                <Home color="#2a6e3f" size={20} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setIsDarkMode(!isDarkMode)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: c.card,
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 10,
                }}
              >
                {isDarkMode ? (
                  <Sun color="#c4872a" size={20} />
                ) : (
                  <Moon color="#4a6a88" size={20} />
                )}
              </TouchableOpacity>
              {localBanner ? renderLocalBanner() : (
              <View style={[styles.scoreBoard, !isDarkMode && styles.scoreBoardLight]}>
                <View
                  style={[
                    styles.playerScore,
                    currentPlayer === 1 && { borderBottomWidth: 3, borderBottomColor: '#4a9eff' },
                  ]}
                >
                  <Text style={[styles.playerLabel, { color: '#4a9eff' }]}>P1</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                    <Text style={[styles.scoreValue, { color: c.text }]}>
                      {scores[1]}
                    </Text>
                    {matchFormat > 1 && (
                      <Text style={{ color: '#4a9eff', fontSize: 10, fontWeight: 'bold' }}>
                        ⭐{matchScores[1]}
                      </Text>
                    )}
                  </View>
                </View>
                <View
                  style={[
                    styles.playerScore,
                    currentPlayer === 2 && { borderBottomWidth: 3, borderBottomColor: '#8b1a1a' },
                  ]}
                >
                  <Text style={[styles.playerLabel, { color: '#8b1a1a' }]}>P2</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                    <Text style={[styles.scoreValue, { color: c.text }]}>
                      {scores[2]}
                    </Text>
                    {matchFormat > 1 && (
                      <Text style={{ color: '#8b1a1a', fontSize: 10, fontWeight: 'bold' }}>
                        ⭐{matchScores[2]}
                      </Text>
                    )}
                  </View>
                </View>
                {numPlayers >= 3 && (
                  <View
                    style={[
                      styles.playerScore,
                      currentPlayer === 3 && { borderBottomWidth: 3, borderBottomColor: '#2a6e3f' },
                    ]}
                  >
                    <Text style={[styles.playerLabel, { color: '#2a6e3f' }]}>P3</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                      <Text style={[styles.scoreValue, { color: c.text }]}>
                        {scores[3]}
                      </Text>
                      {matchFormat > 1 && (
                        <Text style={{ color: '#2a6e3f', fontSize: 10, fontWeight: 'bold' }}>
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
                      currentPlayer === 4 && { borderBottomWidth: 3, borderBottomColor: '#c4872a' },
                    ]}
                  >
                    <Text style={[styles.playerLabel, { color: '#c4872a' }]}>P4</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                      <Text style={[styles.scoreValue, { color: c.text }]}>
                        {scores[4]}
                      </Text>
                      {matchFormat > 1 && (
                        <Text style={{ color: '#c4872a', fontSize: 10, fontWeight: 'bold' }}>
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
                        color: '#c04a1a',
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
              )}
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
                  <Home color="#2a6e3f" size={18} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setIsDarkMode(!isDarkMode)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: c.card,
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: 8,
                  }}
                >
                  {isDarkMode ? (
                    <Sun color="#c4872a" size={16} />
                  ) : (
                    <Moon color="#4a6a88" size={16} />
                  )}
                </TouchableOpacity>
                <View style={styles.roundInfo}>
                  <Text style={styles.roundText}>
                    {currentRound}/{totalRounds}
                  </Text>
                  {matchFormat > 1 && (
                    <Text
                      style={{
                        color: '#c04a1a',
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

              {localBanner ? renderLocalBanner() : (
              <View style={[styles.scoreBoard, !isDarkMode && styles.scoreBoardLight]}>
                <View
                  style={[
                    styles.playerScore,
                    currentPlayer === 1 && { borderBottomWidth: 3, borderBottomColor: '#4a9eff' },
                  ]}
                >
                  <Text style={[styles.playerLabel, { color: '#4a9eff' }]}>P1</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                    <Text style={[styles.scoreValue, { color: c.text }]}>
                      {scores[1]}
                    </Text>
                    {matchFormat > 1 && (
                      <Text style={{ color: '#4a9eff', fontSize: 9, fontWeight: 'bold' }}>
                        ⭐{matchScores[1]}
                      </Text>
                    )}
                  </View>
                </View>
                <View
                  style={[
                    styles.playerScore,
                    currentPlayer === 2 && { borderBottomWidth: 3, borderBottomColor: '#8b1a1a' },
                  ]}
                >
                  <Text style={[styles.playerLabel, { color: '#8b1a1a' }]}>P2</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                    <Text style={[styles.scoreValue, { color: c.text }]}>
                      {scores[2]}
                    </Text>
                    {matchFormat > 1 && (
                      <Text style={{ color: '#8b1a1a', fontSize: 9, fontWeight: 'bold' }}>
                        ⭐{matchScores[2]}
                      </Text>
                    )}
                  </View>
                </View>
                {numPlayers >= 3 && (
                  <View
                    style={[
                      styles.playerScore,
                      currentPlayer === 3 && { borderBottomWidth: 3, borderBottomColor: '#2a6e3f' },
                    ]}
                  >
                    <Text style={[styles.playerLabel, { color: '#2a6e3f' }]}>P3</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                      <Text style={[styles.scoreValue, { color: c.text }]}>
                        {scores[3]}
                      </Text>
                      {matchFormat > 1 && (
                        <Text style={{ color: '#2a6e3f', fontSize: 9, fontWeight: 'bold' }}>
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
                      currentPlayer === 4 && { borderBottomWidth: 3, borderBottomColor: '#c4872a' },
                    ]}
                  >
                    <Text style={[styles.playerLabel, { color: '#c4872a' }]}>P4</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                      <Text style={[styles.scoreValue, { color: c.text }]}>
                        {scores[4]}
                      </Text>
                      {matchFormat > 1 && (
                        <Text style={{ color: '#c4872a', fontSize: 9, fontWeight: 'bold' }}>
                          ⭐{matchScores[4]}
                        </Text>
                      )}
                    </View>
                  </View>
                )}
              </View>
              )}
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
            {localBanner
            ? `${language === 'fr' ? 'Tour de' : 'Turn:'} ${localBanner.names[localBanner.currentIdx]}`
            : numPlayers === 1
            ? `${language === 'fr' ? 'Question' : 'Question'} ${currentRound}/${totalRounds}`
            : language === 'fr' ? `Tour Joueur ${currentPlayer}` : `Player ${currentPlayer}'s Turn`}
          </Text>

          {!isMobile ? (
            <View style={[styles.card, !isDarkMode && styles.cardLight]}>
              <Image source={{ uri: getFlagUrl(question.cca3) }} style={styles.flag} />
              {currentQuestionType === 'CAPITAL' && (
                <Text style={[styles.countryName, { color: c.text }]}>
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
                        { color: c.text },
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
                  { borderColor: '#8b1a1a' },
                ]}
                onPress={() => setMode('DUO')}
              >
                <HelpCircle color="#8b1a1a" size={24} />
                <Text style={[styles.modeBtnTitle, { color: '#8b1a1a' }]}>DUO</Text>
                <Text style={styles.modeBtnPoints}>1 PT</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  !isDarkMode && styles.modeBtnLight,
                  { borderColor: '#4a9eff' },
                ]}
                onPress={() => setMode('CARRE')}
              >
                <Eye color="#4a9eff" size={24} />
                <Text style={[styles.modeBtnTitle, { color: '#4a9eff' }]}>CARRÉ</Text>
                <Text style={styles.modeBtnPoints}>3 PTS</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  !isDarkMode && styles.modeBtnLight,
                  { borderColor: '#2a6e3f' },
                ]}
                onPress={() => setMode('CASH')}
              >
                <CheckCircle color="#2a6e3f" size={24} />
                <Text style={[styles.modeBtnTitle, { color: '#2a6e3f' }]}>CASH</Text>
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
                <Text style={{ color: '#4a9eff', fontWeight: 'bold' }}>
                  ← {language === 'fr' ? 'RETOUR' : 'BACK'}
                </Text>
              </TouchableOpacity>
              <TextInput
                style={[styles.cashInput, !isDarkMode && styles.cashInputLight]}
                placeholder="Réponse..."
                placeholderTextColor="#4a6a88"
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
                <Text style={{ color: '#4a9eff', fontWeight: 'bold' }}>
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
                  <Text style={[styles.optionText, { color: c.text }]}>
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
                <Text style={[styles.feedbackTitle, { color: c.text }]}>
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
                    borderColor: feedback.correct ? '#8b1a1a' : '#2a6e3f',
                    borderWidth: 1,
                  }}
                  onPress={togglePoints}
                >
                  <Text
                    style={{ color: feedback.correct ? '#8b1a1a' : '#2a6e3f', fontWeight: 'bold' }}
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

        {gameOver && !isOnline && (
          <View style={[styles.overlay, !isDarkMode && styles.overlayLight]}>
            <Trophy color={numPlayers === 1 ? '#2a6e3f' : matchOver ? '#c4872a' : '#cbd5e1'} size={80} />
            <Text style={[styles.winnerTitle, { color: c.text }]}>
              {numPlayers === 1
                ? language === 'fr' ? 'TERMINÉ !' : 'DONE!'
                : !matchOver
                  ? winner === 0
                    ? language === 'fr' ? 'ÉGALITÉ !' : 'TIE !'
                    : `MANCHE GAGNÉE P${winner}`
                  : matchWinner === 0
                    ? language === 'fr' ? 'ÉGALITÉ DU MATCH !' : 'MATCH TIE !'
                    : `VICTOIRE DU MATCH P${matchWinner} !`}
            </Text>

            <Text
              style={[styles.finalScore, { color: c.textMuted }, { marginBottom: 10 }]}
            >
              {numPlayers === 1
                ? `${language === 'fr' ? 'Score :' : 'Score:'} ${scores[1]} pts`
                : `${language === 'fr' ? 'Score de la manche :' : 'Set score:'} ${scores[1]} - ${scores[2]}${numPlayers >= 3 ? ` - ${scores[3]}` : ''}${numPlayers === 4 ? ` - ${scores[4]}` : ''}`}
            </Text>

            {matchFormat > 1 && (
              <Text
                style={[styles.finalScore, { color: '#c04a1a', fontSize: 24, marginBottom: 40 }]}
              >
                {language === 'fr' ? 'Match (Étoiles) :' : 'Match (Stars):'} {matchScores[1]} ⭐ -{' '}
                {matchScores[2]} ⭐ {numPlayers === 3 ? `- ${matchScores[3]} ⭐` : ''}
              </Text>
            )}

            <View
              style={{ gap: 15, width: '100%', maxWidth: 300, marginTop: matchFormat > 1 ? 0 : 30 }}
            >
              {numPlayers === 1 ? (
                <TouchableOpacity style={styles.resetBtn} onPress={() => { resetMatch(); setNumPlayers(1); }}>
                  <Text style={styles.resetBtnText}>
                    {language === 'fr' ? 'REJOUER' : 'PLAY AGAIN'}
                  </Text>
                </TouchableOpacity>
              ) : !matchOver ? (
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
                  { backgroundColor: 'transparent', borderWidth: 2, borderColor: c.border },
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  containerLight: { backgroundColor: '#f2e8d0' },
  header: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a70',
    justifyContent: 'space-between',
    minHeight: 60,
  },
  headerLight: { backgroundColor: '#f2e8d0', borderBottomColor: '#c4a87a' },
  menuContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  backBtn: { position: 'absolute', top: isMobile ? 60 : 20, left: 20 },
  menuTitle: {
    fontSize: 32,
    fontFamily: FONTS.headingBlack,
    color: '#d8e8f4',
    textAlign: 'center',
    marginBottom: 40,
  },

  modeSelectionGrid: { width: '100%', maxWidth: 400, gap: 15 },
  playerPickBtn: {
    backgroundColor: '#1a4a7a',
    padding: 20,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 15,
    width: '100%',
  },
  playerPickText: { color: '#d8e8f4', fontSize: 24, fontFamily: FONTS.headingBlack },

  scoreBoard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    backgroundColor: '#132040',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  scoreBoardLight: {
    backgroundColor: '#e8d9b8',
  },
  playerScore: { alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2 },
  playerLabel: { fontSize: 8, fontFamily: FONTS.monoBold, marginBottom: -2 },
  scoreValue: { fontSize: 16, fontFamily: FONTS.headingBlack, color: '#d8e8f4' },
  roundInfo: {
    marginLeft: 15,
    borderLeftWidth: 1,
    borderLeftColor: '#2d4a70',
    paddingLeft: 10,
    justifyContent: 'center',
  },
  roundText: { color: '#4a6a88', fontSize: 12, fontFamily: FONTS.monoBold },
  iconBtn: { padding: 8, backgroundColor: '#132040', borderRadius: 10 },

  gameArea: { flex: 1, padding: 20, alignItems: 'center' },
  turnIndicator: { fontSize: 18, fontFamily: FONTS.headingBlack, marginBottom: 20, textTransform: 'uppercase' },
  card: {
    backgroundColor: '#132040',
    padding: 30,
    borderRadius: 24,
    alignItems: 'center',
    marginBottom: 30,
    width: '100%',
    maxWidth: 600,
    borderWidth: 1,
    borderColor: '#2d4a70',
  },
  cardLight: { backgroundColor: '#e8d9b8', borderColor: '#c4a87a', elevation: 4, shadowOpacity: 0.1 },
  flag: { width: 120, height: 80, borderRadius: 12, marginBottom: 15 },
  countryName: { fontSize: 32, fontFamily: FONTS.headingBlack, color: '#d8e8f4', textAlign: 'center' },
  instruction: { color: '#4a6a88', fontSize: 14, fontFamily: FONTS.mono, marginTop: 10 },

  optionsGrid: { gap: 12, width: '100%', maxWidth: 500 },
  optionBtn: {
    backgroundColor: '#132040',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2d4a70',
  },
  optionBtnLight: { backgroundColor: '#e8d9b8', borderColor: '#c4a87a', elevation: 2 },
  optionText: { color: '#d8e8f4', fontSize: 18, fontFamily: FONTS.heading },

  modeSelection: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    maxWidth: 500,
    justifyContent: 'center',
  },
  modeBtn: {
    flex: 1,
    backgroundColor: '#132040',
    padding: 15,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
  },
  modeBtnLight: { backgroundColor: '#e8d9b8', borderColor: '#c4a87a' },
  modeBtnTitle: { fontSize: 14, fontFamily: FONTS.monoBold, marginTop: 8 },
  modeBtnPoints: { fontSize: 10, color: '#4a6a88', fontFamily: FONTS.mono },

  cashContainer: { width: '100%', maxWidth: 500, gap: 12 },
  cashInput: {
    backgroundColor: '#132040',
    color: '#d8e8f4',
    padding: 20,
    borderRadius: 16,
    fontSize: 18,
    fontFamily: FONTS.monoBold,
    textAlign: 'center',
    borderWidth: 2,
    borderColor: '#2d4a70',
  },
  cashInputLight: { backgroundColor: '#e8d9b8', color: '#2c1810', borderColor: '#c4a87a' },
  cashSubmitBtn: {
    backgroundColor: '#2a6e3f',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  cashSubmitText: { color: '#fff', fontFamily: FONTS.monoBold, fontSize: 16 },

  feedbackCard: {
    padding: 30,
    borderRadius: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 500,
  },
  correctCard: {
    backgroundColor: 'rgba(42, 110, 63, 0.15)',
    borderWidth: 2,
    borderColor: '#2a6e3f',
  },
  wrongCard: { backgroundColor: 'rgba(139, 26, 26, 0.15)', borderWidth: 2, borderColor: '#8b1a1a' },
  feedbackEmoji: { fontSize: 40, marginBottom: 10 },
  feedbackTitle: { fontSize: 24, fontFamily: FONTS.headingBlack, color: '#d8e8f4', marginBottom: 5 },
  feedbackSub: { fontSize: 16, color: '#7aa0c4', textAlign: 'center', fontFamily: FONTS.mono },

  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 22, 40, 0.97)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  overlayLight: { backgroundColor: 'rgba(242, 232, 208, 0.98)' },
  winnerTitle: { fontSize: 40, fontFamily: FONTS.headingBlack, color: '#d8e8f4', marginVertical: 20 },
  finalScore: { fontSize: 32, fontFamily: FONTS.mono, color: '#7aa0c4', marginBottom: 40 },
  resetBtn: {
    backgroundColor: '#c04a1a',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  resetBtnText: { color: '#fff', fontFamily: FONTS.monoBold, fontSize: 18 },
});
