import { Component, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { log } from './lib/log';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Catches render-time errors and shows the message on screen instead of a
 * silent white screen. Critical for diagnosing production (TestFlight) builds
 * where there is no Metro red box.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error) {
    log.error('App crashed:', error);
  }

  override render() {
    if (this.state.error) {
      return (
        <ScrollView
          style={{ flex: 1, backgroundColor: '#1a1a1a' }}
          contentContainerStyle={{ padding: 24, paddingTop: 80 }}
        >
          <Text style={{ color: '#ff6b6b', fontSize: 20, fontWeight: '700', marginBottom: 16 }}>
            Erreur au démarrage · Startup error
          </Text>
          <Text style={{ color: '#fff', fontSize: 14, marginBottom: 12 }}>
            {this.state.error.message}
          </Text>
          <Text style={{ color: '#aaa', fontSize: 11 }}>{this.state.error.stack}</Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}
