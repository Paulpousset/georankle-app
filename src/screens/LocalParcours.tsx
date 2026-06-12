import React, { useRef, useState } from 'react';
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Crown,
  Flag,
  Globe,
  Info,
  LayoutGrid,
  Minus,
  Play,
  Plus,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react-native';

import { getColors } from '../theme/colors';
import { PALETTE } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import type { GameMode, Language, Match, MatchMode } from '../types';

import VersusCapitals from './VersusCapitals';
import StreakGame from './StreakGame';
import GuessCountryGame from './GuessCountryGame';
import FindCountryGame from './FindCountryGame';
import { ClassicGame } from './ClassicGame';

// ─── Mode catalogue ───────────────────────────────────────────────────────────

type ModeKey = 'capital' | 'flag' | 'mix' | 'classic' | 'streak' | 'guess' | 'globe';

interface ModeDef {
  key: ModeKey;
  fr: string;
  en: string;
  icon: any;
  accent: string;
  /** 'config' = round count is editable; 'fixed' = the mode has its own length. */
  rounds: 'config' | 'fixed';
  defaultRounds: number;
  /** Label shown for the round count / length. */
  unitFr: string;
  unitEn: string;
}

const MODES: Record<ModeKey, ModeDef> = {
  capital: { key: 'capital', fr: 'Capitales', en: 'Capitals', icon: Flag, accent: PALETTE.sand, rounds: 'config', defaultRounds: 5, unitFr: 'questions', unitEn: 'questions' },
  flag: { key: 'flag', fr: 'Drapeaux', en: 'Flags', icon: Flag, accent: PALETTE.vermilion, rounds: 'config', defaultRounds: 5, unitFr: 'questions', unitEn: 'questions' },
  mix: { key: 'mix', fr: 'Mix Capitales/Drapeaux', en: 'Mix Capitals/Flags', icon: Flag, accent: PALETTE.brown, rounds: 'config', defaultRounds: 5, unitFr: 'questions', unitEn: 'questions' },
  guess: { key: 'guess', fr: 'Devine le Pays', en: 'Guess Country', icon: Info, accent: PALETTE.vermilion, rounds: 'config', defaultRounds: 3, unitFr: 'pays', unitEn: 'countries' },
  classic: { key: 'classic', fr: 'Population', en: 'Population', icon: LayoutGrid, accent: PALETTE.forestGreen, rounds: 'fixed', defaultRounds: 1, unitFr: '8 thèmes', unitEn: '8 themes' },
  streak: { key: 'streak', fr: 'Streak', en: 'Streak', icon: Zap, accent: PALETTE.sand, rounds: 'fixed', defaultRounds: 1, unitFr: "jusqu'à l'erreur", unitEn: 'until a miss' },
  globe: { key: 'globe', fr: 'Globe Géo', en: 'Geo Globe', icon: Globe, accent: PALETTE.oceanBlue, rounds: 'fixed', defaultRounds: 1, unitFr: '5 pays', unitEn: '5 countries' },
};

const MODE_ORDER: ModeKey[] = ['capital', 'flag', 'mix', 'guess', 'classic', 'streak', 'globe'];

/**
 * Modes that play one question at a time, so players can alternate question by
 * question (like the native Versus). The others (classic/streak/globe) are
 * atomic sessions: a player plays the whole thing in one turn.
 */
const QUESTION_MODES: ModeKey[] = ['capital', 'flag', 'mix', 'guess'];
const isPerQuestion = (mode: ModeKey) => QUESTION_MODES.includes(mode);

function toMatchMode(mode: ModeKey): MatchMode {
  switch (mode) {
    case 'classic': return 'classic';
    case 'streak': return 'streak';
    case 'guess': return 'guess';
    case 'globe': return 'globe';
    default: return 'versus';
  }
}

function versusType(mode: ModeKey): string | undefined {
  if (mode === 'capital') return 'CAPITAL';
  if (mode === 'flag') return 'FLAG';
  if (mode === 'mix') return 'MIX';
  return undefined;
}

/** Build an in-memory Match so each mode runs as a local solo round. */
function makeSyntheticMatch(mode: ModeKey, seed: number, rounds: number, currentRound: number): Match {
  return {
    id: 'local-parcours',
    player1_id: 'local-p1',
    player2_id: null,
    game_mode: toMatchMode(mode),
    status: 'in_progress',
    is_public: false,
    is_ranked: false,
    best_of: 1,
    p1_rounds_won: 0,
    p2_rounds_won: 0,
    p1_current_score: 0,
    p2_current_score: 0,
    current_round: currentRound,
    p1_finished_round: false,
    p2_finished_round: false,
    game_data: {
      seed,
      questionType: versusType(mode),
      roundsPerSet: rounds,
    },
  };
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface Manche {
  id: string;
  mode: ModeKey;
  rounds: number;
}

/** How many turns-per-player a manche has (1 for atomic modes). */
const questionCountOf = (m: Manche) => (isPerQuestion(m.mode) ? m.rounds : 1);

type Step =
  | { phase: 'builder' }
  | { phase: 'pass'; mancheIdx: number; questionIdx: number; playerIdx: number }
  | { phase: 'play'; mancheIdx: number; questionIdx: number; playerIdx: number }
  | { phase: 'mancheSummary'; mancheIdx: number }
  | { phase: 'results' };

interface LocalParcoursProps {
  isDarkMode: boolean;
  setIsDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  language: Language;
  setLanguage: React.Dispatch<React.SetStateAction<Language>>;
  onToggleTheme: () => void;
  onToggleLanguage: () => void;
  onExit: () => void;
}

let mancheCounter = 0;
const newMancheId = () => `m${mancheCounter++}`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function LocalParcours({
  isDarkMode,
  setIsDarkMode,
  language,
  setLanguage,
  onToggleTheme,
  onToggleLanguage,
  onExit,
}: LocalParcoursProps) {
  const insets = useSafeAreaInsets();
  const c = getColors(isDarkMode);

  const [names, setNames] = useState<string[]>(['Joueur 1', 'Joueur 2']);
  const [manches, setManches] = useState<Manche[]>([
    { id: newMancheId(), mode: 'capital', rounds: MODES.capital.defaultRounds },
  ]);

  const [seeds, setSeeds] = useState<number[]>([]);
  // scores[mancheIdx][playerIdx]
  const [scores, setScores] = useState<number[][]>([]);
  const [step, setStep] = useState<Step>({ phase: 'builder' });
  const handledKey = useRef<string>('');

  const numPlayers = names.length;

  // ── Builder mutators ────────────────────────────────────────────────────────

  const setPlayerCount = (n: number) => {
    const clamped = Math.max(2, Math.min(8, n));
    setNames((prev) => {
      if (clamped === prev.length) return prev;
      if (clamped < prev.length) return prev.slice(0, clamped);
      const next = [...prev];
      for (let i = prev.length; i < clamped; i++) next.push(`${tr(language, 'Joueur', 'Player')} ${i + 1}`);
      return next;
    });
  };

  const renamePlayer = (idx: number, value: string) =>
    setNames((prev) => prev.map((n, i) => (i === idx ? value : n)));

  const addManche = (mode: ModeKey) =>
    setManches((prev) => [...prev, { id: newMancheId(), mode, rounds: MODES[mode].defaultRounds }]);

  const removeManche = (idx: number) =>
    setManches((prev) => prev.filter((_, i) => i !== idx));

  const moveManche = (idx: number, dir: -1 | 1) =>
    setManches((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });

  const changeRounds = (idx: number, delta: number) =>
    setManches((prev) =>
      prev.map((m, i) =>
        i === idx ? { ...m, rounds: Math.max(1, Math.min(20, m.rounds + delta)) } : m,
      ),
    );

  // ── Run control ───────────────────────────────────────────────────────────

  const launch = () => {
    if (manches.length === 0) return;
    setSeeds(manches.map(() => Math.floor(Math.random() * 2_000_000_000)));
    setScores(manches.map(() => names.map(() => 0)));
    handledKey.current = '';
    setStep({ phase: 'pass', mancheIdx: 0, questionIdx: 0, playerIdx: 0 });
  };

  const restartSameParcours = () => {
    setSeeds(manches.map(() => Math.floor(Math.random() * 2_000_000_000)));
    setScores(manches.map(() => names.map(() => 0)));
    handledKey.current = '';
    setStep({ phase: 'pass', mancheIdx: 0, questionIdx: 0, playerIdx: 0 });
  };

  const handleRoundComplete = (score: number) => {
    if (step.phase !== 'play') return;
    const key = `${step.mancheIdx}-${step.questionIdx}-${step.playerIdx}`;
    if (handledKey.current === key) return; // guard against double-fire
    handledKey.current = key;

    // Each turn = one question (per-question modes) or one whole session
    // (atomic modes). Accumulate the player's running total for the manche.
    const inc = Number.isFinite(score) ? score : 0;
    setScores((prev) => {
      const cp = prev.map((row) => row.slice());
      cp[step.mancheIdx][step.playerIdx] += inc;
      return cp;
    });

    const manche = manches[step.mancheIdx];
    const questionCount = questionCountOf(manche);

    // Advance: player by player within a question, then to the next question.
    if (step.playerIdx + 1 < numPlayers) {
      setStep({ phase: 'pass', mancheIdx: step.mancheIdx, questionIdx: step.questionIdx, playerIdx: step.playerIdx + 1 });
    } else if (step.questionIdx + 1 < questionCount) {
      setStep({ phase: 'pass', mancheIdx: step.mancheIdx, questionIdx: step.questionIdx + 1, playerIdx: 0 });
    } else {
      setStep({ phase: 'mancheSummary', mancheIdx: step.mancheIdx });
    }
  };

  const startPlayerTurn = (mancheIdx: number, questionIdx: number, playerIdx: number) => {
    handledKey.current = '';
    setStep({ phase: 'play', mancheIdx, questionIdx, playerIdx });
  };

  const nextAfterSummary = (mancheIdx: number) => {
    if (mancheIdx + 1 < manches.length) {
      setStep({ phase: 'pass', mancheIdx: mancheIdx + 1, questionIdx: 0, playerIdx: 0 });
    } else {
      setStep({ phase: 'results' });
    }
  };

  // ── Derived: standings ──────────────────────────────────────────────────────

  const computeStandings = () => {
    const totals = names.map((_, p) => scores.reduce((s, row) => s + (row[p] ?? 0), 0));
    const manchesWon = names.map(() => 0);
    scores.forEach((row) => {
      const max = Math.max(...row);
      row.forEach((v, p) => {
        if (v === max && max > 0) manchesWon[p] += 1;
      });
    });
    const order = names
      .map((name, p) => ({ name, p, total: totals[p], won: manchesWon[p] }))
      .sort((a, b) => (b.won - a.won) || (b.total - a.total));
    return order;
  };

  // ── Render: the live game mode ──────────────────────────────────────────────

  const renderActiveMode = (s: Extract<Step, { phase: 'play' }>) => {
    const manche = manches[s.mancheIdx];
    const perQuestion = isPerQuestion(manche.mode);
    // Distinct seed per (player, question) so nobody gets the same questions.
    const baseSeed = seeds[s.mancheIdx] ?? 1;
    const turnSeed = (baseSeed + s.playerIdx * 100003 + s.questionIdx * 1009) | 0;
    // Per-question modes run a single question per turn; atomic modes run their
    // whole session in one turn.
    const roundsParam = perQuestion ? 1 : manche.rounds;
    const match = makeSyntheticMatch(manche.mode, turnSeed, roundsParam, 1);
    const key = `${manche.id}-${s.questionIdx}-${s.playerIdx}`;
    const quit = () => onExit();

    switch (manche.mode) {
      case 'capital':
      case 'flag':
      case 'mix':
        return (
          <VersusCapitals
            key={key}
            isDarkMode={isDarkMode}
            setIsDarkMode={setIsDarkMode}
            setGameMode={quit as (m: GameMode) => void}
            language={language}
            matchData={match}
            onRoundComplete={handleRoundComplete}
            onExit={quit}
          />
        );
      case 'streak':
        return (
          <StreakGame
            key={key}
            isDarkMode={isDarkMode}
            setIsDarkMode={setIsDarkMode}
            setGameMode={quit as (m: GameMode) => void}
            language={language}
            setLanguage={setLanguage}
            user={null}
            matchData={match}
            onRoundComplete={handleRoundComplete}
          />
        );
      case 'guess':
        return (
          <GuessCountryGame
            key={key}
            isDarkMode={isDarkMode}
            language={language}
            onBackToMenu={quit}
            user={null}
            matchData={match}
            onRoundComplete={handleRoundComplete}
          />
        );
      case 'globe':
        return (
          <FindCountryGame
            key={key}
            isDarkMode={isDarkMode}
            language={language}
            setGameMode={quit as (m: GameMode) => void}
            user={null}
            matchData={match}
            onRoundComplete={handleRoundComplete}
          />
        );
      case 'classic':
        return (
          <ClassicGame
            key={key}
            isDarkMode={isDarkMode}
            language={language}
            user={null}
            matchData={match}
            onRoundComplete={handleRoundComplete}
            onExit={quit}
            onToggleTheme={onToggleTheme}
            onToggleLanguage={onToggleLanguage}
          />
        );
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  if (step.phase === 'play') {
    return renderActiveMode(step) ?? null;
  }

  // ── BUILDER ─────────────────────────────────────────────────────────────────

  if (step.phase === 'builder') {
    return (
      <ParcoursScreen isDarkMode={isDarkMode} background={c.background}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
          <TouchableOpacity onPress={onExit} style={{ padding: 8 }}>
            <ArrowLeft color={c.text} size={22} />
          </TouchableOpacity>
          <Text style={{ flex: 1, fontFamily: FONTS.headingBlack, color: c.text, fontSize: 22, textAlign: 'center' }}>
            {tr(language, 'Construire la partie', 'Build the game')}
          </Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
          {/* Players */}
          <Text style={sectionLabel(c)}>{tr(language, 'JOUEURS', 'PLAYERS')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 14, padding: 6, alignSelf: 'flex-start', marginBottom: 12 }}>
            <Stepper onPress={() => setPlayerCount(numPlayers - 1)} disabled={numPlayers <= 2} icon={Minus} c={c} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18 }}>
              <Users color={c.text} size={20} />
              <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 20 }}>{numPlayers}</Text>
            </View>
            <Stepper onPress={() => setPlayerCount(numPlayers + 1)} disabled={numPlayers >= 8} icon={Plus} c={c} />
          </View>

          <View style={{ gap: 8, marginBottom: 24 }}>
            {names.map((name, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: PLAYER_COLORS[i % PLAYER_COLORS.length], alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontFamily: FONTS.monoBold, fontSize: 12 }}>{i + 1}</Text>
                </View>
                <TextInput
                  value={name}
                  onChangeText={(v) => renamePlayer(i, v)}
                  placeholder={`${tr(language, 'Joueur', 'Player')} ${i + 1}`}
                  placeholderTextColor={c.textFaint}
                  style={{ flex: 1, backgroundColor: c.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: c.text, fontFamily: FONTS.mono, fontSize: 14 }}
                />
              </View>
            ))}
          </View>

          {/* Manches */}
          <Text style={sectionLabel(c)}>
            {tr(language, 'MANCHES', 'ROUNDS')} ({manches.length})
          </Text>
          {manches.length === 0 && (
            <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 12, marginBottom: 12 }}>
              {tr(language, 'Ajoute au moins une manche ci-dessous.', 'Add at least one round below.')}
            </Text>
          )}
          <View style={{ gap: 10, marginBottom: 20 }}>
            {manches.map((m, i) => {
              const def = MODES[m.mode];
              const Icon = def.icon;
              return (
                <View key={m.id} style={{ backgroundColor: c.card, borderRadius: 14, padding: 12, borderLeftWidth: 4, borderLeftColor: def.accent }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontFamily: FONTS.monoBold, color: c.textFaint, fontSize: 12, width: 22 }}>{i + 1}</Text>
                    <Icon color={def.accent} size={20} />
                    <Text style={{ flex: 1, fontFamily: FONTS.monoBold, color: c.text, fontSize: 14 }}>
                      {tr(language, def.fr, def.en)}
                    </Text>
                    <TouchableOpacity onPress={() => moveManche(i, -1)} disabled={i === 0} style={{ padding: 4, opacity: i === 0 ? 0.3 : 1 }}>
                      <ChevronUp color={c.text} size={18} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => moveManche(i, 1)} disabled={i === manches.length - 1} style={{ padding: 4, opacity: i === manches.length - 1 ? 0.3 : 1 }}>
                      <ChevronDown color={c.text} size={18} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeManche(i)} style={{ padding: 4 }}>
                      <X color={PALETTE.vermilion} size={18} />
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginLeft: 32 }}>
                    {def.rounds === 'config' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Stepper onPress={() => changeRounds(i, -1)} disabled={m.rounds <= 1} icon={Minus} c={c} small />
                        <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 14, minWidth: 60 }}>
                          {m.rounds} {tr(language, def.unitFr, def.unitEn)}
                        </Text>
                        <Stepper onPress={() => changeRounds(i, 1)} disabled={m.rounds >= 20} icon={Plus} c={c} small />
                      </View>
                    ) : (
                      <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 12 }}>
                        {tr(language, def.unitFr, def.unitEn)}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {/* Add a manche */}
          <Text style={sectionLabel(c)}>{tr(language, 'AJOUTER UNE MANCHE', 'ADD A ROUND')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MODE_ORDER.map((key) => {
              const def = MODES[key];
              const Icon = def.icon;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => addManche(key)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: c.border }}
                >
                  <Icon color={def.accent} size={15} />
                  <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 12 }}>{tr(language, def.fr, def.en)}</Text>
                  <Plus color={c.textFaint} size={13} />
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* Launch */}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: insets.bottom + 16, backgroundColor: c.background, borderTopWidth: 1, borderTopColor: c.border }}>
          <TouchableOpacity
            onPress={launch}
            disabled={manches.length === 0}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: manches.length === 0 ? c.border : PALETTE.forestGreen, borderRadius: 16, paddingVertical: 16 }}
          >
            <Play color="#fff" size={20} />
            <Text style={{ fontFamily: FONTS.monoBold, color: '#fff', fontSize: 16 }}>
              {tr(language, 'LANCER LA PARTIE', 'START THE GAME')}
            </Text>
          </TouchableOpacity>
        </View>
      </ParcoursScreen>
    );
  }

  // ── PASS THE PHONE ────────────────────────────────────────────────────────

  if (step.phase === 'pass') {
    const manche = manches[step.mancheIdx];
    const def = MODES[manche.mode];
    const Icon = def.icon;
    const standings = computeStandings();
    const perQuestion = isPerQuestion(manche.mode);
    const questionCount = questionCountOf(manche);
    const showStandings = step.mancheIdx > 0 || step.questionIdx > 0 || step.playerIdx > 0;
    return (
      <ParcoursScreen isDarkMode={isDarkMode} background={c.background}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 12, letterSpacing: 2, marginBottom: 8 }}>
            {tr(language, 'MANCHE', 'ROUND')} {step.mancheIdx + 1}/{manches.length}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: perQuestion ? 12 : 28 }}>
            <Icon color={def.accent} size={26} />
            <Text style={{ fontFamily: FONTS.headingBlack, color: c.text, fontSize: 24 }}>{tr(language, def.fr, def.en)}</Text>
          </View>
          {perQuestion && (
            <Text style={{ fontFamily: FONTS.monoBold, color: def.accent, fontSize: 14, letterSpacing: 1, marginBottom: 24 }}>
              {tr(language, 'QUESTION', 'QUESTION')} {step.questionIdx + 1}/{questionCount}
            </Text>
          )}

          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: PLAYER_COLORS[step.playerIdx % PLAYER_COLORS.length], alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Text style={{ color: '#fff', fontFamily: FONTS.headingBlack, fontSize: 32 }}>{step.playerIdx + 1}</Text>
          </View>
          <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 14, marginBottom: 4 }}>
            {tr(language, 'Passe le téléphone à', 'Pass the phone to')}
          </Text>
          <Text style={{ fontFamily: FONTS.headingBlack, color: c.text, fontSize: 26, marginBottom: 36, textAlign: 'center' }}>
            {names[step.playerIdx]}
          </Text>

          <TouchableOpacity
            onPress={() => startPlayerTurn(step.mancheIdx, step.questionIdx, step.playerIdx)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: def.accent, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 44 }}
          >
            <Play color="#fff" size={20} />
            <Text style={{ fontFamily: FONTS.monoBold, color: '#fff', fontSize: 16 }}>{tr(language, 'COMMENCER', 'START')}</Text>
          </TouchableOpacity>

          {showStandings && (
            <View style={{ marginTop: 40, width: '100%', maxWidth: 360 }}>
              <Text style={[sectionLabel(c), { textAlign: 'center' }]}>{tr(language, 'CLASSEMENT', 'STANDINGS')}</Text>
              {standings.map((row) => (
                <View key={row.p} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <Text style={{ fontFamily: FONTS.mono, color: c.text, fontSize: 13 }}>{row.name}</Text>
                  <Text style={{ fontFamily: FONTS.monoBold, color: c.textMuted, fontSize: 13 }}>
                    {row.won} {tr(language, 'manche(s)', 'round(s)')}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ParcoursScreen>
    );
  }

  // ── MANCHE SUMMARY ──────────────────────────────────────────────────────────

  if (step.phase === 'mancheSummary') {
    const manche = manches[step.mancheIdx];
    const def = MODES[manche.mode];
    const row = scores[step.mancheIdx] ?? names.map(() => 0);
    const max = Math.max(...row);
    const ranked = names
      .map((name, p) => ({ name, p, score: row[p] ?? 0 }))
      .sort((a, b) => b.score - a.score);
    const isLast = step.mancheIdx + 1 >= manches.length;
    return (
      <ParcoursScreen isDarkMode={isDarkMode} background={c.background}>
        <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 12, letterSpacing: 2, textAlign: 'center' }}>
            {tr(language, 'RÉSULTAT MANCHE', 'ROUND RESULT')} {step.mancheIdx + 1}
          </Text>
          <Text style={{ fontFamily: FONTS.headingBlack, color: c.text, fontSize: 24, textAlign: 'center', marginBottom: 28 }}>
            {tr(language, def.fr, def.en)}
          </Text>

          <View style={{ gap: 10, marginBottom: 36 }}>
            {ranked.map((r, idx) => {
              const isWinner = r.score === max && max > 0;
              return (
                <View key={r.p} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 14, padding: 14, borderWidth: isWinner ? 2 : 0, borderColor: PALETTE.sand }}>
                  <Text style={{ fontFamily: FONTS.monoBold, color: c.textFaint, fontSize: 16, width: 22 }}>{idx + 1}</Text>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: PLAYER_COLORS[r.p % PLAYER_COLORS.length], alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontFamily: FONTS.monoBold, fontSize: 12 }}>{r.p + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, fontFamily: FONTS.monoBold, color: c.text, fontSize: 15 }}>{r.name}</Text>
                  {isWinner && <Crown color={PALETTE.sand} size={18} />}
                  <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 18 }}>{r.score}</Text>
                </View>
              );
            })}
          </View>

          <TouchableOpacity
            onPress={() => nextAfterSummary(step.mancheIdx)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: PALETTE.forestGreen, borderRadius: 16, paddingVertical: 16 }}
          >
            <Text style={{ fontFamily: FONTS.monoBold, color: '#fff', fontSize: 16 }}>
              {isLast ? tr(language, 'VOIR LES RÉSULTATS', 'SEE RESULTS') : tr(language, 'MANCHE SUIVANTE', 'NEXT ROUND')}
            </Text>
          </TouchableOpacity>
        </View>
      </ParcoursScreen>
    );
  }

  // ── FINAL RESULTS ───────────────────────────────────────────────────────────

  // step.phase === 'results'
  const standings = computeStandings();
  return (
    <ParcoursScreen isDarkMode={isDarkMode} background={c.background}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
        <View style={{ alignItems: 'center', marginBottom: 28, marginTop: 12 }}>
          <Trophy color={PALETTE.sand} size={48} />
          <Text style={{ fontFamily: FONTS.headingBlack, color: c.text, fontSize: 26, marginTop: 10 }}>
            {tr(language, 'Partie terminée', 'Game over')}
          </Text>
          {standings[0] && (
            <Text style={{ fontFamily: FONTS.monoBold, color: PALETTE.sand, fontSize: 16, marginTop: 4 }}>
              🏆 {standings[0].name}
            </Text>
          )}
        </View>

        <View style={{ gap: 10, marginBottom: 32 }}>
          {standings.map((row, idx) => (
            <View key={row.p} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 14, padding: 16, borderWidth: idx === 0 ? 2 : 0, borderColor: PALETTE.sand }}>
              <Text style={{ fontFamily: FONTS.headingBlack, color: idx === 0 ? PALETTE.sand : c.textFaint, fontSize: 22, width: 26 }}>{idx + 1}</Text>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: PLAYER_COLORS[row.p % PLAYER_COLORS.length], alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontFamily: FONTS.monoBold, fontSize: 13 }}>{row.p + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 16 }}>{row.name}</Text>
                <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 11 }}>
                  {row.won} {tr(language, 'manche(s) gagnée(s)', 'round(s) won')} · {row.total} {tr(language, 'pts cumulés', 'total pts')}
                </Text>
              </View>
              {idx === 0 && <Crown color={PALETTE.sand} size={22} />}
            </View>
          ))}
        </View>

        {/* Per-manche breakdown */}
        <Text style={sectionLabel(c)}>{tr(language, 'DÉTAIL PAR MANCHE', 'PER-ROUND BREAKDOWN')}</Text>
        <View style={{ gap: 6, marginBottom: 28 }}>
          {manches.map((m, mi) => {
            const def = MODES[m.mode];
            const row = scores[mi] ?? [];
            const max = Math.max(...(row.length ? row : [0]));
            return (
              <View key={m.id} style={{ backgroundColor: c.card, borderRadius: 12, padding: 12 }}>
                <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 13, marginBottom: 6 }}>
                  {mi + 1}. {tr(language, def.fr, def.en)}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  {names.map((name, p) => (
                    <Text key={p} style={{ fontFamily: FONTS.mono, color: row[p] === max && max > 0 ? PALETTE.sand : c.textMuted, fontSize: 12 }}>
                      {name}: {row[p] ?? 0}
                    </Text>
                  ))}
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ gap: 10 }}>
          <TouchableOpacity onPress={restartSameParcours} style={{ backgroundColor: PALETTE.forestGreen, borderRadius: 16, paddingVertical: 15, alignItems: 'center' }}>
            <Text style={{ fontFamily: FONTS.monoBold, color: '#fff', fontSize: 15 }}>{tr(language, 'REJOUER LE MÊME PARCOURS', 'REPLAY SAME GAME')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep({ phase: 'builder' })} style={{ backgroundColor: c.card, borderRadius: 16, paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: c.border }}>
            <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 15 }}>{tr(language, 'MODIFIER LE PARCOURS', 'EDIT THE GAME')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onExit} style={{ paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 13 }}>{tr(language, 'Retour au menu', 'Back to menu')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ParcoursScreen>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function ParcoursScreen({ isDarkMode, background, children }: { isDarkMode: boolean; background: string; children: React.ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: background }}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      {children}
    </SafeAreaView>
  );
}

const PLAYER_COLORS = [PALETTE.oceanBlue, PALETTE.vermilion, PALETTE.forestGreen, PALETTE.sand, PALETTE.brown, '#7a3f9a', '#2a9d9d', '#9a2a5c'];

const sectionLabel = (c: ReturnType<typeof getColors>) => ({
  fontFamily: FONTS.monoBold,
  color: c.textMuted,
  fontSize: 11,
  letterSpacing: 1.5,
  marginBottom: 10,
});

function Stepper({ onPress, disabled, icon: Icon, c, small }: { onPress: () => void; disabled?: boolean; icon: any; c: ReturnType<typeof getColors>; small?: boolean }) {
  const size = small ? 30 : 38;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}
    >
      <Icon color={c.text} size={small ? 15 : 18} />
    </TouchableOpacity>
  );
}
