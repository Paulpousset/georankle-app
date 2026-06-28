/**
 * A thin top bar that surfaces two previously-invisible states:
 *  - offline: "you're offline, progress will sync when you reconnect"
 *  - online but with queued writes: "syncing…"
 *
 * It reads connectivity from NetworkContext and the pending count from the sync
 * queue, so it covers coins/daily writes that failed and are awaiting retry.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CloudOff, RefreshCw } from 'lucide-react-native';

import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { useLanguage } from '../contexts/LanguageContext';
import { useNetwork } from '../contexts/NetworkContext';
import { subscribePending } from '../lib/syncQueue';

export function OfflineBanner() {
  const { isOnline } = useNetwork();
  const { language } = useLanguage();
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState(0);

  useEffect(() => subscribePending(setPending), []);

  const offline = !isOnline;
  const syncing = isOnline && pending > 0;
  if (!offline && !syncing) return null;

  const bg = offline ? '#8b1a1a' : '#b8860b';
  const label = offline
    ? pending > 0
      ? tr(language, 'Hors-ligne — progression non synchronisée', 'Offline — progress not synced')
      : tr(language, 'Hors-ligne', 'Offline')
    : tr(language, 'Synchronisation…', 'Syncing…');

  return (
    <View style={[styles.bar, { backgroundColor: bg, paddingTop: insets.top + 4 }]}>
      {offline ? <CloudOff color="#fff" size={13} /> : <RefreshCw color="#fff" size={13} />}
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 4,
    zIndex: 900,
  },
  text: { color: '#fff', fontSize: 11, fontFamily: FONTS.monoBold, letterSpacing: 0.3 },
});
