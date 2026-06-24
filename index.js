import 'react-native-url-polyfill/auto';
import { registerRootComponent } from 'expo';
import { ScrollView, Text } from 'react-native';

import { ErrorBoundary } from './src/ErrorBoundary';

// Render a visible error screen instead of a silent white screen when the app
// fails to load on a device build (TestFlight has no Metro red box).
function FatalScreen({ error }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#1a1a1a' }}
      contentContainerStyle={{ padding: 24, paddingTop: 80 }}
    >
      <Text style={{ color: '#ff6b6b', fontSize: 20, fontWeight: '700', marginBottom: 16 }}>
        Erreur fatale au démarrage
      </Text>
      <Text style={{ color: '#fff', fontSize: 14, marginBottom: 12 }}>
        {String(error && error.message ? error.message : error)}
      </Text>
      <Text style={{ color: '#aaa', fontSize: 11 }}>{error && error.stack}</Text>
    </ScrollView>
  );
}

try {
  // Import App lazily so an import-time throw is catchable here.
  const App = require('./App').default;

  function Root() {
    return (
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
  }

  registerRootComponent(Root);
} catch (e) {
  registerRootComponent(() => <FatalScreen error={e} />);
}
