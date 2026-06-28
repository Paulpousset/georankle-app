import { type Dispatch, type SetStateAction } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getTodayUTC } from './lib/daily';
import { track } from './lib/analytics';
import type { GameMode, Match, MatchMode } from './types';
import { useAuth } from './contexts/AuthContext';
import type { useNavigationStack } from './hooks/useNavigationStack';
import type { useMatchEngine } from './hooks/useMatchEngine';

import { MainMenu } from './screens/MainMenu';
import DailyHub from './screens/DailyHub';
import DailyGameHost from './screens/DailyGameHost';
import { ClassicGame } from './screens/ClassicGame';
import StreakGame from './screens/StreakGame';
import VersusCapitals from './screens/VersusCapitals';
import GuessCountryGame from './screens/GuessCountryGame';
import FindCountryGame from './screens/FindCountryGame';
import RegionGameFlow from './screens/RegionGameFlow';
import LocalParcours from './screens/LocalParcours';
import Friends from './screens/Friends';
import Profile from './screens/Profile';
import PlayerProfile from './screens/PlayerProfile';
import Matchmaking from './screens/Matchmaking';
import RankedMatchmaking from './screens/RankedMatchmaking';
import AvatarEditor from './screens/AvatarEditor';
import Shop from './screens/Shop';
import AdminNotifications from './screens/AdminNotifications';
import { AuthModal } from './components/AuthModal';
import { LeaderboardModal } from './components/LeaderboardModal';
import { OnlineModeLeaderboardModal } from './components/OnlineModeLeaderboardModal';
import { IncomingInviteModal } from './components/IncomingInviteModal';
import { PreGameLobby } from './components/PreGameLobby';
import { WaitingOpponent } from './components/WaitingOpponent';
import { RoundSummary } from './components/RoundSummary';
import { MatchResult } from './components/MatchResult';

interface RouterProps {
  nav: ReturnType<typeof useNavigationStack>;
  matchEngine: ReturnType<typeof useMatchEngine>;
  gameMode: GameMode;
  setGameMode: Dispatch<SetStateAction<GameMode>>;
  daily: { mode: GameMode; date: string } | null;
  setDaily: Dispatch<SetStateAction<{ mode: GameMode; date: string } | null>>;
  showAuthModal: boolean;
  setShowAuthModal: Dispatch<SetStateAction<boolean>>;
  showLeaderboard: boolean;
  setShowLeaderboard: Dispatch<SetStateAction<boolean>>;
  onlineLeaderboard: { mode: MatchMode; accent: string } | null;
  setOnlineLeaderboard: Dispatch<SetStateAction<{ mode: MatchMode; accent: string } | null>>;
  /** Incoming friend-request count for the header badge. */
  pendingFriendCount: number;
  /** Re-sync that count once the Friends screen resolves a request. */
  refreshFriendCount: () => void;
}

/**
 * Maps the current app state (daily / page stack / match phase / game mode) to
 * the screen on display. Pure routing — all state lives in the contexts and the
 * useNavigationStack / useMatchEngine hooks; this component only reads it.
 */
export function Router({
  nav,
  matchEngine,
  gameMode,
  setGameMode,
  daily,
  setDaily,
  showAuthModal,
  setShowAuthModal,
  showLeaderboard,
  setShowLeaderboard,
  onlineLeaderboard,
  setOnlineLeaderboard,
  pendingFriendCount,
  refreshFriendCount,
}: RouterProps) {
  const { user, isAdmin } = useAuth();
  const { currentPage, pushPage, popPage, clearPages, openPlayer, playType, setPlayType } = nav;
  const {
    matchData,
    matchPhase,
    myCurrentRoundScore,
    roundSummaryData,
    allRounds,
    rankResult,
    coinsAwarded,
    showPreGameLobby,
    incomingInvite,
    startMatch,
    acceptInvite,
    declineInvite,
    handleRoundComplete,
    resetMatchState,
    continueToNextRound,
    dismissPreGameLobby,
  } = matchEngine;

  // A daily challenge in progress overlays everything (it has its own seed +
  // completion flow); leaving it returns to the daily hub page underneath.
  if (daily) {
    return (
      <DailyGameHost
        mode={daily.mode}
        date={daily.date}
        user={user}
        onExit={() => setDaily(null)}
      />
    );
  }

  if (currentPage?.name === 'daily') {
    return (
      <SafeAreaProvider>
        <DailyHub
          user={user}
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
          onBack={popPage}
          onOpenPlayer={openPlayer}
          onRequestsChanged={refreshFriendCount}
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
        />
      </SafeAreaProvider>
    );
  }

  if (currentPage?.name === 'profile' && user) {
    return (
      <SafeAreaProvider>
        <Profile
          onBack={popPage}
          onLoggedOut={clearPages}
          onEditAvatar={() => pushPage({ name: 'avatar' })}
          onOpenShop={() => pushPage({ name: 'shop' })}
          isAdmin={isAdmin}
          onOpenAdmin={() => pushPage({ name: 'admin-notifications' })}
        />
      </SafeAreaProvider>
    );
  }

  if (currentPage?.name === 'admin-notifications' && user && isAdmin) {
    return (
      <SafeAreaProvider>
        <AdminNotifications
          onBack={popPage}
        />
      </SafeAreaProvider>
    );
  }

  if (currentPage?.name === 'ranked' && user) {
    return (
      <SafeAreaProvider>
        <RankedMatchmaking
          onBack={popPage}
          onStartMatch={(match: Match) => startMatch(match)}
        />
      </SafeAreaProvider>
    );
  }

  if (currentPage?.name === 'avatar' && user) {
    return (
      <SafeAreaProvider>
        <AvatarEditor
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
          gameMode={currentPage.mode}
          onBack={popPage}
          onStartMatch={(match: Match) => startMatch(match)}
        />
      </SafeAreaProvider>
    );
  }

  if (matchData && matchPhase === 'waiting_opponent') {
    return (
      <SafeAreaProvider>
        <WaitingOpponent
          myScore={myCurrentRoundScore}
          gameMode={gameMode}
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
          gameMode={roundSummaryData.gameMode}
          onContinue={continueToNextRound}
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
          onReady={dismissPreGameLobby}
        />
      </SafeAreaProvider>
    );
  }

  if (gameMode === 'local-builder') {
    return (
      <SafeAreaProvider>
        <LocalParcours
          onExit={() => setGameMode('menu')}
        />
      </SafeAreaProvider>
    );
  }

  if (gameMode === 'streak') {
    return (
      <SafeAreaProvider>
        <StreakGame
          setGameMode={(mode) => { resetMatchState(); setGameMode(mode); }}
          user={user}
          matchData={matchData}
          onRoundComplete={matchData ? handleRoundComplete : undefined}
        />
      </SafeAreaProvider>
    );
  }

  if (gameMode === 'quiz-capital' || gameMode === 'quiz-flag') {
    const initialGameType = gameMode === 'quiz-capital' ? 'CAPITAL' : 'FLAG';
    return (
      <SafeAreaProvider>
        <VersusCapitals
          setGameMode={setGameMode}
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
          setGameMode={setGameMode}
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
          user={user}
          matchData={matchData}
          onRoundComplete={matchData ? handleRoundComplete : undefined}
          onExit={resetMatchState}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <MainMenu
        isAuthenticated={!!user}
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
        pendingFriendCount={pendingFriendCount}
        incomingInviteMode={incomingInvite?.game_mode ?? null}
      />

      <AuthModal
        visible={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
      <LeaderboardModal
        visible={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
        onOpenPlayer={user ? openPlayer : undefined}
      />
      <OnlineModeLeaderboardModal
        mode={onlineLeaderboard?.mode ?? null}
        accent={onlineLeaderboard?.accent ?? '#2a6e3f'}
        onClose={() => setOnlineLeaderboard(null)}
        onOpenPlayer={user ? openPlayer : undefined}
      />
      <IncomingInviteModal
        invite={incomingInvite}
        onAccept={acceptInvite}
        onDecline={declineInvite}
      />
    </SafeAreaProvider>
  );
}
