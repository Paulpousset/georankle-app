import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { registerForPushNotifications } from '../lib/notifications';
import { touchLastSeen } from '../lib/activity';
import { fetchIsAdmin } from '../lib/admin';
import { syncOnLogin } from '../lib/daily';
import { track, identify, resetIdentity } from '../lib/analytics';
import { Sentry } from '../lib/sentry';
import { log } from '../lib/log';

interface AuthContextValue {
  /** The signed-in user, or null when logged out. Single source of truth. */
  user: User | null;
  /** Whether this user may open the admin notifications panel. */
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
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
            if (error) log.error('Profile upsert error:', error);
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

  const value = useMemo<AuthContextValue>(() => ({ user, isAdmin }), [user, isAdmin]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
