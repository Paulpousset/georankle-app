import { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, PlayfairDisplay_700Bold, PlayfairDisplay_900Black } from '@expo-google-fonts/playfair-display';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { PostHogProvider } from 'posthog-react-native';

import { ensureDailyReminder, ensureLeagueReminder } from './src/lib/notifications';
import { touchLastSeen } from './src/lib/activity';
import type { GameMode, MatchMode } from './src/types';
import { posthog, trackScreen } from './src/lib/analytics';
import { initSentry, Sentry } from './src/lib/sentry';
import { showAlert } from './src/lib/alert';
import { tr } from './src/i18n';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { LanguageProvider, useLanguage } from './src/contexts/LanguageContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { NetworkProvider } from './src/contexts/NetworkContext';
import { ToastProvider } from './src/components/ToastProvider';
import { OfflineBanner } from './src/components/OfflineBanner';
import { useMatchEngine } from './src/hooks/useMatchEngine';
import { useNavigationStack } from './src/hooks/useNavigationStack';
import { useSocialNotifications } from './src/hooks/useSocialNotifications';
import { useDeepLinks } from './src/hooks/useDeepLinks';
import { getInitialWebIntent } from './src/lib/webEntry';
import { Router } from './src/Router';
import { ScreenErrorBoundary } from './src/components/ScreenErrorBoundary';
import { SwipeBack } from './src/components/SwipeBack';
import { ModeIntroGate } from './src/components/ModeIntroModal';
import { UsernameGate } from './src/components/UsernameGate';
import { IncomingInviteModal } from './src/components/IncomingInviteModal';
import { SideRailAds } from './src/components/SideRailAds';

// Start crash reporting as early as possible so startup errors are captured.
initSentry();

function AppContent() {
  // Theme/language are read from context inside each screen now; AppContent only
  // needs `language` itself to keep the daily-reminder notification localized.
  const { language } = useLanguage();
  const { user } = useAuth();
  const [gameMode, setGameMode] = useState<GameMode>('menu');

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [onlineLeaderboard, setOnlineLeaderboard] = useState<{ mode: MatchMode; accent: string } | null>(null);

  // Home-grown page navigation (page stack + open menu sub-list + helpers).
  const nav = useNavigationStack();

  // Daily challenge in progress: which solo mode + the (fixed) UTC date played.
  const [daily, setDaily] = useState<{ mode: GameMode; date: string } | null>(null);

  // Live multiplayer match: round state machine, server-side ELO/coin RPCs, and
  // the incoming-invite subscription. Navigation is the only coupling back here.
  const match = useMatchEngine({ setGameMode, clearPages: nav.clearPages });

  // Live friend-graph awareness: pending-request count (header badge) + toasts
  // when a request arrives or one you sent is accepted.
  const social = useSocialNotifications();

  // Zero-friction web entry: a shared `/play` link boots straight into today's
  // daily challenge (playable logged out) instead of the menu — the Wordle loop.
  useEffect(() => {
    if (getInitialWebIntent()?.screen === 'daily') nav.pushPage({ name: 'daily' });
    // Mount-once: read the opening URL a single time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Viral loop: capture a referral code from the link that opened the app and
  // redeem it once a session exists — celebrate the granted coins.
  useDeepLinks(
    (coins) => {
      showAlert(
        tr(language, '🎉 Bienvenue !', '🎉 Welcome!'),
        tr(language, `Ton ami t'a offert ${coins} pièces.`, `Your friend gifted you ${coins} coins.`),
      );
    },
    // League invite link (`?league=CODE`) → auto-joined once a session exists.
    (name) => {
      showAlert(
        tr(language, '🏆 Ligue rejointe !', '🏆 League joined!'),
        tr(
          language,
          `Tu fais maintenant partie de « ${name} ». Retrouve-la dans En Ligne → Ligue.`,
          `You are now part of “${name}”. Find it under Online → League.`,
        ),
      );
    },
  );

  // Auth state (user/isAdmin) and its side effects live in AuthProvider now;
  // the only UI concern left here is dismissing the login modal once a session
  // exists (covers both a fresh sign-in and a restored session).
  useEffect(() => {
    if (user) setShowAuthModal(false);
  }, [user]);

  // Daily challenge reminders are ON by default for everyone (a local
  // notification, so it works logged out too). Users can opt out in Profile;
  // re-runs on language change so the reminder text stays localized.
  useEffect(() => {
    ensureDailyReminder(language);
    // League reminder is opt-in (enabled from the league screens); this only
    // re-schedules it so its text follows the language.
    ensureLeagueReminder(language);
  }, [language]);

  // Keep last_seen fresh whenever the app comes to the foreground (throttled in
  // the helper). This is what makes "inactive for N days" targeting meaningful.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && user) touchLastSeen();
    });
    return () => sub.remove();
  }, [user]);

  // Screen tracking. Navigation is custom (pageStack + gameMode + matchData),
  // so PostHog autocapture can't see it — derive a name and report it ourselves.
  useEffect(() => {
    let name: string;
    if (nav.currentPage) name = nav.currentPage.name;
    else if (match.matchData) name = `match:${gameMode}`;
    else if (gameMode !== 'menu') name = `game:${gameMode}`;
    else name = 'menu';
    trackScreen(name, { play_type: nav.playType ?? undefined });
  }, [nav.currentPage, gameMode, match.matchData, nav.playType]);

  // The Android hardware/gesture back button and the edge swipe both mirror the
  // in-app back: pop a page, leave a solo game, or step out of a menu sub-list,
  // returning to where you came from. The action is kept in a ref (refreshed
  // every render) so the BackHandler subscription registers once and never goes
  // stale — instead of re-subscribing on every state change with a deps array
  // that had to omit the setters it calls.
  const performBack = useRef<() => boolean>(() => false);
  // Refresh the back action after every render (an effect, not a render-time
  // assignment, so it stays clean under react-hooks/refs) — it always closes
  // over the latest state without re-subscribing the BackHandler below.
  useEffect(() => {
    performBack.current = () => {
      if (daily) {
        setDaily(null);
        return true;
      }
      if (nav.pageStack.length > 0) {
        nav.popPage();
        return true;
      }
      if (gameMode !== 'menu' && !match.matchData) {
        match.resetMatchState();
        return true;
      }
      // In a LIVE online match, consume the event and confirm before leaving —
      // otherwise Android's system back closed the whole app and silently
      // abandoned the match (the opponent then won by forfeit).
      if (match.matchData) {
        showAlert(
          tr(language, 'Quitter le match ?', 'Leave the match?'),
          tr(language, 'Tu déclareras forfait pour cette partie.', 'You will forfeit this match.'),
          [
            { text: tr(language, 'Rester', 'Stay'), style: 'cancel' },
            { text: tr(language, 'Quitter', 'Leave'), style: 'destructive', onPress: () => match.resetMatchState() },
          ],
        );
        return true;
      }
      // On the menu, step out of a play-type sub-list back to the chooser.
      if (gameMode === 'menu' && nav.playType !== null) {
        nav.setPlayType(null);
        return true;
      }
      return false;
    };
  });
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => performBack.current());
    return () => sub.remove();
  }, []);

  // Swipe-back / hardware-back is available whenever there's somewhere to go:
  // a page on the stack, a solo game (live matches are excluded so a stray
  // gesture can't abandon a match mid-round), or an open menu sub-list.
  const canGoBack =
    daily != null ||
    nav.pageStack.length > 0 ||
    (gameMode !== 'menu' && !match.matchData) ||
    (gameMode === 'menu' && nav.playType !== null);
  const goBack = () => {
    performBack.current();
  };

  // The mode whose "how to play" intro may be due: the daily challenge's mode,
  // or the solo/online game on screen — but not while a lobby, the waiting
  // screen or a round/match summary is up (those aren't the playable screen).
  const inLobbyOrSummary =
    match.showPreGameLobby ||
    match.matchPhase === 'waiting_opponent' ||
    match.matchPhase === 'round_summary' ||
    match.matchPhase === 'match_over';
  const introMode: GameMode | null = daily
    ? daily.mode
    : !inLobbyOrSummary && gameMode !== 'menu'
      ? gameMode
      : null;

  // Wrap the whole app so an edge swipe-right goes back, mirroring the in-app
  // back button. Disabled when there's nowhere to go (menu, or a live match).
  // Identity of the screen currently routed, so the per-screen error boundary
  // auto-clears when the user navigates elsewhere.
  const screenKey = `${nav.currentPage?.name ?? 'none'}:${gameMode}:${match.matchPhase ?? 'none'}:${match.matchData ? 'm' : 'x'}:${daily ? 'd' : 'x'}`;
  // Recovery action when a screen crashes: drop back to a clean menu.
  const recoverToMenu = () => {
    setDaily(null);
    match.resetMatchState();
    nav.clearPages();
    setGameMode('menu');
  };

  const tree = (
    <View style={{ flex: 1 }}>
      {/* Desktop-web-only AdSense side rails, first so everything else paints
          above them; native/mobile: renders nothing. */}
      <SideRailAds />
      <SwipeBack enabled={canGoBack} onBack={goBack}>
        <ScreenErrorBoundary resetKey={screenKey} onReset={recoverToMenu}>
          <Router
            nav={nav}
            matchEngine={match}
            gameMode={gameMode}
            setGameMode={setGameMode}
            daily={daily}
            setDaily={setDaily}
            showAuthModal={showAuthModal}
            setShowAuthModal={setShowAuthModal}
            showLeaderboard={showLeaderboard}
            setShowLeaderboard={setShowLeaderboard}
            onlineLeaderboard={onlineLeaderboard}
            setOnlineLeaderboard={setOnlineLeaderboard}
            pendingFriendCount={social.pendingFriendCount}
            refreshFriendCount={social.refreshFriendCount}
          />
        </ScreenErrorBoundary>
      </SwipeBack>
      {/* First-play "how to play" popup for whichever mode is on screen. */}
      <ModeIntroGate mode={introMode} />
      {/* Force a username on any logged-in account that lacks one (legacy
          accounts + the email-confirmation sign-up path). */}
      <UsernameGate />
      {/* Incoming game invite: mounted globally so the accept/decline modal
          pops up on ANY screen (menu, mid-game, summaries…), not just the menu. */}
      <IncomingInviteModal
        invite={match.incomingInvite}
        onAccept={match.acceptInvite}
        onDecline={match.declineInvite}
      />
      {/* Floats above every screen: offline / not-synced indicator. */}
      <OfflineBanner />
    </View>
  );

  // Provide the PostHog client to the tree (enables hooks + autocapture). When
  // analytics is disabled (no key) `posthog` is null, so render the tree as-is.
  return posthog ? <PostHogProvider client={posthog}>{tree}</PostHogProvider> : tree;
}

/**
 * App shell: loads fonts and mounts the global providers, then renders the
 * actual app. Theme/language state live in their providers, so everything below
 * reads them via `useTheme()` / `useLanguage()` instead of prop-drilling.
 */
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

  if (!fontsReady) {
    return <View style={{ flex: 1, backgroundColor: '#f2e8d0' }} />;
  }

  // If the timeout fired first, we rendered with the system font; when the real
  // fonts land afterwards Android swaps glyphs WITHOUT re-measuring layout, so
  // every Text keeps its too-narrow box and gets clipped. Remount the tree
  // (key flip) to force a fresh measure once fonts are actually ready.
  return (
    <SafeAreaProvider key={fontsLoaded ? 'fonts-ready' : 'fonts-pending'}>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <NetworkProvider>
              <ToastProvider>
                <AppContent />
              </ToastProvider>
            </NetworkProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(App);
