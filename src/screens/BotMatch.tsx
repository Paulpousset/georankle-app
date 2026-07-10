/**
 * BotMatch — a ranked series against the matchmaking stand-in opponent, launched
 * by RankedMatchmaking when no human is found in time. The player is NEVER told
 * the opponent is simulated: it is revealed and played exactly like a real ranked
 * match (opponent reveal → rounds → RoundSummary → MatchResult with ELO).
 *
 * The series is played out on-device — the real game screens run in solo mode
 * (synthetic per-round match + user=null, like LocalParcours) while the opponent's
 * score for each round is simulated in native units (src/lib/bot.ts) and then
 * normalized to the same 0–1000 scale as the player before the round is decided.
 * The match
 * is a real `matches` row (created by RankedMatchmaking, flagged is_bot in
 * game_data); on completion apply_bot_ranked_result finalises it server-side and
 * applies the ELO change like any ranked game.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import type { User } from '@supabase/supabase-js';

import type { AvatarConfig, GameMode, Match, MatchMode } from '../types';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { track } from '../lib/analytics';
import { createSeededRng } from '../lib/rng';
import { a11yHidden, announce } from '../lib/a11y';
import { generateRankedModes, pickRankedRegion, type RankedRegionPick } from '../lib/ranked';
import { simulateBotRound, type BotProfile } from '../lib/bot';
import { normalizeRoundScore } from '../lib/score';
import { Avatar } from '../components/Avatar';
import { RoundSummary, type RoundSummaryData } from '../components/RoundSummary';
import { MatchResult } from '../components/MatchResult';

import VersusCapitals from './VersusCapitals';
import StreakGame from './StreakGame';
import GuessCountryGame from './GuessCountryGame';
import FindCountryGame from './FindCountryGame';
import FindRegionGame from './FindRegionGame';
import HigherLowerGame from './HigherLowerGame';
import SilhouetteGame from './SilhouetteGame';
import BordersGame from './BordersGame';
import { ClassicGame } from './ClassicGame';

interface BotMatchProps {
  user: User | null;
  /** The real ranked `matches` row this series owns (carries seed + modes). */
  match: Match;
  /** The disguised opponent — random username, equipped World, hidden rating. */
  bot: BotProfile;
  onExit: () => void;
}

const VERSUS_QUESTIONS = 5;
const GLOBE_ROUNDS = 5;
const REGION_ROUNDS = 5;
const SILHOUETTE_QUESTIONS = 5; // SilhouetteGame's online default session length

interface PlayerProfile {
  username: string | null;
  avatar_url: string | null;
  avatar_config: AvatarConfig | null;
}

/** Build an in-memory Match so a ranked mode runs as a local solo round. */
function makeSyntheticMatch(
  mode: MatchMode,
  seed: number,
  roundsPerSet: number,
  questionType: 'CAPITAL' | 'FLAG',
): Match {
  return {
    id: 'bot-match',
    player1_id: 'local-p1',
    player2_id: null,
    game_mode: mode,
    status: 'in_progress',
    is_public: false,
    is_ranked: false,
    best_of: 1,
    p1_rounds_won: 0,
    p2_rounds_won: 0,
    p1_current_score: 0,
    p2_current_score: 0,
    current_round: 1,
    p1_finished_round: false,
    p2_finished_round: false,
    game_data: { seed, questionType, roundsPerSet },
  } as Match;
}

type Phase = 'reveal' | 'playing' | 'roundResult' | 'over';

/**
 * The "opponent found" screen — two World avatars facing off with a short
 * countdown. Visually identical to the real PreGameLobby, but the opponent is
 * the locally-generated profile (no DB row to fetch).
 */
function OpponentReveal({
  player,
  bot,
  onReady,
}: {
  player: PlayerProfile | null;
  bot: BotProfile;
  onReady: () => void;
}) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const col = getColors(isDarkMode);
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    announce(language === 'fr' ? 'Adversaire trouvé' : 'Opponent found');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (countdown <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      announce(language === 'fr' ? "C'est parti !" : "Let's go!");
      onReady();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const t = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, onReady, language]);

  const renderSide = (
    name: string,
    config: AvatarConfig | null,
    photoUrl: string | null,
    isCurrentUser: boolean,
  ) => (
    <View style={{ alignItems: 'center', gap: 12 }}>
      <Avatar
        config={config}
        photoUrl={photoUrl}
        username={name}
        size={80}
        ringColor={isCurrentUser ? '#2a6e3f' : col.border}
        ringWidth={isCurrentUser ? 3 : 1}
      />
      <Text style={{ color: col.text, fontFamily: FONTS.heading, fontSize: 16, textAlign: 'center' }}>
        {name}
      </Text>
      {isCurrentUser && (
        <Text style={{ color: '#2a6e3f', fontSize: 12, fontFamily: FONTS.monoBold }}>
          {language === 'fr' ? 'Vous' : 'You'}
        </Text>
      )}
    </View>
  );

  const myName = player?.username ?? (language === 'fr' ? 'Joueur' : 'Player');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: col.background, alignItems: 'center', justifyContent: 'center' }}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      <Text style={{ color: col.textFaint, fontSize: 14, fontFamily: FONTS.monoBold, letterSpacing: 2, marginBottom: 40 }}>
        {(language === 'fr' ? 'Adversaire trouvé' : 'Opponent found').toUpperCase()}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 32 }}>
        {renderSide(myName, player?.avatar_config ?? null, player?.avatar_url ?? null, true)}

        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ color: col.textMuted, fontSize: 13, fontFamily: FONTS.mono }}>
            {language === 'fr' ? 'contre' : 'vs'}
          </Text>
          <View
            style={{
              width: 56, height: 56, borderRadius: 28,
              backgroundColor: countdown > 0 ? '#1a4a7a' : '#2a6e3f',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text {...a11yHidden} style={{ color: '#fff', fontSize: 26, fontFamily: FONTS.headingBlack }}>
              {countdown > 0 ? countdown : '▶'}
            </Text>
          </View>
        </View>

        {renderSide(bot.name, bot.avatarConfig, null, false)}
      </View>

      <Text style={{ color: col.textMuted, fontFamily: FONTS.mono, fontSize: 14, marginTop: 48 }}>
        {countdown > 0
          ? language === 'fr'
            ? `La partie commence dans ${countdown}…`
            : `Game starts in ${countdown}…`
          : language === 'fr'
            ? "C'est parti !"
            : "Let's go!"}
      </Text>
    </SafeAreaView>
  );
}

export default function BotMatch({ user, match, bot, onExit }: BotMatchProps) {
  const gd = (match.game_data ?? {}) as {
    seed?: number;
    ranked_modes?: MatchMode[];
    regionRounds?: Record<number, RankedRegionPick>;
  };
  const bestOf = match.best_of ?? 1;
  const needed = Math.ceil(bestOf / 2);

  // Seed + mode sequence are fixed by the match row (mirrors real ranked). The
  // Math.random fallback only fires for a malformed row; lazy-init keeps it pure.
  const [seed] = useState(() => gd.seed ?? Math.floor(Math.random() * 2147483647));
  const modes = useMemo<MatchMode[]>(
    () => (gd.ranked_modes && gd.ranked_modes.length ? gd.ranked_modes : generateRankedModes(bestOf, seed)),
    [bestOf, seed], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [phase, setPhase] = useState<Phase>('reveal');
  const [roundIndex, setRoundIndex] = useState(0);
  const [playerWins, setPlayerWins] = useState(0);
  const [botWins, setBotWins] = useState(0);
  const [rounds, setRounds] = useState<RoundSummaryData[]>([]);
  const [lastSummary, setLastSummary] = useState<RoundSummaryData | null>(null);
  const [rankResult, setRankResult] = useState<{ eloChange: number; newElo: number; oldElo: number } | null>(null);
  const [coinsAwarded, setCoinsAwarded] = useState<number | null>(null);
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);
  const resultApplied = useRef(false);

  // The caller's own identity, for the opponent-reveal screen.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('username, avatar_url, avatar_config')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (!cancelled) setPlayerProfile((data as unknown as PlayerProfile) ?? null);
      }, () => {});
    return () => { cancelled = true; };
  }, [user?.id]);

  const mode = modes[roundIndex] ?? modes[0];
  const roundSeed = (seed + roundIndex * 997) | 0;
  const questionType: 'CAPITAL' | 'FLAG' =
    createSeededRng(roundSeed + 7)() < 0.5 ? 'CAPITAL' : 'FLAG';
  const roundsPerSet =
    mode === 'versus' ? VERSUS_QUESTIONS
      : mode === 'globe' ? GLOBE_ROUNDS
        : mode === 'regions' ? REGION_ROUNDS
          : mode === 'silhouette' ? SILHOUETTE_QUESTIONS
            : 1;
  // Regions rounds carry their own seeded country/level (stored on the match at
  // creation; fall back to a deterministic pick for any malformed row).
  const regionPick: RankedRegionPick =
    gd.regionRounds?.[roundIndex + 1] ?? pickRankedRegion(seed, roundIndex + 1);

  const roundMatch = useMemo(
    () => makeSyntheticMatch(mode, roundSeed, roundsPerSet, questionType),
    [mode, roundSeed, roundsPerSet, questionType],
  );

  // Finalise the series server-side: applies the ELO change vs the bot's rating
  // and awards ranked coins. Idempotent (rating_applied guard) — call once.
  const applyResult = async (pWins: number, bWins: number) => {
    if (resultApplied.current) return;
    resultApplied.current = true;
    track('bot_match_completed', { won: pWins > bWins, best_of: bestOf });
    // The RPC is idempotent (rating_applied guard), so a transient network
    // failure can be retried — swallowing it lost the ELO + coins for good.
    let data: unknown = null;
    let error: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 2000));
      ({ data, error } = await supabase.rpc('apply_bot_ranked_result', {
        p_match_id: match.id,
        p_player_rounds_won: pWins,
        p_bot_rounds_won: bWins,
      }));
      if (!error && data) break;
    }
    if (error || !data) return;
    const r = data as {
      elo_change?: number; new_elo?: number; old_elo?: number; coins_awarded?: number;
    };
    setRankResult({
      eloChange: r.elo_change ?? 0,
      newElo: r.new_elo ?? 0,
      oldElo: r.old_elo ?? r.new_elo ?? 0,
    });
    if (typeof r.coins_awarded === 'number') setCoinsAwarded(r.coins_awarded);
  };

  const handlePlayerDone = (playerScore: number) => {
    if (phase !== 'playing') return;
    // `playerScore` arrives already normalized to the 0–1000 scale (every game
    // screen runs its raw score through normalizeRoundScore at onRoundComplete).
    // The bot simulates in each mode's *native* units (globe = correct×1000,
    // versus = points 0..25, classic = 0..100, …), so it must be put on the SAME
    // scale before the comparison — otherwise e.g. a globe round pits the player's
    // 0..1000 against the bot's 0..5000 and the player loses despite scoring more.
    // Use the same context the player's screen used (roundsPerSet, CASH = 5 pts).
    const rawBotScore = simulateBotRound(mode, { roundsPerSet }, bot.rating, createSeededRng(roundSeed + 31)).score;
    const botScore = normalizeRoundScore(mode, rawBotScore, {
      numQuestions: roundsPerSet,
      maxPointsPerQuestion: 5,
    });
    const playerWon = playerScore >= botScore;
    const nextPlayerWins = playerWins + (playerWon ? 1 : 0);
    const nextBotWins = botWins + (playerWon ? 0 : 1);
    const over = nextPlayerWins >= needed || nextBotWins >= needed;

    const summary: RoundSummaryData = {
      roundNumber: roundIndex + 1,
      myScore: playerScore,
      opponentScore: botScore,
      myRoundsWon: nextPlayerWins,
      opponentRoundsWon: nextBotWins,
      bestOf,
      isMatchOver: over,
      matchWinner: over ? (nextPlayerWins >= needed ? 'me' : 'opponent') : null,
      gameMode: mode,
    };

    setPlayerWins(nextPlayerWins);
    setBotWins(nextBotWins);
    setRounds((rs) => [...rs, summary]);
    setLastSummary(summary);

    if (over) {
      setPhase('over');
      applyResult(nextPlayerWins, nextBotWins);
    } else {
      setPhase('roundResult');
    }
  };

  const nextRound = () => {
    setRoundIndex((i) => i + 1);
    setLastSummary(null);
    setPhase('playing');
  };

  // ── Opponent reveal ────────────────────────────────────────────────────────
  if (phase === 'reveal') {
    return <OpponentReveal player={playerProfile} bot={bot} onReady={() => setPhase('playing')} />;
  }

  // ── Active round: mount the real game screen in solo mode ──────────────────
  if (phase === 'playing') {
    const quit = onExit as (m: GameMode) => void;
    const common = { key: `r${roundIndex}`, matchData: roundMatch, onRoundComplete: handlePlayerDone };
    switch (mode) {
      case 'versus':
        return (
          <VersusCapitals setGameMode={quit} matchData={roundMatch} onRoundComplete={handlePlayerDone} onExit={onExit} key={common.key} />
        );
      case 'streak':
        return <StreakGame setGameMode={quit} user={null} {...common} />;
      case 'guess':
        return <GuessCountryGame onBackToMenu={onExit} user={null} {...common} />;
      case 'globe':
        return <FindCountryGame setGameMode={quit} user={null} {...common} />;
      case 'regions':
        return (
          <FindRegionGame
            setGameMode={quit}
            picks={[{
              cca3: regionPick.cca3,
              name: regionPick.name,
              name_en: regionPick.name_en,
              unit: regionPick.unit ?? null,
              level: regionPick.level,
            }]}
            user={null}
            {...common}
          />
        );
      case 'silhouette':
        return <SilhouetteGame setGameMode={quit} user={null} {...common} />;
      case 'borders':
        return <BordersGame setGameMode={quit} user={null} {...common} />;
      case 'higherlower':
        return <HigherLowerGame setGameMode={quit} user={null} {...common} />;
      case 'classic':
      default:
        return <ClassicGame user={null} onExit={onExit} {...common} />;
    }
  }

  // ── Between-rounds summary (shared component, identical to ranked) ──────────
  if (phase === 'roundResult' && lastSummary) {
    return <RoundSummary data={lastSummary} gameMode={mode} onContinue={nextRound} />;
  }

  // ── Match over: shared result screen with the ELO change ───────────────────
  return (
    <MatchResult
      rounds={rounds}
      myRoundsWon={playerWins}
      opponentRoundsWon={botWins}
      bestOf={bestOf}
      gameMode={modes[0]}
      isRanked
      rankResult={rankResult}
      coinsAwarded={coinsAwarded}
      onExit={onExit}
    />
  );
}
