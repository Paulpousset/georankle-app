/**
 * Connectivity context — a thin wrapper over @react-native-community/netinfo.
 *
 * Exposes `isOnline` for the offline banner and, more importantly, flushes the
 * offline sync queue the instant connectivity is restored (and on app
 * foreground), so writes that failed while offline reconcile automatically.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import { flushQueue } from '../lib/syncQueue';

interface NetworkValue {
  /** True unless NetInfo positively reports no connectivity. Defaults to true. */
  isOnline: boolean;
}

const NetworkContext = createContext<NetworkValue>({ isOnline: true });

/** Treat "connected, internet reachable unknown" as online to avoid false alarms. */
function deriveOnline(state: { isConnected: boolean | null; isInternetReachable: boolean | null }): boolean {
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const onlineRef = useRef(true);

  useEffect(() => {
    const apply = (online: boolean) => {
      const wasOffline = !onlineRef.current;
      onlineRef.current = online;
      setIsOnline(online);
      // Reconnected → drain anything that failed while we were offline.
      if (online && wasOffline) void flushQueue();
    };

    const unsubscribe = NetInfo.addEventListener((state) => {
      apply(deriveOnline(state));
    });

    // Seed initial state and attempt one flush on mount.
    NetInfo.fetch().then((state) => {
      apply(deriveOnline(state));
      void flushQueue();
    });

    // Foregrounding is a good moment to retry even without a connectivity flip.
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && onlineRef.current) void flushQueue();
    });

    return () => {
      unsubscribe();
      appSub.remove();
    };
  }, []);

  return <NetworkContext.Provider value={{ isOnline }}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkValue {
  return useContext(NetworkContext);
}
