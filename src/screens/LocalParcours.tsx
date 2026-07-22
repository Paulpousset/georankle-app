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
  Check,
  ChevronDown,
  ChevronUp,
  Crown,
  Eye,
  Flag,
  Globe,
  Info,
  LayoutGrid,
  Map,
  Minus,
  Pencil,
  Play,
  Plus,
  Puzzle,
  Route,
  TrendingUp,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react-native';

import { track } from '../lib/analytics';
import { showAlert } from '../lib/alert';
import { getColors } from '../theme/colors';
import { PALETTE } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { a11yButton, announce, a11yImage, a11yHidden, ICON_HIT_SLOP } from '../lib/a11y';
import { ScoreText } from '../components/ScoreText';
import type { GameMode, Match, MatchMode } from '../types';

import VersusCapitals from './VersusCapitals';
import StreakGame from './StreakGame';
import HigherLowerGame from './HigherLowerGame';
import SilhouetteGame from './SilhouetteGame';
import BordersGame from './BordersGame';
import GuessCountryGame from './GuessCountryGame';
import FindCountryGame from './FindCountryGame';
import FindRegionGame from './FindRegionGame';
import RegionCountryPicker, { type RegionPick } from './RegionCountryPicker';
import { ClassicGame, type ClassicSessionResult } from './ClassicGame';

// ─── Mode catalogue ───────────────────────────────────────────────────────────

type ModeKey = 'capital' | 'flag' | 'classic' | 'streak' | 'guess' | 'globe' | 'regions' | 'higherlower' | 'silhouette' | 'borders';

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
  guess: { key: 'guess', fr: 'Devine le Pays', en: 'Guess Country', icon: Info, accent: PALETTE.vermilion, rounds: 'config', defaultRounds: 3, unitFr: 'pays', unitEn: 'countries' },
  classic: { key: 'classic', fr: 'Rankle', en: 'Rankle', icon: LayoutGrid, accent: PALETTE.forestGreen, rounds: 'fixed', defaultRounds: 1, unitFr: '8 thèmes', unitEn: '8 themes' },
  streak: { key: 'streak', fr: 'Streak', en: 'Streak', icon: Zap, accent: PALETTE.sand, rounds: 'fixed', defaultRounds: 1, unitFr: "jusqu'à l'erreur", unitEn: 'until a miss' },
  higherlower: { key: 'higherlower', fr: 'Plus ou Moins', en: 'Higher or Lower', icon: TrendingUp, accent: PALETTE.chartBlue, rounds: 'fixed', defaultRounds: 1, unitFr: "jusqu'à l'erreur", unitEn: 'until a miss' },
  silhouette: { key: 'silhouette', fr: 'Silhouette', en: 'Silhouette', icon: Puzzle, accent: PALETTE.forestGreen, rounds: 'config', defaultRounds: 5, unitFr: 'formes', unitEn: 'shapes' },
  borders: { key: 'borders', fr: 'Frontières', en: 'Borders', icon: Route, accent: PALETTE.sand, rounds: 'fixed', defaultRounds: 1, unitFr: '1 trajet', unitEn: '1 route' },
  globe: { key: 'globe', fr: 'Globe Géo', en: 'Geo Globe', icon: Globe, accent: PALETTE.oceanBlue, rounds: 'config', defaultRounds: 5, unitFr: 'rounds', unitEn: 'rounds' },
  regions: { key: 'regions', fr: 'Défis Pays', en: 'Country Challenges', icon: Map, accent: PALETTE.oceanBlue, rounds: 'config', defaultRounds: 5, unitFr: 'rounds', unitEn: 'rounds' },
};

const MODE_ORDER: ModeKey[] = ['globe', 'regions', 'guess', 'borders', 'silhouette', 'higherlower', 'classic', 'streak', 'capital', 'flag'];

/**
 * Modes that inherently play one question per turn, so players alternate
 * question by question. streak is atomic (no fixed round count).
 */
const QUESTION_MODES: ModeKey[] = ['capital', 'flag', 'guess', 'classic'];

/**
 * Round-based modes (globe, regions) run their whole multi-round session as one
 * atomic turn by default. Played turn-by-turn they're split one round per turn,
 * so players alternate every round instead of one player finishing the entire
 * session before the phone is passed.
 */
const SPLITTABLE_MODES: ModeKey[] = ['globe', 'regions'];

function toMatchMode(mode: ModeKey): MatchMode {
  switch (mode) {
    case 'classic': return 'classic';
    case 'streak': return 'streak';
    case 'higherlower': return 'higherlower';
    case 'silhouette': return 'silhouette';
    case 'borders': return 'borders';
    case 'guess': return 'guess';
    case 'globe': return 'globe';
    default: return 'versus';
  }
}

function versusType(mode: ModeKey): string | undefined {
  if (mode === 'capital') return 'CAPITAL';
  if (mode === 'flag') return 'FLAG';
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
  /** For the 'regions' mode: one or more countries/levels (a mix) chosen at build time. */
  region?: RegionPick[];
}

type Step =
  | { phase: 'builder' }
  | { phase: 'pass'; mancheIdx: number; questionIdx: number; playerIdx: number }
  | { phase: 'play'; mancheIdx: number; questionIdx: number; playerIdx: number }
  | { phase: 'mancheSummary'; mancheIdx: number }
  | { phase: 'results' };

interface LocalParcoursProps {
  onExit: () => void;
}

let mancheCounter = 0;
const newMancheId = () => `m${mancheCounter++}`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function LocalParcours({
  onExit,
}: LocalParcoursProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const insets = useSafeAreaInsets();
  const c = getColors(isDarkMode);

  const [names, setNames] = useState<string[]>(['Joueur 1', 'Joueur 2']);
  const [manches, setManches] = useState<Manche[]>([
    { id: newMancheId(), mode: 'capital', rounds: MODES.capital.defaultRounds },
  ]);
  // true  → "Une partie chacun" : chaque joueur joue toute la manche avec les
  //          mêmes questions (seed partagé), on passe le téléphone une fois par joueur.
  // false → "Tour par tour" : les joueurs alternent question par question, chacun
  //          avec ses propres questions.
  const [sameGame, setSameGame] = useState(true);

  // Which player's name is being edited inline (null = none).
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const [seeds, setSeeds] = useState<number[]>([]);
  // scores[mancheIdx][playerIdx]
  const [scores, setScores] = useState<number[][]>([]);
  const [step, setStep] = useState<Step>({ phase: 'builder' });
  const [pickingRegion, setPickingRegion] = useState(false);
  const handledKey = useRef<string>('');
  // Captured Rankle (classic) sessions, keyed `${mancheIdx}-${playerIdx}`, so a
  // player's "ideal game" can be reviewed from the end screens.
  const [classicResults, setClassicResults] = useState<Record<string, ClassicSessionResult>>({});
  const [review, setReview] = useState<{ mancheIdx: number; playerIdx: number } | null>(null);

  const classicKey = (mancheIdx: number, playerIdx: number) => `${mancheIdx}-${playerIdx}`;
  const canReviewClassic = (mancheIdx: number, playerIdx: number) =>
    manches[mancheIdx]?.mode === 'classic' && !!classicResults[classicKey(mancheIdx, playerIdx)];

  const numPlayers = names.length;

  // Whether a mode advances one round per turn in the current format. Inherent
  // per-question modes always do; round-based modes (globe, regions) only do in
  // turn-by-turn, so their rounds alternate between players instead of one
  // player completing the whole session before the phone is passed.
  const isPerQuestion = (mode: ModeKey) =>
    QUESTION_MODES.includes(mode) || (!sameGame && SPLITTABLE_MODES.includes(mode));
  // How many turns-per-player a manche has (1 for atomic modes).
  const questionCountOf = (m: Manche) => (isPerQuestion(m.mode) ? m.rounds : 1);

  // ── Builder mutators ────────────────────────────────────────────────────────

  const setPlayerCount = (n: number) => {
    setEditingIdx(null);
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

  const addManche = (mode: ModeKey) => {
    // 'regions' needs a country + level chosen first — open the picker.
    if (mode === 'regions') { setPickingRegion(true); return; }
    setManches((prev) => [...prev, { id: newMancheId(), mode, rounds: MODES[mode].defaultRounds }]);
  };

  const addRegionManche = (region: RegionPick[]) => {
    setPickingRegion(false);
    if (region.length === 0) return;
    setManches((prev) => [...prev, { id: newMancheId(), mode: 'regions', rounds: MODES.regions.defaultRounds, region }]);
  };

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
    // Trim names and fall back to "Player N" for any left blank, so standings
    // never show an empty label.
    const cleaned = names.map((n, i) =>
      n.trim() ? n.trim() : `${tr(language, 'Joueur', 'Player')} ${i + 1}`,
    );
    setNames(cleaned);
    track('local_parcours_started', { modes: manches.length, players: cleaned.length, same_game: sameGame });
    setSeeds(manches.map(() => Math.floor(Math.random() * 2_000_000_000)));
    setScores(manches.map(() => cleaned.map(() => 0)));
    setClassicResults({});
    setReview(null);
    handledKey.current = '';
    setStep({ phase: 'pass', mancheIdx: 0, questionIdx: 0, playerIdx: 0 });
  };

  const restartSameParcours = () => {
    setSeeds(manches.map(() => Math.floor(Math.random() * 2_000_000_000)));
    setScores(manches.map(() => names.map(() => 0)));
    setClassicResults({});
    setReview(null);
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

    if (sameGame) {
      // "Une partie chacun" : un joueur enchaîne toutes ses questions (sans écran
      // de passage), puis on passe le téléphone au joueur suivant.
      if (step.questionIdx + 1 < questionCount) {
        // Même joueur, question suivante — pas d'écran de passage.
        handledKey.current = '';
        setStep({ phase: 'play', mancheIdx: step.mancheIdx, questionIdx: step.questionIdx + 1, playerIdx: step.playerIdx });
      } else if (step.playerIdx + 1 < numPlayers) {
        setStep({ phase: 'pass', mancheIdx: step.mancheIdx, questionIdx: 0, playerIdx: step.playerIdx + 1 });
      } else {
        setStep({ phase: 'mancheSummary', mancheIdx: step.mancheIdx });
      }
    } else {
      // "Tour par tour" : joueur par joueur sur une même question, puis question
      // suivante (chacun ayant ses propres questions).
      if (step.playerIdx + 1 < numPlayers) {
        setStep({ phase: 'pass', mancheIdx: step.mancheIdx, questionIdx: step.questionIdx, playerIdx: step.playerIdx + 1 });
      } else if (step.questionIdx + 1 < questionCount) {
        setStep({ phase: 'pass', mancheIdx: step.mancheIdx, questionIdx: step.questionIdx + 1, playerIdx: 0 });
      } else {
        setStep({ phase: 'mancheSummary', mancheIdx: step.mancheIdx });
      }
    }
  };

  const startPlayerTurn = (mancheIdx: number, questionIdx: number, playerIdx: number) => {
    handledKey.current = '';
    announce(
      tr(
        language,
        `Au tour de ${names[playerIdx]}`,
        `${names[playerIdx]}'s turn`,
      ),
    );
    setStep({ phase: 'play', mancheIdx, questionIdx, playerIdx });
  };

  const nextAfterSummary = (mancheIdx: number) => {
    if (mancheIdx + 1 < manches.length) {
      setStep({ phase: 'pass', mancheIdx: mancheIdx + 1, questionIdx: 0, playerIdx: 0 });
    } else {
      const winner = computeStandings()[0];
      if (winner) {
        announce(
          tr(
            language,
            `Partie terminée. ${winner.name} gagne avec ${winner.total} points.`,
            `Game over. ${winner.name} wins with ${winner.total} points.`,
          ),
        );
      }
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
    // "Une partie chacun" : seed indépendant du joueur → mêmes questions pour tous.
    // "Tour par tour" : seed distinct par (joueur, question) → questions différentes.
    const baseSeed = seeds[s.mancheIdx] ?? 1;
    const turnSeed = sameGame
      ? (baseSeed + s.questionIdx * 1009) | 0
      : (baseSeed + s.playerIdx * 100003 + s.questionIdx * 1009) | 0;
    // Per-question modes run a single question per turn; atomic modes run their
    // whole session in one turn.
    const roundsParam = perQuestion ? 1 : manche.rounds;
    const match = makeSyntheticMatch(manche.mode, turnSeed, roundsParam, 1);
    const key = `${manche.id}-${s.questionIdx}-${s.playerIdx}`;
    // A single stray tap on a game screen's Home/back button dropped the whole
    // multi-player run with no warning — confirm first.
    const quit = () => {
      showAlert(
        tr(language, 'Quitter le parcours ?', 'Leave the game?'),
        tr(language, 'La progression de tous les joueurs sera perdue.', 'Every player’s progress will be lost.'),
        [
          { text: tr(language, 'Continuer', 'Keep playing'), style: 'cancel' },
          { text: tr(language, 'Quitter', 'Leave'), style: 'destructive', onPress: onExit },
        ],
      );
    };

    switch (manche.mode) {
      case 'capital':
      case 'flag':
        return (
          <VersusCapitals
            key={key}
            setGameMode={quit as (m: GameMode) => void}
            matchData={match}
            onRoundComplete={handleRoundComplete}
            onExit={quit}
            localBanner={{
              names,
              baseScores: scores[s.mancheIdx] ?? names.map(() => 0),
              currentIdx: s.playerIdx,
              colors: names.map((_, i) => PLAYER_COLORS[i % PLAYER_COLORS.length]),
              // "Une partie chacun" : on cache les scores des autres jusqu'à la fin.
              revealAll: !sameGame,
            }}
          />
        );
      case 'streak':
        return (
          <StreakGame
            key={key}
            setGameMode={quit as (m: GameMode) => void}
            user={null}
            matchData={match}
            onRoundComplete={handleRoundComplete}
          />
        );
      case 'higherlower':
        return (
          <HigherLowerGame
            key={key}
            setGameMode={quit as (m: GameMode) => void}
            user={null}
            matchData={match}
            onRoundComplete={handleRoundComplete}
          />
        );
      case 'silhouette':
        return (
          <SilhouetteGame
            key={key}
            setGameMode={quit as (m: GameMode) => void}
            user={null}
            matchData={match}
            onRoundComplete={handleRoundComplete}
          />
        );
      case 'borders':
        return (
          <BordersGame
            key={key}
            setGameMode={quit as (m: GameMode) => void}
            user={null}
            matchData={match}
            onRoundComplete={handleRoundComplete}
          />
        );
      case 'guess':
        return (
          <GuessCountryGame
            key={key}
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
            setGameMode={quit as (m: GameMode) => void}
            user={null}
            matchData={match}
            onRoundComplete={handleRoundComplete}
          />
        );
      case 'regions':
        if (!manche.region || manche.region.length === 0) return null;
        return (
          <FindRegionGame
            key={key}
            setGameMode={quit as (m: GameMode) => void}
            picks={manche.region}
            user={null}
            matchData={match}
            onRoundComplete={handleRoundComplete}
          />
        );
      case 'classic':
        return (
          <ClassicGame
            key={key}
            user={null}
            matchData={match}
            onRoundComplete={handleRoundComplete}
            onSessionData={(data) =>
              setClassicResults((prev) => ({ ...prev, [classicKey(s.mancheIdx, s.playerIdx)]: data }))
            }
            onExit={quit}
          />
        );
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  if (pickingRegion) {
    return (
      <RegionCountryPicker
        onPick={addRegionManche}
        onBack={() => setPickingRegion(false)}
        title={tr(language, 'Pays de la manche', 'Round country')}
      />
    );
  }

  // Reviewing a player's finished Rankle session (the "ideal game" they could
  // have played) — same end screen as solo, read-only.
  if (review) {
    const data = classicResults[classicKey(review.mancheIdx, review.playerIdx)];
    if (data) {
      return (
        <ClassicGame
          user={null}
          reviewData={data}
          onExit={() => setReview(null)}
        />
      );
    }
  }

  if (step.phase === 'play') {
    return renderActiveMode(step) ?? null;
  }

  // ── BUILDER ─────────────────────────────────────────────────────────────────

  if (step.phase === 'builder') {
    return (
      <ParcoursScreen isDarkMode={isDarkMode} background={c.background}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
          <TouchableOpacity
            onPress={onExit}
            hitSlop={ICON_HIT_SLOP}
            {...a11yButton(tr(language, 'Retour', 'Back'))}
            style={{ padding: 8 }}
          >
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
            <Stepper onPress={() => setPlayerCount(numPlayers - 1)} disabled={numPlayers <= 2} icon={Minus} c={c} label={tr(language, 'Retirer un joueur', 'Remove a player')} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18 }}>
              <Users color={c.text} size={20} {...a11yHidden} />
              <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 20 }} accessibilityLabel={tr(language, `${numPlayers} joueurs`, `${numPlayers} players`)}>{numPlayers}</Text>
            </View>
            <Stepper onPress={() => setPlayerCount(numPlayers + 1)} disabled={numPlayers >= 8} icon={Plus} c={c} label={tr(language, 'Ajouter un joueur', 'Add a player')} />
          </View>

          <View style={{ gap: 8, marginBottom: 24 }}>
            {names.map((name, i) => {
              const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
              const placeholder = `${tr(language, 'Joueur', 'Player')} ${i + 1}`;
              const hasName = name.trim().length > 0;
              const editAccent = isDarkMode ? PALETTE.chartBlue : PALETTE.forestGreen;
              const editTint = isDarkMode ? 'rgba(74,158,255,0.15)' : 'rgba(42,110,63,0.13)';

              // Inline editing: a focused text field + a confirm chip.
              if (editingIdx === i) {
                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 14, padding: 11, borderWidth: 2, borderColor: editAccent }}>
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontFamily: FONTS.monoBold, fontSize: 12 }}>{i + 1}</Text>
                    </View>
                    <TextInput
                      value={name}
                      onChangeText={(v) => renamePlayer(i, v)}
                      placeholder={placeholder}
                      placeholderTextColor={c.textFaint}
                      autoCapitalize="words"
                      autoFocus
                      maxLength={16}
                      returnKeyType="done"
                      onSubmitEditing={() => setEditingIdx(null)}
                      onBlur={() => setEditingIdx(null)}
                      accessibilityLabel={tr(language, `Nom du joueur ${i + 1}`, `Player ${i + 1} name`)}
                      style={{ flex: 1, color: c.text, fontFamily: FONTS.monoBold, fontSize: 15, padding: 0 }}
                    />
                    <TouchableOpacity
                      onPress={() => setEditingIdx(null)}
                      hitSlop={ICON_HIT_SLOP}
                      {...a11yButton(tr(language, 'Valider le nom', 'Confirm name'))}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: editTint, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6 }}
                    >
                      <Check color={editAccent} size={14} {...a11yHidden} />
                      <Text style={{ fontFamily: FONTS.monoBold, color: editAccent, fontSize: 11 }}>OK</Text>
                    </TouchableOpacity>
                  </View>
                );
              }

              // Resting state: a card that reads as "tap to rename".
              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => setEditingIdx(i)}
                  {...a11yButton(
                    tr(language, `Renommer ${hasName ? name : placeholder}`, `Rename ${hasName ? name : placeholder}`),
                    { hint: tr(language, 'Touchez pour modifier le nom', 'Tap to edit the name') },
                  )}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 14, padding: 11 }}
                >
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontFamily: FONTS.monoBold, fontSize: 12 }}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontFamily: FONTS.monoBold, color: hasName ? c.text : c.textFaint, fontSize: 15 }}>
                      {hasName ? name : placeholder}
                    </Text>
                    <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 10, marginTop: 1 }}>
                      {tr(language, 'Touchez pour renommer', 'Tap to rename')}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: editTint, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6 }} {...a11yHidden}>
                    <Pencil color={editAccent} size={13} />
                    <Text style={{ fontFamily: FONTS.monoBold, color: editAccent, fontSize: 11 }}>{tr(language, 'Modifier', 'Edit')}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Format : mêmes questions pour tous, ou alternance tour par tour */}
          <Text style={sectionLabel(c)}>{tr(language, 'DÉROULÉ', 'FORMAT')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
            <FormatOption
              active={sameGame}
              onPress={() => setSameGame(true)}
              icon={Trophy}
              title={tr(language, 'Une partie chacun', 'One game each')}
              subtitle={tr(language, 'Mêmes questions pour tous', 'Same questions for everyone')}
              c={c}
            />
            <FormatOption
              active={!sameGame}
              onPress={() => setSameGame(false)}
              icon={Users}
              title={tr(language, 'Tour par tour', 'Turn by turn')}
              subtitle={tr(language, 'Questions différentes à chacun', 'Different questions each')}
              c={c}
            />
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
                      {m.region?.length
                        ? ` · ${m.region.map((p) => (language === 'fr' ? p.name : (p.name_en ?? p.name))).join(', ')}`
                        : ''}
                    </Text>
                    <TouchableOpacity
                      onPress={() => moveManche(i, -1)}
                      disabled={i === 0}
                      hitSlop={ICON_HIT_SLOP}
                      {...a11yButton(tr(language, 'Monter la manche', 'Move round up'), { disabled: i === 0 })}
                      style={{ padding: 4, opacity: i === 0 ? 0.3 : 1 }}
                    >
                      <ChevronUp color={c.text} size={18} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => moveManche(i, 1)}
                      disabled={i === manches.length - 1}
                      hitSlop={ICON_HIT_SLOP}
                      {...a11yButton(tr(language, 'Descendre la manche', 'Move round down'), { disabled: i === manches.length - 1 })}
                      style={{ padding: 4, opacity: i === manches.length - 1 ? 0.3 : 1 }}
                    >
                      <ChevronDown color={c.text} size={18} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => removeManche(i)}
                      hitSlop={ICON_HIT_SLOP}
                      {...a11yButton(tr(language, 'Supprimer la manche', 'Remove round'))}
                      style={{ padding: 4 }}
                    >
                      <X color={PALETTE.vermilion} size={18} />
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginLeft: 32 }}>
                    {def.rounds === 'config' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Stepper onPress={() => changeRounds(i, -1)} disabled={m.rounds <= 1} icon={Minus} c={c} small label={tr(language, 'Réduire le nombre', 'Decrease count')} />
                        <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 14, minWidth: 60 }}>
                          {m.rounds} {tr(language, def.unitFr, def.unitEn)}
                        </Text>
                        <Stepper onPress={() => changeRounds(i, 1)} disabled={m.rounds >= 20} icon={Plus} c={c} small label={tr(language, 'Augmenter le nombre', 'Increase count')} />
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
                  {...a11yButton(tr(language, def.fr, def.en), {
                    hint: tr(language, 'Ajouter cette manche', 'Add this round'),
                  })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: c.border }}
                >
                  <Icon color={def.accent} size={15} {...a11yHidden} />
                  <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 12 }}>{tr(language, def.fr, def.en)}</Text>
                  <Plus color={c.textFaint} size={13} {...a11yHidden} />
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
            {...a11yButton(tr(language, 'Lancer la partie', 'Start the game'), { disabled: manches.length === 0 })}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: manches.length === 0 ? c.border : PALETTE.forestGreen, borderRadius: 16, paddingVertical: 16 }}
          >
            <Play color="#fff" size={20} {...a11yHidden} />
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
    // "Tour par tour" : on annonce la question en cours. "Une partie chacun" : le
    // joueur enchaîne toute la manche, on annonce juste le nombre de questions.
    const showQuestionLine = perQuestion && !sameGame;
    const showCountHint = perQuestion && sameGame && questionCount > 1;
    const showStandings = step.mancheIdx > 0 || step.questionIdx > 0 || step.playerIdx > 0;
    return (
      <ParcoursScreen isDarkMode={isDarkMode} background={c.background}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 12, letterSpacing: 2, marginBottom: 8 }}>
            {tr(language, 'MANCHE', 'ROUND')} {step.mancheIdx + 1}/{manches.length}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: showQuestionLine || showCountHint ? 12 : 28 }}>
            <Icon color={def.accent} size={26} />
            <Text style={{ fontFamily: FONTS.headingBlack, color: c.text, fontSize: 24 }}>{tr(language, def.fr, def.en)}</Text>
          </View>
          {showQuestionLine && (
            <Text style={{ fontFamily: FONTS.monoBold, color: def.accent, fontSize: 14, letterSpacing: 1, marginBottom: 24 }}>
              {tr(language, 'QUESTION', 'QUESTION')} {step.questionIdx + 1}/{questionCount}
            </Text>
          )}
          {showCountHint && (
            <Text style={{ fontFamily: FONTS.monoBold, color: def.accent, fontSize: 14, letterSpacing: 1, marginBottom: 24 }}>
              {questionCount} {tr(language, def.unitFr, def.unitEn)}
            </Text>
          )}

          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: PLAYER_COLORS[step.playerIdx % PLAYER_COLORS.length], alignItems: 'center', justifyContent: 'center', marginBottom: 16 }} {...a11yHidden}>
            <ScoreText style={{ color: '#fff', fontFamily: FONTS.headingBlack, fontSize: 32 }}>{step.playerIdx + 1}</ScoreText>
          </View>
          <Text style={{ fontFamily: FONTS.mono, color: c.textMuted, fontSize: 14, marginBottom: 4 }}>
            {tr(language, 'Passe le téléphone à', 'Pass the phone to')}
          </Text>
          <Text style={{ fontFamily: FONTS.headingBlack, color: c.text, fontSize: 26, marginBottom: 36, textAlign: 'center' }}>
            {names[step.playerIdx]}
          </Text>

          <TouchableOpacity
            onPress={() => startPlayerTurn(step.mancheIdx, step.questionIdx, step.playerIdx)}
            {...a11yButton(
              tr(language, `Commencer le tour de ${names[step.playerIdx]}`, `Start ${names[step.playerIdx]}'s turn`),
            )}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: def.accent, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 44 }}
          >
            <Play color="#fff" size={20} {...a11yHidden} />
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
              const reviewable = canReviewClassic(step.mancheIdx, r.p);
              return (
                <View key={r.p} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 14, padding: 14, borderWidth: isWinner ? 2 : 0, borderColor: PALETTE.sand }}>
                  <Text style={{ fontFamily: FONTS.monoBold, color: c.textFaint, fontSize: 16, width: 22 }}>{idx + 1}</Text>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: PLAYER_COLORS[r.p % PLAYER_COLORS.length], alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontFamily: FONTS.monoBold, fontSize: 12 }}>{r.p + 1}</Text>
                  </View>
                  {reviewable ? (
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => setReview({ mancheIdx: step.mancheIdx, playerIdx: r.p })}
                      {...a11yButton(tr(language, `Voir la partie idéale de ${r.name}`, `View ${r.name}'s ideal game`))}
                    >
                      <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 15 }}>{r.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Eye color={c.accent} size={11} {...a11yHidden} />
                        <Text style={{ fontFamily: FONTS.mono, color: c.accent, fontSize: 10 }}>
                          {tr(language, 'Voir la partie idéale', 'View ideal game')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <Text style={{ flex: 1, fontFamily: FONTS.monoBold, color: c.text, fontSize: 15 }}>{r.name}</Text>
                  )}
                  {isWinner && <Crown color={PALETTE.sand} size={18} {...a11yImage(tr(language, 'Gagnant de la manche', 'Round winner'))} />}
                  <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 18 }}>{r.score}</Text>
                </View>
              );
            })}
          </View>

          <TouchableOpacity
            onPress={() => nextAfterSummary(step.mancheIdx)}
            {...a11yButton(
              isLast ? tr(language, 'Voir les résultats', 'See results') : tr(language, 'Manche suivante', 'Next round'),
            )}
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
          <Trophy color={PALETTE.sand} size={48} {...a11yHidden} />
          <Text style={{ fontFamily: FONTS.headingBlack, color: c.text, fontSize: 26, marginTop: 10 }}>
            {tr(language, 'Partie terminée', 'Game over')}
          </Text>
          {standings[0] && (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}
              accessibilityLabel={tr(language, `Gagnant : ${standings[0].name}`, `Winner: ${standings[0].name}`)}
            >
              <Trophy color={PALETTE.sand} size={16} {...a11yHidden} />
              <Text style={{ fontFamily: FONTS.monoBold, color: PALETTE.sand, fontSize: 16 }}>
                {standings[0].name}
              </Text>
            </View>
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
              {idx === 0 && <Crown color={PALETTE.sand} size={22} {...a11yHidden} />}
            </View>
          ))}
        </View>

        {/* Per-manche breakdown */}
        <Text style={sectionLabel(c)}>{tr(language, 'DÉTAIL PAR MANCHE', 'PER-ROUND BREAKDOWN')}</Text>
        {manches.some((m, mi) => names.some((_, p) => canReviewClassic(mi, p))) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10, marginTop: -4 }}>
            <Eye color={c.textFaint} size={12} {...a11yHidden} />
            <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 11 }}>
              {tr(language, 'Touchez un nom Rankle pour voir la partie idéale', 'Tap a Rankle name to view the ideal game')}
            </Text>
          </View>
        )}
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
                  {names.map((name, p) => {
                    const isMax = row[p] === max && max > 0;
                    const reviewable = canReviewClassic(mi, p);
                    const label = (
                      <Text style={{ fontFamily: FONTS.mono, fontSize: 12, color: isMax ? PALETTE.sand : reviewable ? c.accent : c.textMuted, textDecorationLine: reviewable ? 'underline' : 'none' }}>
                        {name}: {row[p] ?? 0}
                      </Text>
                    );
                    return reviewable ? (
                      <TouchableOpacity
                        key={p}
                        onPress={() => setReview({ mancheIdx: mi, playerIdx: p })}
                        {...a11yButton(tr(language, `Voir la partie idéale de ${name}`, `View ${name}'s ideal game`))}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                      >
                        <Eye color={c.accent} size={11} {...a11yHidden} />
                        {label}
                      </TouchableOpacity>
                    ) : (
                      <View key={p}>{label}</View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ gap: 10 }}>
          <TouchableOpacity
            onPress={restartSameParcours}
            {...a11yButton(tr(language, 'Rejouer le même parcours', 'Replay same game'))}
            style={{ backgroundColor: PALETTE.forestGreen, borderRadius: 16, paddingVertical: 15, alignItems: 'center' }}
          >
            <Text style={{ fontFamily: FONTS.monoBold, color: '#fff', fontSize: 15 }}>{tr(language, 'REJOUER LE MÊME PARCOURS', 'REPLAY SAME GAME')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setStep({ phase: 'builder' })}
            {...a11yButton(tr(language, 'Modifier le parcours', 'Edit the game'))}
            style={{ backgroundColor: c.card, borderRadius: 16, paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: c.border }}
          >
            <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 15 }}>{tr(language, 'MODIFIER LE PARCOURS', 'EDIT THE GAME')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onExit}
            {...a11yButton(tr(language, 'Retour au menu', 'Back to menu'))}
            style={{ paddingVertical: 14, alignItems: 'center' }}
          >
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

function FormatOption({
  active,
  onPress,
  icon: Icon,
  title,
  subtitle,
  c,
}: {
  active: boolean;
  onPress: () => void;
  icon: any;
  title: string;
  subtitle: string;
  c: ReturnType<typeof getColors>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      {...a11yButton(title, { hint: subtitle, selected: active })}
      style={{
        flex: 1,
        backgroundColor: active ? `${PALETTE.forestGreen}22` : c.card,
        borderRadius: 14,
        padding: 12,
        borderWidth: 2,
        borderColor: active ? PALETTE.forestGreen : c.border,
      }}
    >
      <Icon color={active ? PALETTE.forestGreen : c.textMuted} size={20} {...a11yHidden} />
      <Text style={{ fontFamily: FONTS.monoBold, color: c.text, fontSize: 13, marginTop: 8 }}>{title}</Text>
      <Text style={{ fontFamily: FONTS.mono, color: c.textFaint, fontSize: 11, marginTop: 2 }}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

function Stepper({ onPress, disabled, icon: Icon, c, small, label }: { onPress: () => void; disabled?: boolean; icon: any; c: ReturnType<typeof getColors>; small?: boolean; label?: string }) {
  const size = small ? 30 : 38;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      hitSlop={ICON_HIT_SLOP}
      {...(label ? a11yButton(label, { disabled }) : {})}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}
    >
      <Icon color={c.text} size={small ? 15 : 18} {...a11yHidden} />
    </TouchableOpacity>
  );
}
