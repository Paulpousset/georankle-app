/**
 * Carte « Je te préviens pour le défi de demain ? » en fin de défi du jour.
 *
 * Remplace la demande de permission à froid au lancement (voir
 * src/lib/notifPrimer.ts pour la politique). La boîte de dialogue système ne
 * s'ouvre que sur « Oui » ; « Plus tard » laisse la permission intacte, donc
 * on pourra reproposer après quelques jours.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Bell } from 'lucide-react-native';

import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { a11yButton, a11yHidden } from '../lib/a11y';
import { track } from '../lib/analytics';
import { getNotificationPermission, requestNotificationsFromTap } from '../lib/notifications';
import { afterDismiss, shouldShowPrimer, type PrimerState } from '../lib/notifPrimer';
import { tr } from '../i18n';

const KEY = 'notif:primer_v1';

async function readState(): Promise<PrimerState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PrimerState) : null;
  } catch {
    return null;
  }
}

async function writeState(state: PrimerState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* best-effort */
  }
}

export function NotificationPrimer(): React.ReactElement | null {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const { user } = useAuth();
  const c = getColors(isDarkMode);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [permission, state] = await Promise.all([getNotificationPermission(), readState()]);
      if (alive && shouldShowPrimer(permission, state, new Date())) {
        setVisible(true);
        track('notif_primer_shown', { dismissals: state?.dismissals ?? 0 });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!visible) return null;

  const onYes = async () => {
    setVisible(false);
    const granted = await requestNotificationsFromTap(language, user?.id ?? null);
    track('notif_primer_answered', { answer: 'yes', granted });
  };

  const onLater = async () => {
    setVisible(false);
    await writeState(afterDismiss(await readState(), new Date()));
    track('notif_primer_answered', { answer: 'later', granted: false });
  };

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={styles.row}>
        <Bell color={c.accent} size={20} {...a11yHidden} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.text }]}>
            {tr(language, 'Je te préviens pour le défi de demain ?', 'Want a heads-up for tomorrow’s challenge?')}
          </Text>
          <Text style={[styles.sub, { color: c.textMuted }]}>
            {tr(
              language,
              'Un rappel par jour, et un seul si ta série est en danger.',
              'One reminder a day, and one more only if your streak is at risk.',
            )}
          </Text>
        </View>
      </View>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={onLater}
          style={[styles.btn, { borderColor: c.border }]}
          {...a11yButton(tr(language, 'Plus tard', 'Later'))}
        >
          <Text style={[styles.btnText, { color: c.textMuted }]}>{tr(language, 'Plus tard', 'Later')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onYes}
          style={[styles.btn, { backgroundColor: c.accent, borderColor: c.accent }]}
          {...a11yButton(tr(language, 'Oui, préviens-moi', 'Yes, remind me'))}
        >
          <Text style={[styles.btnText, { color: '#fff' }]}>{tr(language, 'Oui, préviens-moi', 'Yes, remind me')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
    alignSelf: 'stretch',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: FONTS.heading, fontSize: 13.5 },
  sub: { fontFamily: FONTS.mono, fontSize: 11, marginTop: 1 },
  btn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  btnText: { fontFamily: FONTS.monoBold, fontSize: 12.5 },
});
