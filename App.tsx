import { useEffect, useState } from 'react';
import { Appearance } from 'react-native';
import type { User } from '@supabase/supabase-js';

import { supabase } from './src/lib/supabase';
import type { GameMode, Language, Match, MatchMode } from './src/types';
import { tr } from './src/i18n';

import { MainMenu } from './src/screens/MainMenu';
import { ClassicGame } from './src/screens/ClassicGame';
import StreakGame from './src/screens/StreakGame';
import VersusCapitals from './src/screens/VersusCapitals';
import GuessCountryGame from './src/screens/GuessCountryGame';
import Friends from './src/screens/Friends';
import Matchmaking from './src/screens/Matchmaking';
import { AuthModal } from './src/components/AuthModal';
import { LeaderboardModal } from './src/components/LeaderboardModal';
import { IncomingInviteModal } from './src/components/IncomingInviteModal';

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(Appearance.getColorScheme() === 'dark');
  const [language, setLanguage] = useState<Language>('fr');
  const [gameMode, setGameMode] = useState<GameMode>('menu');
  const [user, setUser] = useState<User | null>(null);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showFriends, setShowFriends] = useState(false);

  const [selectedMatchMode, setSelectedMatchMode] = useState<MatchMode | null>(null);
  // Reserved for the online flow: holds the active match once one starts.
  const [, setMatchData] = useState<Match | null>(null);
  const [incomingInvite, setIncomingInvite] = useState<Match | null>(null);

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

  const acceptInvite = async () => {
    if (!incomingInvite) return;
    const matchCopy = { ...incomingInvite };
    setIncomingInvite(null);

    const { data: updatedMatch, error } = await supabase
      .from('matches')
      .update({ status: 'in_progress' })
      .eq('id', matchCopy.id)
      .select()
      .single();

    if (!error && updatedMatch) {
      setMatchData(updatedMatch as Match);
      setGameMode(matchCopy.game_mode);
      // Mount Matchmaking to track the socket, which in turn starts the game.
      setSelectedMatchMode(matchCopy.game_mode);
    } else {
      alert(tr(language, 'Impossible de rejoindre la partie', 'Could not join match'));
    }
  };

  const declineInvite = async () => {
    if (!incomingInvite) return;
    await supabase.from('matches').update({ status: 'cancelled' }).eq('id', incomingInvite.id);
    setIncomingInvite(null);
  };

  if (showFriends) {
    return (
      <Friends
        session={{ user }}
        onBack={() => setShowFriends(false)}
        isDarkMode={isDarkMode}
        language={language}
      />
    );
  }

  if (selectedMatchMode) {
    return (
      <Matchmaking
        session={{ user }}
        gameMode={selectedMatchMode}
        onBack={() => setSelectedMatchMode(null)}
        onStartMatch={(match: Match) => {
          setMatchData(match);
          setSelectedMatchMode(null);
          setGameMode(match.game_mode);
        }}
        isDarkMode={isDarkMode}
        language={language}
      />
    );
  }

  if (gameMode === 'streak') {
    return (
      <StreakGame
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        setGameMode={setGameMode}
        language={language}
        setLanguage={setLanguage}
        user={user}
      />
    );
  }

  if (gameMode === 'guess') {
    return (
      <GuessCountryGame
        isDarkMode={isDarkMode}
        language={language}
        onBackToMenu={() => setGameMode('menu')}
      />
    );
  }

  if (gameMode === 'versus') {
    return (
      <VersusCapitals
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        setGameMode={setGameMode}
        language={language}
      />
    );
  }

  if (gameMode === 'classic') {
    return (
      <ClassicGame
        isDarkMode={isDarkMode}
        language={language}
        user={user}
        onExit={() => setGameMode('menu')}
        onToggleTheme={toggleTheme}
        onToggleLanguage={toggleLanguage}
      />
    );
  }

  return (
    <>
      <MainMenu
        isDarkMode={isDarkMode}
        language={language}
        isAuthenticated={!!user}
        onToggleTheme={toggleTheme}
        onToggleLanguage={toggleLanguage}
        onOpenAuth={() => setShowAuthModal(true)}
        onOpenFriends={() => setShowFriends(true)}
        onOpenLeaderboard={() => setShowLeaderboard(true)}
        onPlay={setGameMode}
        onPlayOnline={setSelectedMatchMode}
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
      <IncomingInviteModal
        invite={incomingInvite}
        isDarkMode={isDarkMode}
        language={language}
        onAccept={acceptInvite}
        onDecline={declineInvite}
      />
    </>
  );
}
