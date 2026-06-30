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
import { ScoreText } from '../components/ScoreText';
import { AtlasWin } from '../components/AtlasIcons';
import { standings as ffaStandings } from '../lib/ffa';
import { setActiveMatch, clearActiveMatch } from '../lib/activeMatch';

import VersusCapitals from './VersusCapitals';
import StreakGame from './StreakGame';
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

  const refetchPlayers = useCallback(async () => {
    const { data } = await supabase
      .from('match_players')
      .select('slot, player_id, rounds_won, total_score, current_score, finished_round')
      .eq('match_id', match.id)
      .order('slot', { ascending: true });
    if (data) setPlayers(data as PlayerRow[]);
    return (data ?? []) as PlayerRow[];
  }, [match.id]);

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
  useEffect(() => {
    setActiveMatch(match.id, Date.now());
    refetchPlayers();
  }, [match.id, refetchPlayers]);

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
          const row = payload.new;
          if (row.status) setStatus(row.status);
          if (typeof row.current_round === 'number') setCurrentRound(row.current_round);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [match.id, refetchPlayers]);

  // Lobby → playing when the server flips the match to in_progress.
  useEffect(() => {
    if (phase === 'lobby' && status === 'in_progress') setPhase('playing');
  }, [status, phase]);

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
      (e) => log.error('finalize_round_ffa error:', e),
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
      supabase.rpc('apply_ffa_result', { p_match_id: match.id }).then(undefined, () => {});
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
      const { error } = await supabase
        .from('match_players')
        .update({ current_score: score, finished_round: true })
        .eq('match_id', match.id)
        .eq('player_id', user.id);
      if (error) log.error('ffa submit score error:', error);
      supabase.rpc('touch_match', { p_match_id: match.id }).then(undefined, () => {});
      refetchPlayers();
    },
    [match.id, user.id, refetchPlayers],
  );

  const nextRound = () => setPhase('playing');

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
            style={[styles.btn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginTop: 24, maxWidth: 320, width: '100%' }]}
            onPress={onExit}
            {...a11yButton(tr(language, 'Quitter', 'Leave'))}
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
