/**
 * FfaMatch — free-for-all online custom match for 3–8 players (item 7).
 *
 * Deliberately ISOLATED from the 1v1 useMatchEngine to keep the proven 2-player
 * path untouched. Each round is played as a local solo round (the real game
 * screens with a synthetic match + user=null, exactly like BotMatch/LocalParcours,
 * with a SHARED per-round seed so everyone gets the same questions). The per-player
 * state lives in the `match_players` table; this component syncs it over realtime
 * and resolves rounds through the server-authoritative *_ffa RPCs.
 *
 * Flow: lobby (wait until full → server flips status) → for each round: play solo,
 * write my score (current_score + finished_round) → when everyone is done any
 * client calls finalize_round_ffa → standings → next round → series end →
 * apply_ffa_result. All RPCs are idempotent + row-locked.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Home, ChevronRight, Users } from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';

import type { GameMode, Match, MatchMode } from '../types';
import { getColors, PALETTE } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { tr } from '../i18n';
import { track } from '../lib/analytics';
import { log } from '../lib/log';
import { supabase } from '../lib/supabase';
import { a11yButton } from '../lib/a11y';
import { showAlert } from '../lib/alert';
import { ScoreText } from '../components/ScoreText';
import { AtlasWin } from '../components/AtlasIcons';
import { standings as ffaStandings } from '../lib/ffa';
import { setActiveMatch, clearActiveMatch } from '../lib/activeMatch';
import { forfeitWindowElapsed, FORFEIT_WINDOW_SECONDS } from '../lib/match';

import VersusCapitals from './VersusCapitals';
import StreakGame from './StreakGame';
import HigherLowerGame from './HigherLowerGame';
import SilhouetteGame from './SilhouetteGame';
import BordersGame from './BordersGame';
import GuessCountryGame from './GuessCountryGame';
import FindCountryGame from './FindCountryGame';
import { ClassicGame } from './ClassicGame';

interface FfaMatchProps {
  match: Match;
  user: User;
  onExit: () => void;
}

interface PlayerRow {
  slot: number;
  player_id: string;
  rounds_won: number;
  total_score: number;
  current_score: number;
  finished_round: boolean;
}

type Phase = 'lobby' | 'playing' | 'submitting' | 'roundResult' | 'over';

interface CustomRoundCfg {
  mode: MatchMode;
  questionType?: 'CAPITAL' | 'FLAG';
  count?: number;
}

/** Build a local solo match for one FFA round (shared seed → identical questions). */
function makeSyntheticMatch(
  mode: MatchMode,
  seed: number,
  roundsPerSet: number,
  questionType: 'CAPITAL' | 'FLAG',
): Match {
  return {
    id: 'ffa-round',
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

export default function FfaMatch({ match, user, onExit }: FfaMatchProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const colors = getColors(isDarkMode);

  const gd = (match.game_data ?? {}) as {
    seed?: number;
    modes?: MatchMode[];
    rounds?: CustomRoundCfg[];
  };
  const modes = gd.modes ?? [match.game_mode as MatchMode];
  const baseSeed = gd.seed ?? 1;
  const bestOf = modes.length;
  const maxPlayers = match.max_players ?? 2;

  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string>(match.status ?? 'waiting');
  const [currentRound, setCurrentRound] = useState<number>(match.current_round ?? 1);
  const [phase, setPhase] = useState<Phase>(
    (match.status ?? 'waiting') === 'waiting' ? 'lobby' : 'playing',
  );
  // Snapshot of each player's score for the round just played (for the result screen).
  const [lastRoundScores, setLastRoundScores] = useState<Record<string, number>>({});

  const finalizingRound = useRef<number>(0);
  const resultApplied = useRef(false);
  // Live mirror of `players` + last round seen via realtime, for the
  // round-bump handler below (it must read state without re-subscribing).
  const playersRef = useRef<PlayerRow[]>([]);
  const lastSeenRound = useRef<number>(match.current_round ?? 1);
  useEffect(() => { playersRef.current = players; }, [players]);

  const refetchPlayers = useCallback(async () => {
    const { data } = await supabase
      .from('match_players')
      .select('slot, player_id, rounds_won, total_score, current_score, finished_round')
      .eq('match_id', match.id)
      .order('slot', { ascending: true });
    if (data) setPlayers(data as PlayerRow[]);
    return (data ?? []) as PlayerRow[];
  }, [match.id]);

  // Apply an authoritative `matches` row from EITHER realtime or the poll
  // fallback below. Idempotent — safe to call repeatedly with the same row.
  const applyMatchRow = useCallback(
    (row: { status?: string | null; current_round?: number | null }) => {
      if (row.status) setStatus(row.status);
      if (typeof row.current_round === 'number') {
        if (row.current_round > lastSeenRound.current) {
          lastSeenRound.current = row.current_round;
          // The server already reset finished_round for the new round. Our
          // players snapshot may still show everyone done for the OLD round:
          // left as-is, the finalize effect would fire on that stale data and
          // poison its once-per-round guard for the round that just started
          // (match stuck with nobody calling finalize). Snapshot the standings
          // we know, then clear the stale flags locally.
          const snap = playersRef.current;
          if (snap.length > 0 && snap.some((p) => p.finished_round)) {
            setLastRoundScores(Object.fromEntries(snap.map((p) => [p.player_id, p.current_score])));
          }
          setPlayers((ps) => ps.map((p) => ({ ...p, finished_round: false, current_score: 0 })));
        }
        setCurrentRound(row.current_round);
      }
    },
    [],
  );

  // Resolve display names once we know the player ids.
  useEffect(() => {
    const ids = players.map((p) => p.player_id).filter((id) => !(id in names));
    if (ids.length === 0) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, username')
      .in('id', ids)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setNames((prev) => {
          const next = { ...prev };
          for (const row of data as { id: string; username: string | null }[]) {
            next[row.id] = row.username ?? tr(language, 'Joueur', 'Player');
          }
          return next;
        });
      });
    return () => { cancelled = true; };
  }, [players, names, language]);

  // Remember this match for resume; clear on unmount-after-completion handled below.
  // Reconcile status + round immediately too: the match may have filled (or a
  // round advanced) between the row we were handed and our realtime subscribing,
  // which would otherwise leave us stuck until the first poll tick.
  useEffect(() => {
    setActiveMatch(match.id, Date.now());
    refetchPlayers();
    supabase
      .from('matches')
      .select('status, current_round')
      .eq('id', match.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) applyMatchRow(data as { status?: string; current_round?: number });
      });
  }, [match.id, refetchPlayers, applyMatchRow]);

  // Realtime: match_players (per-player state) + matches (status / current_round).
  useEffect(() => {
    const channel = supabase
      .channel(`ffa_${match.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_players', filter: `match_id=eq.${match.id}` },
        () => { refetchPlayers(); },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${match.id}` },
        (payload: { new: { status?: string; current_round?: number } }) => {
          applyMatchRow(payload.new);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [match.id, refetchPlayers, applyMatchRow]);

  // Reconciliation poll — the FFA path is otherwise 100% realtime-driven, so a
  // single dropped event (or a channel that subscribes just AFTER the match
  // filled / a round advanced) strands a player in the lobby or on the "waiting
  // for others" screen forever. This mirrors the 1v1 engine's poll fallback:
  // re-read the authoritative match row + player rows on an interval and let the
  // existing effects react. Everything it drives is idempotent, so it can never
  // double-advance a round or double-start a match.
  useEffect(() => {
    if (phase === 'over') return;
    let cancelled = false;
    const tick = async () => {
      const { data } = await supabase
        .from('matches')
        .select('status, current_round')
        .eq('id', match.id)
        .maybeSingle();
      if (cancelled || !data) return;
      applyMatchRow(data as { status?: string; current_round?: number });
      if (!cancelled) await refetchPlayers();
    };
    const handle = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(handle); };
  }, [phase, match.id, applyMatchRow, refetchPlayers]);

  // Host cancelled the forming lobby (leave_ffa_match) → drop the players out.
  const cancelledHandled = useRef(false);
  useEffect(() => {
    if (status !== 'cancelled' || cancelledHandled.current) return;
    cancelledHandled.current = true;
    clearActiveMatch();
    showAlert(
      tr(language, 'Partie annulée', 'Match cancelled'),
      tr(language, "L'hôte a annulé la partie.", 'The host cancelled the match.'),
    );
    onExit();
  }, [status, language, onExit]);

  // Lobby → playing when the server flips the match to in_progress.
  useEffect(() => {
    if (phase === 'lobby' && status === 'in_progress') setPhase('playing');
  }, [status, phase]);

  // Heartbeat while actively playing a round: keeps the shared activity clock
  // fresh so a slow-but-present player can't be forfeited out of the match.
  // Silent while waiting on others (mirrors the 1v1 engine) so a deserted
  // match goes stale and the close-match option below can open.
  useEffect(() => {
    if (phase !== 'playing' || status !== 'in_progress') return;
    const ping = () => {
      supabase.rpc('touch_match', { p_match_id: match.id }).then(undefined, () => {});
    };
    ping();
    const handle = setInterval(ping, 30_000);
    return () => clearInterval(handle);
  }, [phase, status, match.id]);

  // While waiting on the other players, watch the activity clock: once it has
  // gone stale past the forfeit window (someone closed the app mid-round and
  // the round can never complete), offer to close the match — the server
  // freezes the standings as they are and awards placement coins.
  const [canCloseMatch, setCanCloseMatch] = useState(false);
  const [closingMatch, setClosingMatch] = useState(false);
  useEffect(() => {
    if (phase !== 'submitting' || status !== 'in_progress') return;
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase
        .from('matches')
        .select('status, last_activity_at')
        .eq('id', match.id)
        .single();
      if (!data || cancelled || data.status !== 'in_progress') return;
      setCanCloseMatch(forfeitWindowElapsed(data.last_activity_at as string, Date.now()));
    };
    check();
    const handle = setInterval(check, 15_000);
    return () => {
      cancelled = true;
      clearInterval(handle);
      setCanCloseMatch(false);
    };
  }, [phase, status, match.id]);

  const closeAbandonedMatch = async () => {
    if (closingMatch) return;
    setClosingMatch(true);
    try {
      const { data, error } = await supabase.rpc('forfeit_match', {
        p_match_id: match.id,
        p_window_seconds: FORFEIT_WINDOW_SECONDS,
      });
      if (error) {
        log.error('forfeit_match (ffa) error:', error);
        return;
      }
      const result = (data ?? {}) as { forfeited?: boolean };
      if (!result.forfeited) {
        // Someone is back — hide the option until the clock goes stale again.
        setCanCloseMatch(false);
        return;
      }
      // Realtime will normally deliver the status flip; set it locally too so
      // the standings show even on a flaky connection.
      setStatus('completed');
    } finally {
      setClosingMatch(false);
    }
  };

  // When everyone has finished the round, snapshot scores and let any client
  // finalise it (idempotent server-side). Only fire once per round.
  useEffect(() => {
    if (status !== 'in_progress' || players.length === 0) return;
    const allDone = players.every((p) => p.finished_round);
    if (!allDone) return;
    if (finalizingRound.current === currentRound) return;
    finalizingRound.current = currentRound;
    setLastRoundScores(Object.fromEntries(players.map((p) => [p.player_id, p.current_score])));
    supabase.rpc('finalize_round_ffa', { p_match_id: match.id }).then(
      () => refetchPlayers(),
      (e) => {
        log.error('finalize_round_ffa error:', e);
        // Un-claim the round so this client (or a later players update) retries
        // — otherwise a single failed call could leave the match unfinalised.
        if (finalizingRound.current === currentRound) finalizingRound.current = 0;
      },
    );
  }, [players, status, currentRound, match.id, refetchPlayers]);

  // Series over → award placement coins once, then show the final standings.
  useEffect(() => {
    if (status !== 'completed') return;
    setPhase('over');
    clearActiveMatch();
    if (!resultApplied.current) {
      resultApplied.current = true;
      track('match_completed', { mode: 'ffa', players: maxPlayers });
      // Idempotent server-side (coins_awarded guard) → safe to retry; a
      // swallowed one-shot failure meant everyone's placement coins vanished
      // unless another player's call happened to succeed.
      const apply = async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 2000));
          const { error } = await supabase.rpc('apply_ffa_result', { p_match_id: match.id });
          if (!error) return;
          log.error('apply_ffa_result error:', error);
        }
      };
      void apply();
    }
  }, [status, match.id, maxPlayers]);

  // The round just resolved (finalize advanced current_round) → show standings.
  const prevRoundRef = useRef(currentRound);
  useEffect(() => {
    if (currentRound > prevRoundRef.current && status === 'in_progress') {
      prevRoundRef.current = currentRound;
      if (phase === 'submitting' || phase === 'playing') setPhase('roundResult');
    }
  }, [currentRound, status, phase]);

  const me = players.find((p) => p.player_id === user.id);

  const submitScore = useCallback(
    async (score: number) => {
      setPhase('submitting');
      // The write is idempotent → retry transient failures. Giving up after
      // one silent error left the player stuck on "waiting for the others"
      // with a score the server never saw.
      let error: unknown = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 3000));
        ({ error } = await supabase
          .from('match_players')
          .update({ current_score: score, finished_round: true })
          .eq('match_id', match.id)
          .eq('player_id', user.id));
        if (!error) break;
      }
      if (error) log.error('ffa submit score error (giving up):', error);
      supabase.rpc('touch_match', { p_match_id: match.id }).then(undefined, () => {});
      refetchPlayers();
    },
    [match.id, user.id, refetchPlayers],
  );

  const nextRound = () => setPhase('playing');

  // Leaving the lobby must free our seat, otherwise the ghost seat keeps the
  // match from ever reaching max_players and everyone else is stuck waiting.
  // (If we're the host, the RPC cancels the whole forming match.)
  const [leaving, setLeaving] = useState(false);
  const leaveLobby = async () => {
    if (leaving) return;
    setLeaving(true);
    clearActiveMatch();
    try {
      await supabase.rpc('leave_ffa_match', { p_match_id: match.id });
    } catch (e) {
      log.error('leave_ffa_match error:', e);
    }
    onExit();
  };

  // ── Active round: mount the real game screen in solo mode ──────────────────
  if (phase === 'playing') {
    const mode = modes[currentRound - 1] ?? modes[0];
    const cfg = gd.rounds?.[currentRound - 1];
    const roundsPerSet = cfg?.count ?? 5;
    const questionType: 'CAPITAL' | 'FLAG' = cfg?.questionType ?? 'CAPITAL';
    const seed = (baseSeed + (currentRound - 1) * 997) | 0;
    const synth = makeSyntheticMatch(mode, seed, roundsPerSet, questionType);
    const quit = onExit as (m: GameMode) => void;
    const common = { key: `r${currentRound}`, matchData: synth, onRoundComplete: submitScore };
    switch (mode) {
      case 'versus':
        return <VersusCapitals setGameMode={quit} matchData={synth} onRoundComplete={submitScore} onExit={onExit} key={common.key} />;
      case 'streak':
        return <StreakGame setGameMode={quit} user={null} {...common} />;
      case 'higherlower':
        return <HigherLowerGame setGameMode={quit} user={null} {...common} />;
      case 'silhouette':
        return <SilhouetteGame setGameMode={quit} user={null} {...common} />;
      case 'borders':
        return <BordersGame setGameMode={quit} user={null} {...common} />;
      case 'guess':
        return <GuessCountryGame onBackToMenu={onExit} user={null} {...common} />;
      case 'globe':
        return <FindCountryGame setGameMode={quit} user={null} {...common} />;
      case 'classic':
      default:
        return <ClassicGame user={null} onExit={onExit} {...common} />;
    }
  }

  // ── Lobby / submitting / round-result / over ───────────────────────────────
  const ranked = ffaStandings(
    players.map((p) => ({ id: p.player_id, roundsWon: p.rounds_won, totalScore: p.total_score })),
  );
  const nameOf = (id: string) => (id === user.id ? tr(language, 'Toi', 'You') : names[id] ?? '…');
  const iWon = ranked.length > 0 && ranked[0].id === user.id;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <View style={styles.centered}>
        {phase === 'lobby' && (
          <>
            <Users color={PALETTE.forestGreen} size={40} />
            <Text style={[styles.title, { color: colors.text }]}>
              {tr(language, "Salle d'attente", 'Lobby')}
            </Text>
            <Text style={[styles.sub, { color: colors.textMuted }]}>
              {players.length} / {maxPlayers} {tr(language, 'joueurs', 'players')}
            </Text>
            <ActivityIndicator color={PALETTE.forestGreen} style={{ marginTop: 16 }} />
            <View style={styles.playerList}>
              {players.map((p) => (
                <Text key={p.slot} style={[styles.playerLine, { color: colors.textMuted }]}>
                  {nameOf(p.player_id)}
                </Text>
              ))}
            </View>
          </>
        )}

        {phase === 'submitting' && (
          <>
            <ActivityIndicator size="large" color={PALETTE.forestGreen} />
            <Text style={[styles.sub, { color: colors.textMuted, marginTop: 16 }]}>
              {tr(language, 'En attente des autres joueurs…', 'Waiting for other players…')}
            </Text>
            <View style={styles.playerList}>
              {players.map((p) => (
                <Text key={p.slot} style={[styles.playerLine, { color: p.finished_round ? PALETTE.forestGreen : colors.textMuted }]}>
                  {nameOf(p.player_id)} {p.finished_round ? '✓' : '…'}
                </Text>
              ))}
            </View>
            {canCloseMatch && (
              <View style={{ alignItems: 'center', gap: 10, marginTop: 24, maxWidth: 320, width: '100%' }}>
                <Text style={[styles.sub, { color: colors.textMuted }]}>
                  {tr(
                    language,
                    'Un joueur semble avoir quitté la partie.',
                    'A player seems to have left the match.',
                  )}
                </Text>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: PALETTE.forestGreen, width: '100%', opacity: closingMatch ? 0.6 : 1 }]}
                  onPress={closeAbandonedMatch}
                  disabled={closingMatch}
                  {...a11yButton(
                    tr(language, 'Terminer la partie', 'End the match'),
                    { disabled: closingMatch },
                  )}
                >
                  {closingMatch && <ActivityIndicator size="small" color="#fff" />}
                  <Text style={styles.btnText}>
                    {tr(language, 'Terminer la partie', 'End the match')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {(phase === 'roundResult' || phase === 'over') && (
          <>
            {phase === 'over' && (
              <View style={{ marginBottom: 8 }}>
                <AtlasWin color={iWon ? PALETTE.forestGreen : PALETTE.sand} size={64} />
              </View>
            )}
            <Text style={[styles.title, { color: colors.text }]}>
              {phase === 'over'
                ? (iWon ? tr(language, 'Victoire !', 'You win!') : tr(language, 'Partie terminée', 'Match over'))
                : tr(language, `Manche ${currentRound - 1} / ${bestOf}`, `Round ${currentRound - 1} / ${bestOf}`)}
            </Text>
            <View style={styles.standings}>
              {ranked.map((p, i) => (
                <View key={p.id} style={[styles.standingRow, { borderColor: colors.border }]}>
                  <Text style={[styles.standingRank, { color: colors.textMuted }]}>{i + 1}</Text>
                  <Text style={[styles.standingName, { color: p.id === user.id ? PALETTE.sand : colors.text }]} numberOfLines={1}>
                    {nameOf(p.id)}
                  </Text>
                  {phase === 'roundResult' && lastRoundScores[p.id] != null && (
                    <Text style={[styles.standingPts, { color: colors.textMuted }]}>+{lastRoundScores[p.id]}</Text>
                  )}
                  <ScoreText style={[styles.standingWins, { color: colors.text }]}>
                    {p.roundsWon} {tr(language, 'v', 'w')}
                  </ScoreText>
                </View>
              ))}
            </View>

            <View style={{ gap: 12, width: '100%', maxWidth: 320, marginTop: 20 }}>
              {phase === 'roundResult' ? (
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: PALETTE.chartBlue }]}
                  onPress={nextRound}
                  {...a11yButton(tr(language, 'Manche suivante', 'Next round'))}
                >
                  <Text style={styles.btnText}>{tr(language, 'Manche suivante', 'Next round')}</Text>
                  <ChevronRight color="white" size={20} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                  onPress={onExit}
                  {...a11yButton(tr(language, 'Retour', 'Back'))}
                >
                  <Home color={colors.text} size={18} />
                  <Text style={[styles.btnText, { color: colors.text }]}>{tr(language, 'Retour', 'Back')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {phase === 'lobby' && (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginTop: 24, maxWidth: 320, width: '100%', opacity: leaving ? 0.6 : 1 }]}
            onPress={leaveLobby}
            disabled={leaving}
            {...a11yButton(tr(language, 'Quitter', 'Leave'), { disabled: leaving })}
          >
            <Home color={colors.text} size={18} />
            <Text style={[styles.btnText, { color: colors.text }]}>{tr(language, 'Quitter', 'Leave')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 6 },
  title: { fontSize: 26, fontFamily: FONTS.headingBlack, textAlign: 'center', marginTop: 8 },
  sub: { fontFamily: FONTS.mono, fontSize: 14, textAlign: 'center' },
  playerList: { marginTop: 16, gap: 4, alignItems: 'center' },
  playerLine: { fontFamily: FONTS.mono, fontSize: 13 },
  standings: { width: '100%', maxWidth: 340, marginTop: 16, gap: 6 },
  standingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  standingRank: { width: 18, fontFamily: FONTS.monoBold, fontSize: 14, textAlign: 'center' },
  standingName: { flex: 1, fontFamily: FONTS.heading, fontSize: 15 },
  standingPts: { fontFamily: FONTS.mono, fontSize: 12 },
  standingWins: { fontFamily: FONTS.monoBold, fontSize: 14 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12 },
  btnText: { color: 'white', fontFamily: FONTS.monoBold, fontSize: 16 },
});
