import { useEffect, useRef, useState } from 'react';
import { Alert, Appearance, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, PlayfairDisplay_700Bold, PlayfairDisplay_900Black } from '@expo-google-fonts/playfair-display';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import type { User } from '@supabase/supabase-js';

import { supabase } from './src/lib/supabase';
import { registerForPushNotifications } from './src/lib/notifications';
import type { GameMode, Language, Match, MatchMode } from './src/types';
import { tr } from './src/i18n';

import { MainMenu } from './src/screens/MainMenu';
import { ClassicGame } from './src/screens/ClassicGame';
import StreakGame from './src/screens/StreakGame';
import VersusCapitals from './src/screens/VersusCapitals';
import GuessCountryGame from './src/screens/GuessCountryGame';
import FindCountryGame from './src/screens/FindCountryGame';
import LocalParcours from './src/screens/LocalParcours';
import Friends from './src/screens/Friends';
import Profile from './src/screens/Profile';
import Matchmaking from './src/screens/Matchmaking';
import RankedMatchmaking from './src/screens/RankedMatchmaking';
import AvatarEditor from './src/screens/AvatarEditor';
import Shop from './src/screens/Shop';
import { AuthModal } from './src/components/AuthModal';
import { LeaderboardModal } from './src/components/LeaderboardModal';
import { OnlineModeLeaderboardModal } from './src/components/OnlineModeLeaderboardModal';
import { IncomingInviteModal } from './src/components/IncomingInviteModal';
import { PreGameLobby } from './src/components/PreGameLobby';
import { WaitingOpponent } from './src/components/WaitingOpponent';
import { RoundSummary, type RoundSummaryData } from './src/components/RoundSummary';
import { MatchResult } from './src/components/MatchResult';

export default function App() {
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_700Bold,
    PlayfairDisplay_900Black,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  const [isDarkMode, setIsDarkMode] = useState(Appearance.getColorScheme() === 'dark');
  const [language, setLanguage] = useState<Language>('fr');
  const [gameMode, setGameMode] = useState<GameMode>('menu');
  const [user, setUser] = useState<User | null>(null);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [onlineLeaderboard, setOnlineLeaderboard] = useState<{ mode: MatchMode; accent: string } | null>(null);
  const [showFriends, setShowFriends] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showRankedMatchmaking, setShowRankedMatchmaking] = useState(false);
  const [showAvatarEditor, setShowAvatarEditor] = useState(false);
  const [showShop, setShowShop] = useState(false);

  const [selectedMatchMode, setSelectedMatchMode] = useState<MatchMode | null>(null);
  const [matchData, setMatchData] = useState<Match | null>(null);
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

  const toggleLanguage = () => setLanguage((l) => (l === 'fr' ? 'en' : 'fr'));
  const toggleTheme = () => setIsDarkMode((prev) => !prev);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setShowAuthModal(false);
        // Ensure a profile row exists for this user.
        supabase
          .from('profiles')
          .upsert({ id: session.user.id }, { onConflict: 'id' })
          .then(({ error }) => {
            if (error) console.log('Profile upsert error:', error);
          });
        // Register this device for push notifications (multiplayer invites).
        registerForPushNotifications(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
      return;
    }
    if (typeof data?.coins_awarded === 'number' && data.coins_awarded > 0) {
      setCoinsAwarded(data.coins_awarded);
    }
  };

  // ─── Match start helper ──────────────────────────────────────────────────────

  const startMatch = (match: Match) => {
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
    const matchCopy = { ...incomingInvite };

    const { data: updatedMatch, error } = await supabase
      .from('matches')
      .update({ status: 'in_progress' })
      .eq('id', matchCopy.id)
      .select()
      .single();

    setIncomingInvite(null);

    if (!error && updatedMatch) {
      setSelectedMatchMode(null);
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
  };

  const declineInvite = async () => {
    if (!incomingInvite) return;
    await supabase.from('matches').update({ status: 'cancelled' }).eq('id', incomingInvite.id);
    setIncomingInvite(null);
  };

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#f2e8d0' }} />;
  }

  if (showFriends) {
    return (
      <SafeAreaProvider>
        <Friends
          session={{ user }}
          onBack={() => setShowFriends(false)}
          isDarkMode={isDarkMode}
          language={language}
        />
      </SafeAreaProvider>
    );
  }

  if (showProfile && user) {
    return (
      <SafeAreaProvider>
        <Profile
          session={{ user }}
          onBack={() => setShowProfile(false)}
          onLoggedOut={() => setShowProfile(false)}
          onEditAvatar={() => { setShowProfile(false); setShowAvatarEditor(true); }}
          onOpenShop={() => { setShowProfile(false); setShowShop(true); }}
          isDarkMode={isDarkMode}
          language={language}
        />
      </SafeAreaProvider>
    );
  }

  if (showRankedMatchmaking && user) {
    return (
      <SafeAreaProvider>
        <RankedMatchmaking
          session={{ user }}
          onBack={() => setShowRankedMatchmaking(false)}
          onStartMatch={(match: Match) => {
            setShowRankedMatchmaking(false);
            startMatch(match);
          }}
          isDarkMode={isDarkMode}
          language={language}
        />
      </SafeAreaProvider>
    );
  }

  if (showAvatarEditor && user) {
    return (
      <SafeAreaProvider>
        <AvatarEditor
          session={{ user }}
          isDarkMode={isDarkMode}
          language={language}
          onBack={() => setShowAvatarEditor(false)}
          onOpenShop={() => { setShowAvatarEditor(false); setShowShop(true); }}
        />
      </SafeAreaProvider>
    );
  }

  if (showShop && user) {
    return (
      <SafeAreaProvider>
        <Shop
          session={{ user }}
          isDarkMode={isDarkMode}
          language={language}
          onBack={() => setShowShop(false)}
          onEditAvatar={() => { setShowShop(false); setShowAvatarEditor(true); }}
        />
      </SafeAreaProvider>
    );
  }

  if (selectedMatchMode) {
    return (
      <SafeAreaProvider>
        <Matchmaking
          session={{ user }}
          gameMode={selectedMatchMode}
          onBack={() => setSelectedMatchMode(null)}
          onStartMatch={(match: Match) => {
            setSelectedMatchMode(null);
            startMatch(match);
          }}
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
        onOpenAuth={() => (user ? setShowProfile(true) : setShowAuthModal(true))}
        onOpenShop={() => (user ? setShowShop(true) : setShowAuthModal(true))}
        onOpenFriends={() => setShowFriends(true)}
        onOpenLeaderboard={() => setShowLeaderboard(true)}
        onOpenOnlineModeLeaderboard={(mode, accent) => setOnlineLeaderboard({ mode, accent })}
        onPlay={setGameMode}
        onPlayOnline={setSelectedMatchMode}
        onPlayRanked={() => (user ? setShowRankedMatchmaking(true) : setShowAuthModal(true))}
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
      />
      <OnlineModeLeaderboardModal
        mode={onlineLeaderboard?.mode ?? null}
        accent={onlineLeaderboard?.accent ?? '#2a6e3f'}
        isDarkMode={isDarkMode}
        language={language}
        onClose={() => setOnlineLeaderboard(null)}
        onToggleTheme={toggleTheme}
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
}
