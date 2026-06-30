import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { supabase } from '../lib/supabase';
import { tr } from '../i18n';
import { track } from '../lib/analytics';
import { log } from '../lib/log';
import { setActiveMatch, clearActiveMatch } from '../lib/activeMatch';
import type { GameMode, Match, MatchMode } from '../types';
import type { RoundSummaryData } from '../components/RoundSummary';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../components/ToastProvider';

/** Phases of a live multiplayer match, in order of play. */
export type MatchPhase = 'playing' | 'waiting_opponent' | 'round_summary' | 'match_over';

/** Short, human-friendly [fr, en] label per online mode, for the invite toast. */
const MODE_LABELS: Record<MatchMode, [string, string]> = {
  classic: ['Rankle', 'Rankle'],
  streak: ['Mode Streak', 'Streak Mode'],
  versus: ['Mode Versus', 'Versus Mode'],
  globe: ['Globe Géo', 'Geo Globe'],
  guess: ['Devine le Pays', 'Guess Country'],
  regions: ['Défis Pays', 'Country Challenges'],
  challenge: ['Quiz Pays', 'Country Quiz'],
};

/** Shape of the `apply_ranked_result` RPC payload (returned as JSONB). */
interface RankedResultPayload {
  already_applied?: boolean;
  elo_change?: number;
  new_elo?: number;
  old_elo?: number;
  coins_awarded?: number;
}

/** Shape of the `apply_online_result` RPC payload (returned as JSONB). */
interface OnlineResultPayload {
  coins_awarded?: number;
}

/** Shape of the `finalize_round` RPC payload (returned as JSONB). */
interface FinalizeRoundPayload {
  finalized?: boolean;
  p1_rounds_won?: number;
  p2_rounds_won?: number;
  p1_total_score?: number;
  p2_total_score?: number;
  current_round?: number;
  status?: string;
  match_over?: boolean;
}

interface MatchEngineDeps {
  /** Launch / switch / reset the active game mode (shared with solo play). */
  setGameMode: (mode: GameMode) => void;
  /** Drop the page-navigation history (called when entering/leaving a match). */
  clearPages: () => void;
}

/**
 * Owns everything about a live multiplayer match: the round state machine,
 * server-authoritative ELO/coin RPCs, and the incoming-invite subscription.
 * Navigation is the only external coupling — `setGameMode`/`clearPages` are
 * injected so the engine stays unaware of how screens are routed.
 */
export function useMatchEngine({ setGameMode, clearPages }: MatchEngineDeps) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const toast = useToast();

  // The invite subscription is set up once per session; read the latest language
  // from a ref so the toast text stays localized without re-subscribing.
  const langRef = useRef(language);
  useEffect(() => {
    langRef.current = language;
  }, [language]);

  const [matchData, setMatchData] = useState<Match | null>(null);
  const [incomingInvite, setIncomingInvite] = useState<Match | null>(null);
  const [showPreGameLobby, setShowPreGameLobby] = useState(false);

  // The invite channel is created once per signed-in user; the cancel handler
  // reads the current invite from a ref so the effect doesn't re-subscribe (and
  // tear down / recreate the channel) every time an invite arrives.
  const incomingInviteRef = useRef(incomingInvite);
  useEffect(() => {
    incomingInviteRef.current = incomingInvite;
  }, [incomingInvite]);

  // Ranked mode sequence for the current match (populated on match start).
  const rankedModesRef = useRef<MatchMode[] | null>(null);

  const [matchPhase, setMatchPhase] = useState<MatchPhase>('playing');
  const [myCurrentRoundScore, setMyCurrentRoundScore] = useState(0);
  const [roundSummaryData, setRoundSummaryData] = useState<RoundSummaryData | null>(null);
  const [allRounds, setAllRounds] = useState<RoundSummaryData[]>([]);
  const [rankResult, setRankResult] = useState<{ eloChange: number; newElo: number; oldElo: number } | null>(null);
  const [coinsAwarded, setCoinsAwarded] = useState<number | null>(null);

  // Listen for incoming matchmaking invites.
  useEffect(() => {
    if (!user) return;

    const fetchInvites = async () => {
      const { data } = await supabase
        .from('matches')
        .select('*')
        .eq('player2_id', user.id)
        .eq('status', 'waiting')
        .eq('is_public', false);
      if (data && data.length > 0) setIncomingInvite(data[0] as Match);
    };
    fetchInvites();

    const channel = supabase
      .channel(`invites_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches', filter: `player2_id=eq.${user.id}` },
        async (payload) => {
          const match = payload.new as Match;
          if (match.status !== 'waiting' || match.is_public !== false) return;
          setIncomingInvite(match);
          // A heads-up toast so the invite is noticed from any screen — the
          // accept/decline modal only mounts on the menu.
          const { data } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', match.player1_id)
            .single();
          const name = data?.username ?? tr(langRef.current, 'Un joueur', 'A player');
          const [fr, en] = match.game_data?.is_custom
            ? (['partie perso', 'a custom game'] as const)
            : MODE_LABELS[match.game_mode] ?? [match.game_mode, match.game_mode];
          toast.info(
            tr(langRef.current, `${name} vous défie en ${fr} !`, `${name} challenges you in ${en}!`),
          );
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `player2_id=eq.${user.id}` },
        (payload) => {
          const match = payload.new as Match;
          const current = incomingInviteRef.current;
          if (match.status === 'cancelled' && current && current.id === match.id) {
            setIncomingInvite(null);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // `toast` and `langRef` are stable; the invite ref keeps the cancel handler
    // current without re-subscribing. Keyed on the user id only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Heartbeat: while a 1v1 match is live, bump `last_activity_at` so the
  // reconnect/forfeit window (match_reconnect.sql) sees us as present even
  // during a long round before any score is written. Mirrors the FFA screen,
  // which already pings `touch_match`. Stops once the series is over.
  useEffect(() => {
    if (!matchData?.id || matchPhase === 'match_over') return;
    const id = matchData.id;
    const ping = () => {
      supabase.rpc('touch_match', { p_match_id: id }).then(undefined, () => {});
    };
    ping();
    const handle = setInterval(ping, 30_000);
    return () => clearInterval(handle);
  }, [matchData?.id, matchPhase]);

  // ─── Ranked ELO update ──────────────────────────────────────────────────────

  // ELO is computed server-side (SECURITY DEFINER RPC) so it cannot be spoofed
  // by the client. Both clients may call this; the function is idempotent and
  // row-locked, so only the first call mutates ratings.
  const updateRankedRating = async (match: Match) => {
    const { data, error } = await supabase.rpc('apply_ranked_result', {
      p_match_id: match.id,
    });

    if (error) {
      log.error('apply_ranked_result error:', error);
      Alert.alert(
        tr(language, 'Erreur', 'Error'),
        tr(language, 'Impossible de mettre à jour ton classement.', 'Could not update your ranking.'),
      );
      return;
    }

    const result = (data ?? {}) as RankedResultPayload;
    // When the result was already applied (opponent's client got there first),
    // re-read the caller's standing so the UI still shows the new ELO.
    if (result.already_applied) {
      setRankResult({ eloChange: 0, newElo: result.new_elo ?? 0, oldElo: result.new_elo ?? 0 });
      return;
    }

    setRankResult({
      eloChange: result.elo_change ?? 0,
      newElo: result.new_elo ?? 0,
      oldElo: result.old_elo ?? 0,
    });
    if (typeof result.coins_awarded === 'number') setCoinsAwarded(result.coins_awarded);
  };

  // Coins for non-ranked online matches. Server-authoritative + idempotent
  // (matches.coins_awarded guard); both clients may call it.
  const awardOnlineCoins = async (match: Match) => {
    const { data, error } = await supabase.rpc('apply_online_result', { p_match_id: match.id });
    if (error) {
      log.error('apply_online_result error:', error);
      Alert.alert(
        tr(language, 'Erreur', 'Error'),
        tr(language, 'Impossible de créditer tes pièces.', 'Could not credit your coins.'),
      );
      return;
    }
    const result = (data ?? {}) as OnlineResultPayload;
    if (typeof result.coins_awarded === 'number' && result.coins_awarded > 0) {
      setCoinsAwarded(result.coins_awarded);
    }
  };

  // ─── Match start helper ──────────────────────────────────────────────────────

  const startMatch = (match: Match) => {
    track('match_started', {
      mode: match.game_mode,
      is_ranked: match.is_ranked ?? false,
      source: match.is_ranked ? 'ranked' : match.is_public ? 'matchmaking' : 'invite',
    });
    // Entering a live match: drop the page history so leaving the match lands
    // on the menu rather than back inside matchmaking.
    clearPages();
    setMatchData(match);
    // Remember the active match so it can be resumed after a disconnect / menu exit.
    setActiveMatch(match.id, Date.now());
    // Both ranked and custom matches play a *sequence* of modes, one per round.
    // Ranked stores it under `ranked_modes`; user-built custom matches under
    // `modes`. The round state machine is identical for both.
    const modeSequence = match.game_data?.ranked_modes ?? match.game_data?.modes;
    if (modeSequence?.length) {
      rankedModesRef.current = modeSequence;
      // Start at the match's current round so resuming a mid-match lands on the
      // right mode (fresh matches are at round 1 → index 0).
      const roundIdx = Math.max(0, (match.current_round ?? 1) - 1);
      setGameMode(modeSequence[roundIdx] ?? modeSequence[0]);
    } else {
      rankedModesRef.current = null;
      setGameMode(match.game_mode);
    }
    setShowPreGameLobby(true);
  };

  const acceptInvite = async () => {
    if (!incomingInvite) return;
    track('match_invite_accepted', { mode: incomingInvite.game_mode });
    const matchCopy = { ...incomingInvite };

    const { data: updatedMatch, error } = await supabase
      .from('matches')
      .update({ status: 'in_progress' })
      .eq('id', matchCopy.id)
      .select()
      .single();

    setIncomingInvite(null);

    if (!error && updatedMatch) {
      startMatch(updatedMatch as Match);
    } else {
      Alert.alert(
        tr(language, 'Erreur', 'Error'),
        tr(language, 'Impossible de rejoindre la partie', 'Could not join match'),
      );
    }
  };

  const declineInvite = async () => {
    if (!incomingInvite) return;
    track('match_invite_declined', { mode: incomingInvite.game_mode });
    await supabase.from('matches').update({ status: 'cancelled' }).eq('id', incomingInvite.id);
    setIncomingInvite(null);
  };

  const handleRoundComplete = async (myScore: number) => {
    if (!matchData || !user) return;
    const isPlayer1 = matchData.player1_id === user.id;

    setMyCurrentRoundScore(myScore);
    setMatchPhase('waiting_opponent');

    const processRound = async (state: any) => {
      const p1Score = (state.p1_current_score as number) ?? 0;
      const p2Score = (state.p2_current_score as number) ?? 0;
      const myRoundScore = isPlayer1 ? p1Score : p2Score;
      const oppRoundScore = isPlayer1 ? p2Score : p1Score;
      const bo = (state.best_of as number) ?? 1;
      const needed = Math.ceil(bo / 2);
      const roundNum = (state.current_round as number) ?? 1;

      // Persist the round result server-side. rounds_won / totals / status are no
      // longer client-writable (anti-cheat column lockdown), so a SECURITY DEFINER
      // RPC derives them from the per-round scores, accumulates the cumulative
      // points total, and advances / completes the series. Both clients call it;
      // it is row-locked and idempotent (the first caller does the work and resets
      // the finished flags, any later caller no-ops and just reports the advanced
      // state). It must commit before the award RPCs run, and its return value is
      // authoritative — we prefer it over a local recomputation.
      const { data: finalizeData, error: finalizeError } = await supabase.rpc('finalize_round', {
        p_match_id: matchData.id,
      });
      if (finalizeError) log.error('finalize_round error:', finalizeError);
      const finalized = (finalizeData ?? {}) as FinalizeRoundPayload;

      const p1Wins = p1Score > p2Score;
      const draw = p1Score === p2Score;
      const newP1 = finalized.p1_rounds_won ??
        (((state.p1_rounds_won as number) ?? 0) + (p1Wins ? 1 : 0));
      const newP2 = finalized.p2_rounds_won ??
        (((state.p2_rounds_won as number) ?? 0) + (!p1Wins && !draw ? 1 : 0));
      // Cumulative totals are only authoritative once the tiebreaker migration is
      // applied (the RPC returns them). Until then, fall back to rounds-only logic
      // so we never show a misleading points total or break a tie incorrectly.
      const hasTotals =
        finalized.p1_total_score !== undefined && finalized.p2_total_score !== undefined;
      const p1Total = finalized.p1_total_score ?? (((state.p1_total_score as number) ?? 0) + p1Score);
      const p2Total = finalized.p2_total_score ?? (((state.p2_total_score as number) ?? 0) + p2Score);
      const matchOver = finalized.match_over ??
        (newP1 >= needed || newP2 >= needed || roundNum >= bo);
      const myWon = isPlayer1 ? newP1 : newP2;
      const oppWon = isPlayer1 ? newP2 : newP1;
      const myTotal = isPlayer1 ? p1Total : p2Total;
      const oppTotal = isPlayer1 ? p2Total : p1Total;

      // Winner = more rounds won; on a rounds tie, more cumulative points; equal
      // on both → true draw. Mirrors apply_ranked_result / apply_online_result.
      const p1IsWinner = newP1 > newP2 || (hasTotals && newP1 === newP2 && p1Total > p2Total);
      const isMatchDraw = newP1 === newP2 && (!hasTotals || p1Total === p2Total);
      const iWon = isPlayer1 ? p1IsWinner : !p1IsWinner;

      setMatchData(prev => prev ? {
        ...prev, p1_rounds_won: newP1, p2_rounds_won: newP2, current_round: roundNum + 1,
        ...(hasTotals ? { p1_total_score: p1Total, p2_total_score: p2Total } : {}),
      } : null);

      // Keep the resume pointer fresh on real progress, and clear it once the
      // series is over so a finished match isn't offered for resume.
      if (matchOver) clearActiveMatch();
      else setActiveMatch(matchData.id, Date.now());

      // Award progression when the series ends. Ranked applies ELO + coins;
      // non-ranked online matches award coins only. Both are server-side.
      if (matchOver && user) {
        if (state.is_ranked) {
          await updateRankedRating(matchData);
        } else if (matchData.player2_id) {
          await awardOnlineCoins(matchData);
        }
      }

      // The mode this round was actually played in. In ranked, each round draws
      // a different mode from the sequence (roundNum is 1-indexed); otherwise
      // the whole match is a single mode.
      const roundMode = rankedModesRef.current?.[roundNum - 1] ?? matchData.game_mode;

      const summary: RoundSummaryData = {
        roundNumber: roundNum, myScore: myRoundScore, opponentScore: oppRoundScore,
        myRoundsWon: myWon, opponentRoundsWon: oppWon, bestOf: bo,
        myTotalScore: hasTotals ? myTotal : undefined,
        opponentTotalScore: hasTotals ? oppTotal : undefined,
        isMatchOver: matchOver,
        matchWinner: matchOver ? (isMatchDraw ? 'draw' : iWon ? 'me' : 'opponent') : null,
        gameMode: roundMode,
      };
      setRoundSummaryData(summary);
      setAllRounds(prev => [...prev, summary]);
      setMatchPhase(matchOver ? 'match_over' : 'round_summary');

      track('round_completed', {
        mode: matchData.game_mode,
        round: roundNum,
        my_score: myRoundScore,
        opp_score: oppRoundScore,
      });
      if (matchOver) {
        track('match_completed', {
          mode: matchData.game_mode,
          is_ranked: state.is_ranked ?? false,
          result: isMatchDraw ? 'draw' : iWon ? 'won' : 'lost',
        });
      }
    };

    let handled = false;
    const channel = supabase
      .channel(`round_${matchData.id}_r${matchData.current_round}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchData.id}` },
        async (payload: any) => {
          const u = payload.new;
          if (!u.p1_finished_round || !u.p2_finished_round) return;
          if (handled) return;
          handled = true;
          supabase.removeChannel(channel);
          await processRound(u);
        })
      .subscribe();

    const { data: afterSave } = await supabase
      .from('matches')
      .update(
        isPlayer1
          ? { p1_current_score: myScore, p1_finished_round: true }
          : { p2_current_score: myScore, p2_finished_round: true },
      )
      .eq('id', matchData.id)
      .select()
      .single();

    if (afterSave && afterSave.p1_finished_round && afterSave.p2_finished_round && !handled) {
      handled = true;
      supabase.removeChannel(channel);
      await processRound(afterSave);
    }
  };

  const resetMatchState = () => {
    clearActiveMatch();
    setMatchData(null);
    setMatchPhase('playing');
    setRoundSummaryData(null);
    setAllRounds([]);
    setMyCurrentRoundScore(0);
    setShowPreGameLobby(false);
    setRankResult(null);
    setCoinsAwarded(null);
    rankedModesRef.current = null;
    setGameMode('menu');
    clearPages();
  };

  // Advance from the round-summary screen into the next round. In ranked, each
  // round switches to the next mode in the sequence.
  const continueToNextRound = () => {
    const modes = rankedModesRef.current;
    if (modes && matchData) {
      // current_round was already incremented; subtract 1 for 0-index.
      const nextMode = modes[matchData.current_round - 1] ?? modes[0];
      setGameMode(nextMode);
    }
    setMatchPhase('playing');
    setShowPreGameLobby(true);
  };

  const dismissPreGameLobby = () => setShowPreGameLobby(false);

  return {
    // state
    matchData,
    matchPhase,
    myCurrentRoundScore,
    roundSummaryData,
    allRounds,
    rankResult,
    coinsAwarded,
    showPreGameLobby,
    incomingInvite,
    // actions
    startMatch,
    acceptInvite,
    declineInvite,
    handleRoundComplete,
    resetMatchState,
    continueToNextRound,
    dismissPreGameLobby,
  };
}
