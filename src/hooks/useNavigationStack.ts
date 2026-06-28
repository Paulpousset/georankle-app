import { useState } from 'react';
import type { MatchMode } from '../types';
import type { PlayType } from '../screens/MainMenu';
import { useAuth } from '../contexts/AuthContext';

/** A full-screen page kept in the navigation history (see `pageStack`). */
export type Page =
  | { name: 'friends' }
  | { name: 'profile' }
  | { name: 'player-profile'; userId: string; username?: string | null }
  | { name: 'ranked' }
  | { name: 'avatar' }
  | { name: 'shop' }
  | { name: 'daily' }
  | { name: 'admin-notifications' }
  | { name: 'matchmaking'; mode: MatchMode };

/**
 * The home-grown page navigation: a stack of full-screen "pages" (everything
 * reachable from the menu that isn't a game or a live-match flow) plus the open
 * menu sub-list (`playType`). The cross-cutting back gesture lives in App, which
 * is the only place that also knows about games/matches/daily.
 */
export function useNavigationStack() {
  const { user } = useAuth();

  // Pages stack on each other so "back" returns to wherever you actually came
  // from — e.g. Profile → Shop → back lands on Profile, not the menu. The top of
  // the stack is the page on screen; an empty stack means the menu (or an active
  // game) is showing.
  const [pageStack, setPageStack] = useState<Page[]>([]);
  const currentPage = pageStack[pageStack.length - 1] ?? null;

  // Which menu sub-list (solo / local / online) is open. Lifted out of MainMenu
  // so it survives launching a game — leaving the game returns to that list, not
  // the play-type chooser.
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

  return {
    pageStack,
    currentPage,
    playType,
    setPlayType,
    pushPage,
    popPage,
    clearPages,
    openPlayer,
  };
}
