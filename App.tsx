import { useEffect, useRef, useState } from 'react';
import { Alert, Appearance, AppState, BackHandler, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, PlayfairDisplay_700Bold, PlayfairDisplay_900Black } from '@expo-google-fonts/playfair-display';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import type { User } from '@supabase/supabase-js';

import { PostHogProvider } from 'posthog-react-native';

import { supabase } from './src/lib/supabase';
import { registerForPushNotifications } from './src/lib/notifications';
import { touchLastSeen } from './src/lib/activity';
import { fetchIsAdmin } from './src/lib/admin';
import { getTodayUTC, syncOnLogin } from './src/lib/daily';
import type { GameMode, Language, Match, MatchMode } from './src/types';
import { tr } from './src/i18n';
import { posthog, track, trackScreen, identify, resetIdentity } from './src/lib/analytics';
import { initSentry, Sentry } from './src/lib/sentry';

// Start crash reporting as early as possible so startup errors are captured.
initSentry();

import { MainMenu, type PlayType } from './src/screens/MainMenu';
import DailyHub from './src/screens/DailyHub';
import DailyGameHost from './src/screens/DailyGameHost';
import { ClassicGame } from './src/screens/ClassicGame';
import StreakGame from './src/screens/StreakGame';
import VersusCapitals from './src/screens/VersusCapitals';
import GuessCountryGame from './src/screens/GuessCountryGame';
import FindCountryGame from './src/screens/FindCountryGame';
import RegionGameFlow from './src/screens/RegionGameFlow';
import LocalParcours from './src/screens/LocalParcours';
import Friends from './src/screens/Friends';
import Profile from './src/screens/Profile';
import PlayerProfile from './src/screens/PlayerProfile';
import Matchmaking from './src/screens/Matchmaking';
import RankedMatchmaking from './src/screens/RankedMatchmaking';
import AvatarEditor from './src/screens/AvatarEditor';
import Shop from './src/screens/Shop';
import AdminNotifications from './src/screens/AdminNotifications';
import { AuthModal } from './src/components/AuthModal';
import { LeaderboardModal } from './src/components/LeaderboardModal';
import { OnlineModeLeaderboardModal } from './src/components/OnlineModeLeaderboardModal';
import { IncomingInviteModal } from './src/components/IncomingInviteModal';
import { PreGameLobby } from './src/components/PreGameLobby';
import { WaitingOpponent } from './src/components/WaitingOpponent';
import { RoundSummary, type RoundSummaryData } from './src/components/RoundSummary';
import { MatchResult } from './src/components/MatchResult';
import { SwipeBack } from './src/components/SwipeBack';

/** A full-screen page kept in the navigation history (see `pageStack`). */
type Page =
  | { name: 'friends' }
  | { name: 'profile' }
  | { name: 'player-profile'; userId: string; username?: string | null }
  | { name: 'ranked' }
  | { name: 'avatar' }
  | { name: 'shop' }
  | { name: 'daily' }
  | { name: 'admin-notifications' }
  | { name: 'matchmaking'; mode: MatchMode };

function App() {
  const [fontsLoaded, fontError] = useFonts({
    PlayfairDisplay_700Bold,
    PlayfairDisplay_900Black,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  // Don't block the whole app on font loading. If fonts fail or hang, render
  // anyway with the system font rather than stay stuck on a blank screen.
  const [fontTimedOut, setFontTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFontTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, []);
  const fontsReady = fontsLoaded || !!fontError || fontTimedOut;

  const [isDarkMode, setIsDarkMode] = useState(Appearance.getColorScheme() === 'dark');
  const [language, setLanguage] = useState<Language>('fr');
  const [gameMode, setGameMode] = useState<GameMode>('menu');
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [onlineLeaderboard, setOnlineLeaderboard] = useState<{ mode: MatchMode; accent: string } | null>(null);
  // Navigation history for the full-screen "pages" (everything reachable from
  // the menu that isn't a game or a live-match flow). Pages stack on each other
  // so "back" returns to wherever you actually came from — e.g. Profile → Shop
  // → back lands on Profile, not the menu. The top of the stack is the page on
  // screen; an empty stack means the menu (or an active game) is showing.
  const [pageStack, setPageStack] = useState<Page[]>([]);
  const currentPage = pageStack[pageStack.length - 1] ?? null;
  // Which menu sub-list (solo / local / online) is open. Lifted out of MainMenu
  // so it survives launching a game — leaving the game returns to that list,
  // not the play-type chooser.
  const [playType, setPlayType] = useState<PlayType | null>(null);
  const pushPage = (p: Page) => setPageStack((s) => [...s, p]);
  const popPage = () => setPageStack((s) => s.slice(0, -1));
  const clearPages = () => setPageStack([]);
  // Open a player's profile from anywhere (leaderboards, friends, lobby).
  // Tapping yourself opens your own editable profile instead of the read-only one.
  const openPlayer = (playerId: string, playerName?: string | null) => {
    if (!user) return;
    if (playerId === user.id) pushPage({ name: 'profile' });
    else pushPage({ name: 'player-profile', userId: playerId, username: playerName });
  };
  const [matchData, setMatchData] = useState<Match | null>(null);
  // Daily challenge in progress: which solo mode + the (fixed) UTC date played.
  const [daily, setDaily] = useState<{ mode: GameMode; date: string } | null>(null);
  const [incomingInvite, setIncomingInvite] = useState<Match | null>(null);
  const [showPreGameLobby, setShowPreGameLobby] = useState(false);

  // Ranked mode sequence for the current match (populated on match start)
  const rankedModesRef = useRef<MatchMode[] | null>(null);

  type MatchPhase = 'playing' | 'waiting_opponent' | 'round_summary' | 'match_over';
  const [matchPhase, setMatchPhase] = useState<MatchPhase>('playing');
  const [myCurrentRoundScore, setMyCurrentRoundScore] = useState(0);
  const [roundSummaryData, setRoundSummaryData] = useState<RoundSummaryData | null>(null);
  const [allRounds, setAllRounds] = useState<RoundSummaryData[]>([]);
  const [rankResult, setRankResult] = useState<{ eloChange: number; newElo: number; oldElo: number } | null>(null);
  const [coinsAwarded, setCoinsAwarded] = useState<number | null>(null);

  const toggleLanguage = () =>
    setLanguage((l) => {
      const next = l === 'fr' ? 'en' : 'fr';
      track('language_toggled', { language: next });
      return next;
    });
  const toggleTheme = () =>
    setIsDarkMode((prev) => {
      track('theme_toggled', { dark: !prev });
      return !prev;
    });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setShowAuthModal(false);
        // Tie analytics + crash reports to this user (links prior anon events).
        identify(session.user.id);
        Sentry.setUser({ id: session.user.id });
        // Distinguish a brand-new account from a returning login.
        if (event === 'SIGNED_IN') track('logged_in');
        // Ensure a profile row exists for this user.
        supabase
          .from('profiles')
          .upsert({ id: session.user.id }, { onConflict: 'id' })
          .then(({ error }) => {
            if (error) console.log('Profile upsert error:', error);
          });
        // Register this device for push notifications (multiplayer invites).
        registerForPushNotifications(session.user.id);
        // Push any logged-out daily results to the server and adopt its streak.
        syncOnLogin(session.user);
        // Record activity (powers the "inactive" notification segment) and
        // learn whether this user can open the admin notifications panel.
        touchLastSeen();
        fetchIsAdmin(session.user.id).then(setIsAdmin);
      } else if (event === 'SIGNED_OUT') {
        track('logged_out');
        resetIdentity();
        Sentry.setUser(null);
        setIsAdmin(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Keep last_seen fresh whenever the app comes to the foreground (throttled in
  // the helper). This is what makes "inactive for N days" targeting meaningful.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && user) touchLastSeen();
    });
    return () => sub.remove();
  }, [user]);

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
      if (data && data.length > 0) setIncomingInvite(data[0]);
    };
    fetchInvites();

    const channel = supabase
      .channel(`invites_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches', filter: `player2_id=eq.${user.id}` },
        (payload) => {
          const match = payload.new as Match;
          if (match.status === 'waiting' && match.is_public === false) setIncomingInvite(match);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `player2_id=eq.${user.id}` },
        (payload) => {
          const match = payload.new as Match;
          if (match.status === 'cancelled' && incomingInvite && incomingInvite.id === match.id) {
            setIncomingInvite(null);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, incomingInvite?.id]);

  // Screen tracking. Navigation is custom (pageStack + gameMode + matchData),
  // so PostHog autocapture can't see it — derive a name and report it ourselves.
  useEffect(() => {
    let name: string;
    if (currentPage) name = currentPage.name;
    else if (matchData) name = `match:${gameMode}`;
    else if (gameMode !== 'menu') name = `game:${gameMode}`;
    else name = 'menu';
    trackScreen(name, { play_type: playType ?? undefined });
  }, [currentPage, gameMode, matchData, playType]);

  // ─── Ranked ELO update ──────────────────────────────────────────────────────

  // ELO is computed server-side (SECURITY DEFINER RPC) so it cannot be spoofed
  // by the client. Both clients may call this; the function is idempotent and
  // row-locked, so only the first call mutates ratings.
  const updateRankedRating = async (match: Match) => {
    const { data, error } = await supabase.rpc('apply_ranked_result', {
      p_match_id: match.id,
    });

    if (error) {
      console.log('apply_ranked_result error:', error);
      Alert.alert(
        tr(language, 'Erreur', 'Error'),
        tr(language, 'Impossible de mettre à jour ton classement.', 'Could not update your ranking.'),
      );
      return;
    }

    // When the result was already applied (opponent's client got there first),
    // re-read the caller's standing so the UI still shows the new ELO.
    if (data?.already_applied) {
      setRankResult({ eloChange: 0, newElo: data.new_elo ?? 0, oldElo: data.new_elo ?? 0 });
      return;
    }

    setRankResult({
      eloChange: data?.elo_change ?? 0,
      newElo: data?.new_elo ?? 0,
      oldElo: data?.old_elo ?? 0,
    });
    if (typeof data?.coins_awarded === 'number') setCoinsAwarded(data.coins_awarded);
  };

  // Coins for non-ranked online matches. Server-authoritative + idempotent
  // (matches.coins_awarded guard); both clients may call it.
  const awardOnlineCoins = async (match: Match) => {
    const { data, error } = await supabase.rpc('apply_online_result', { p_match_id: match.id });
    if (error) {
      console.log('apply_online_result error:', error);
      Alert.alert(
        tr(language, 'Erreur', 'Error'),
        tr(language, 'Impossible de créditer tes pièces.', 'Could not credit your coins.'),
      );
      return;
    }
    if (typeof data?.coins_awarded === 'number' && data.coins_awarded > 0) {
      setCoinsAwarded(data.coins_awarded);
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
    const ranked_modes = match.game_data?.ranked_modes;
    if (match.is_ranked && ranked_modes?.length) {
      rankedModesRef.current = ranked_modes;
      setGameMode(ranked_modes[0]);
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

  const handleRoundComplete = async (myScore: number) => {
    if (!matchData || !user) return;
    const isPlayer1 = matchData.player1_id === user.id;
    const myScoreField = isPlayer1 ? 'p1_current_score' : 'p2_current_score';
    const myFinishedField = isPlayer1 ? 'p1_finished_round' : 'p2_finished_round';

    setMyCurrentRoundScore(myScore);
    setMatchPhase('waiting_opponent');

    const processRound = async (state: any) => {
      const p1Score = (state.p1_current_score as number) ?? 0;
      const p2Score = (state.p2_current_score as number) ?? 0;
      const myRoundScore = isPlayer1 ? p1Score : p2Score;
      const oppRoundScore = isPlayer1 ? p2Score : p1Score;
      const p1Wins = p1Score > p2Score;
      const draw = p1Score === p2Score;
      const oldP1 = (state.p1_rounds_won as number) ?? 0;
      const oldP2 = (state.p2_rounds_won as number) ?? 0;
      const newP1 = oldP1 + (p1Wins ? 1 : 0);
      const newP2 = oldP2 + (!p1Wins && !draw ? 1 : 0);
      const bo = (state.best_of as number) ?? 1;
      const needed = Math.ceil(bo / 2);
      const matchOver = newP1 >= needed || newP2 >= needed;
      const roundNum = (state.current_round as number) ?? 1;
      const myWon = isPlayer1 ? newP1 : newP2;
      const oppWon = isPlayer1 ? newP2 : newP1;

      if (isPlayer1) {
        await supabase.from('matches').update({
          p1_rounds_won: newP1,
          p2_rounds_won: newP2,
          current_round: roundNum + 1,
          p1_finished_round: false,
          p2_finished_round: false,
          p1_current_score: 0,
          p2_current_score: 0,
          status: matchOver ? 'completed' : 'in_progress',
        }).eq('id', matchData.id);
      }

      setMatchData(prev => prev ? {
        ...prev, p1_rounds_won: newP1, p2_rounds_won: newP2, current_round: roundNum + 1,
      } : null);

      // Award progression when the series ends. Ranked applies ELO + coins;
      // non-ranked online matches award coins only. Both are server-side.
      if (matchOver && user) {
        if (state.is_ranked) {
          await updateRankedRating(matchData);
        } else if (matchData.player2_id) {
          await awardOnlineCoins(matchData);
        }
      }

      const summary: RoundSummaryData = {
        roundNumber: roundNum, myScore: myRoundScore, opponentScore: oppRoundScore,
        myRoundsWon: myWon, opponentRoundsWon: oppWon, bestOf: bo,
        isMatchOver: matchOver,
        matchWinner: matchOver ? (myWon >= needed ? 'me' : 'opponent') : null,
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
          result: myWon >= needed ? 'won' : draw ? 'draw' : 'lost',
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
      .update({ [myScoreField]: myScore, [myFinishedField]: true })
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

  const declineInvite = async () => {
    if (!incomingInvite) return;
    track('match_invite_declined', { mode: incomingInvite.game_mode });
    await supabase.from('matches').update({ status: 'cancelled' }).eq('id', incomingInvite.id);
    setIncomingInvite(null);
  };

  // The Android hardware/gesture back button mirrors the in-app back: pop a
  // page, or leave a solo game, returning to where you came from.
  useEffect(() => {
    const onHardwareBack = () => {
      if (daily) {
        setDaily(null);
        return true;
      }
      if (pageStack.length > 0) {
        popPage();
        return true;
      }
      if (gameMode !== 'menu' && !matchData) {
        resetMatchState();
        return true;
      }
      // On the menu, step out of a play-type sub-list back to the chooser.
      if (gameMode === 'menu' && playType !== null) {
        setPlayType(null);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageStack.length, gameMode, matchData, playType, daily]);

  if (!fontsReady) {
    return <View style={{ flex: 1, backgroundColor: '#f2e8d0' }} />;
  }

  // Swipe-back / hardware-back is available whenever there's somewhere to go:
  // a page on the stack, a solo game (live matches are excluded so a stray
  // gesture can't abandon a match mid-round), or an open menu sub-list.
  const canGoBack =
    daily != null ||
    pageStack.length > 0 ||
    (gameMode !== 'menu' && !matchData) ||
    (gameMode === 'menu' && playType !== null);
  const goBack = () => {
    if (daily) {
      setDaily(null);
      return;
    }
    if (pageStack.length > 0) {
      popPage();
      return;
    }
    if (gameMode !== 'menu' && !matchData) {
      resetMatchState();
      return;
    }
    if (gameMode === 'menu' && playType !== null) setPlayType(null);
  };

  const renderScreen = () => {
  // A daily challenge in progress overlays everything (it has its own seed +
  // completion flow); leaving it returns to the daily hub page underneath.
  if (daily) {
    return (
      <DailyGameHost
        mode={daily.mode}
        date={daily.date}
        user={user}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        language={language}
        setLanguage={setLanguage}
        onToggleTheme={toggleTheme}
        onToggleLanguage={toggleLanguage}
        onExit={() => setDaily(null)}
      />
    );
  }

  if (currentPage?.name === 'daily') {
    return (
      <SafeAreaProvider>
        <DailyHub
          user={user}
          isDarkMode={isDarkMode}
          language={language}
          onPlayDaily={(mode) => setDaily({ mode, date: getTodayUTC() })}
          onBack={popPage}
          onOpenPlayer={user ? openPlayer : undefined}
        />
      </SafeAreaProvider>
    );
  }

  if (currentPage?.name === 'friends') {
    return (
      <SafeAreaProvider>
        <Friends
          session={{ user }}
          onBack={popPage}
          onOpenPlayer={openPlayer}
          isDarkMode={isDarkMode}
          language={language}
        />
      </SafeAreaProvider>
    );
  }

  if (currentPage?.name === 'player-profile' && user) {
    return (
      <SafeAreaProvider>
        <PlayerProfile
          userId={currentPage.userId}
          initialUsername={currentPage.username}
          currentUserId={user.id}
          onBack={popPage}
          isDarkMode={isDarkMode}
          language={language}
        />
      </SafeAreaProvider>
    );
  }

  if (currentPage?.name === 'profile' && user) {
    return (
      <SafeAreaProvider>
        <Profile
          session={{ user }}
          onBack={popPage}
          onLoggedOut={clearPages}
          onEditAvatar={() => pushPage({ name: 'avatar' })}
          onOpenShop={() => pushPage({ name: 'shop' })}
          isAdmin={isAdmin}
          onOpenAdmin={() => pushPage({ name: 'admin-notifications' })}
          isDarkMode={isDarkMode}
          language={language}
        />
      </SafeAreaProvider>
    );
  }

  if (currentPage?.name === 'admin-notifications' && user && isAdmin) {
    return (
      <SafeAreaProvider>
        <AdminNotifications
          session={{ user }}
          onBack={popPage}
          isDarkMode={isDarkMode}
          language={language}
        />
      </SafeAreaProvider>
    );
  }

  if (currentPage?.name === 'ranked' && user) {
    return (
      <SafeAreaProvider>
        <RankedMatchmaking
          session={{ user }}
          onBack={popPage}
          onStartMatch={(match: Match) => startMatch(match)}
          isDarkMode={isDarkMode}
          language={language}
        />
      </SafeAreaProvider>
    );
  }

  if (currentPage?.name === 'avatar' && user) {
    return (
      <SafeAreaProvider>
        <AvatarEditor
          session={{ user }}
          isDarkMode={isDarkMode}
          language={language}
          onBack={popPage}
          onOpenShop={() => pushPage({ name: 'shop' })}
        />
      </SafeAreaProvider>
    );
  }

  if (currentPage?.name === 'shop' && user) {
    return (
      <SafeAreaProvider>
        <Shop
          session={{ user }}
          isDarkMode={isDarkMode}
          language={language}
          onBack={popPage}
          onEditAvatar={() => pushPage({ name: 'avatar' })}
        />
      </SafeAreaProvider>
    );
  }

  if (currentPage?.name === 'matchmaking') {
    return (
      <SafeAreaProvider>
        <Matchmaking
          session={{ user }}
          gameMode={currentPage.mode}
          onBack={popPage}
          onStartMatch={(match: Match) => startMatch(match)}
          isDarkMode={isDarkMode}
          language={language}
        />
      </SafeAreaProvider>
    );
  }

  if (matchData && matchPhase === 'waiting_opponent') {
    return (
      <SafeAreaProvider>
        <WaitingOpponent
          myScore={myCurrentRoundScore}
          gameMode={matchData.game_mode}
          isDarkMode={isDarkMode}
          language={language}
          onLeave={resetMatchState}
        />
      </SafeAreaProvider>
    );
  }

  if (matchData && matchPhase === 'round_summary' && roundSummaryData) {
    return (
      <SafeAreaProvider>
        <RoundSummary
          data={roundSummaryData}
          gameMode={matchData.game_mode}
          isDarkMode={isDarkMode}
          language={language}
          onContinue={() => {
            // For ranked matches, switch to the next round's game mode
            const modes = rankedModesRef.current;
            if (modes && matchData) {
              // current_round was already incremented; subtract 1 for 0-index
              const nextMode = modes[matchData.current_round - 1] ?? modes[0];
              setGameMode(nextMode);
            }
            setMatchPhase('playing');
            setShowPreGameLobby(true);
          }}
        />
      </SafeAreaProvider>
    );
  }

  if (matchData && matchPhase === 'match_over' && roundSummaryData) {
    return (
      <SafeAreaProvider>
        <MatchResult
          rounds={allRounds}
          myRoundsWon={roundSummaryData.myRoundsWon}
          opponentRoundsWon={roundSummaryData.opponentRoundsWon}
          bestOf={roundSummaryData.bestOf}
          gameMode={matchData.game_mode}
          isRanked={matchData.is_ranked ?? false}
          rankResult={rankResult}
          coinsAwarded={coinsAwarded}
          isDarkMode={isDarkMode}
          language={language}
          onExit={resetMatchState}
        />
      </SafeAreaProvider>
    );
  }

  if (showPreGameLobby && matchData && user) {
    return (
      <SafeAreaProvider>
        <PreGameLobby
          matchData={matchData}
          currentUserId={user.id}
          language={language}
          isDarkMode={isDarkMode}
          onReady={() => setShowPreGameLobby(false)}
        />
      </SafeAreaProvider>
    );
  }

  if (gameMode === 'local-builder') {
    return (
      <SafeAreaProvider>
        <LocalParcours
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          language={language}
          setLanguage={setLanguage}
          onToggleTheme={toggleTheme}
          onToggleLanguage={toggleLanguage}
          onExit={() => setGameMode('menu')}
        />
      </SafeAreaProvider>
    );
  }

  if (gameMode === 'streak') {
    return (
      <SafeAreaProvider>
        <StreakGame
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          setGameMode={(mode) => { resetMatchState(); setGameMode(mode); }}
          language={language}
          setLanguage={setLanguage}
          user={user}
          matchData={matchData}
          onRoundComplete={matchData ? handleRoundComplete : undefined}
        />
      </SafeAreaProvider>
    );
  }

  if (gameMode === 'quiz-capital' || gameMode === 'quiz-flag' || gameMode === 'quiz-mix') {
    const initialGameType =
      gameMode === 'quiz-capital' ? 'CAPITAL' : gameMode === 'quiz-flag' ? 'FLAG' : 'MIX';
    return (
      <SafeAreaProvider>
        <VersusCapitals
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          setGameMode={setGameMode}
          language={language}
          soloMode
          initialGameType={initialGameType}
        />
      </SafeAreaProvider>
    );
  }

  if (gameMode === 'guess') {
    return (
      <SafeAreaProvider>
        <GuessCountryGame
          isDarkMode={isDarkMode}
          language={language}
          onBackToMenu={() => { resetMatchState(); setGameMode('menu'); }}
          user={user}
          matchData={matchData}
          onRoundComplete={matchData ? handleRoundComplete : undefined}
        />
      </SafeAreaProvider>
    );
  }

  if (gameMode === 'globe') {
    return (
      <SafeAreaProvider>
        <FindCountryGame
          isDarkMode={isDarkMode}
          language={language}
          setGameMode={(mode) => { resetMatchState(); setGameMode(mode); }}
          user={user}
          matchData={matchData}
          onRoundComplete={matchData ? handleRoundComplete : undefined}
        />
      </SafeAreaProvider>
    );
  }

  if (gameMode === 'regions') {
    return (
      <SafeAreaProvider>
        <RegionGameFlow
          isDarkMode={isDarkMode}
          language={language}
          setGameMode={(mode) => { resetMatchState(); setGameMode(mode); }}
          user={user}
        />
      </SafeAreaProvider>
    );
  }

  if (gameMode === 'versus') {
    return (
      <SafeAreaProvider>
        <VersusCapitals
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          setGameMode={setGameMode}
          language={language}
          matchData={matchData}
          onRoundComplete={matchData ? handleRoundComplete : undefined}
          onExit={resetMatchState}
        />
      </SafeAreaProvider>
    );
  }

  if (gameMode === 'classic') {
    return (
      <SafeAreaProvider>
        <ClassicGame
          isDarkMode={isDarkMode}
          language={language}
          user={user}
          matchData={matchData}
          onRoundComplete={matchData ? handleRoundComplete : undefined}
          onExit={resetMatchState}
          onToggleTheme={toggleTheme}
          onToggleLanguage={toggleLanguage}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <MainMenu
        isDarkMode={isDarkMode}
        language={language}
        isAuthenticated={!!user}
        onToggleTheme={toggleTheme}
        onToggleLanguage={toggleLanguage}
        onOpenAuth={() => (user ? pushPage({ name: 'profile' }) : setShowAuthModal(true))}
        onOpenShop={() => (user ? pushPage({ name: 'shop' }) : setShowAuthModal(true))}
        onOpenFriends={() => pushPage({ name: 'friends' })}
        onOpenLeaderboard={() => {
          track('leaderboard_opened', { type: 'global' });
          setShowLeaderboard(true);
        }}
        onOpenOnlineModeLeaderboard={(mode, accent) => {
          track('leaderboard_opened', { type: 'online_mode', mode });
          setOnlineLeaderboard({ mode, accent });
        }}
        onPlay={setGameMode}
        onPlayOnline={(mode) => pushPage({ name: 'matchmaking', mode })}
        onPlayRanked={() => (user ? pushPage({ name: 'ranked' }) : setShowAuthModal(true))}
        onOpenDaily={() => pushPage({ name: 'daily' })}
        playType={playType}
        onChangePlayType={setPlayType}
      />

      <AuthModal
        visible={showAuthModal}
        isDarkMode={isDarkMode}
        language={language}
        onClose={() => setShowAuthModal(false)}
      />
      <LeaderboardModal
        visible={showLeaderboard}
        isDarkMode={isDarkMode}
        language={language}
        onClose={() => setShowLeaderboard(false)}
        onToggleTheme={toggleTheme}
        onOpenPlayer={user ? openPlayer : undefined}
      />
      <OnlineModeLeaderboardModal
        mode={onlineLeaderboard?.mode ?? null}
        accent={onlineLeaderboard?.accent ?? '#2a6e3f'}
        isDarkMode={isDarkMode}
        language={language}
        onClose={() => setOnlineLeaderboard(null)}
        onToggleTheme={toggleTheme}
        onOpenPlayer={user ? openPlayer : undefined}
      />
      <IncomingInviteModal
        invite={incomingInvite}
        isDarkMode={isDarkMode}
        language={language}
        onAccept={acceptInvite}
        onDecline={declineInvite}
      />
    </SafeAreaProvider>
  );
  };

  // Wrap the whole app so an edge swipe-right goes back, mirroring the in-app
  // back button. Disabled when there's nowhere to go (menu, or a live match).
  const tree = (
    <SwipeBack enabled={canGoBack} onBack={goBack}>
      {renderScreen()}
    </SwipeBack>
  );

  // Provide the PostHog client to the tree (enables hooks + autocapture). When
  // analytics is disabled (no key) `posthog` is null, so render the tree as-is.
  return posthog ? <PostHogProvider client={posthog}>{tree}</PostHogProvider> : tree;
}

export default Sentry.wrap(App);
