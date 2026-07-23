import { useEffect, useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { Bell, BellRing } from 'lucide-react-native';

import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from './ToastProvider';
import {
  LEAGUE_REMINDER_HOUR,
  disableLeagueReminder,
  enableLeagueReminder,
  isLeagueReminderEnabled,
} from '../lib/notifications';
import { track } from '../lib/analytics';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton } from '../lib/a11y';

/**
 * Prominent opt-in toggle for the league reminder: a repeating local
 * notification every day at 10:00 to play the league's 3 drawn modes. One
 * global reminder for all leagues. Rendered in LeagueHub and LeagueDetail;
 * renders nothing on web (no local scheduled notifications there).
 */
export function LeagueReminderButton() {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const toast = useToast();
  const c = getColors(isDarkMode);

  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    isLeagueReminderEnabled().then(setEnabled);
  }, []);

  if (Platform.OS === 'web' || enabled === null) return null;

  const hour = `${LEAGUE_REMINDER_HOUR}h00`;

  const toggle = async () => {
    if (enabled) {
      await disableLeagueReminder();
      setEnabled(false);
      toast.info(tr(language, 'Rappel de ligue désactivé.', 'League reminder turned off.'));
      return;
    }
    const ok = await enableLeagueReminder(language);
    if (!ok) {
      toast.error(
        tr(
          language,
          'Autorise les notifications dans les réglages pour activer le rappel.',
          'Allow notifications in your settings to enable the reminder.',
        ),
      );
      return;
    }
    setEnabled(true);
    track('league_reminder_set');
    toast.success(
      tr(language, `Rappel activé — tous les jours à ${hour} !`, `Reminder on — every day at ${hour}!`),
    );
  };

  return (
    <TouchableOpacity
      onPress={toggle}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 14,
        borderWidth: enabled ? 1 : 0,
        borderColor: c.border,
        backgroundColor: enabled ? c.surface : c.accent,
      }}
      {...a11yButton(
        enabled
          ? tr(language, `Rappel quotidien activé à ${hour}`, `Daily reminder on at ${hour}`)
          : tr(language, 'Activer les notifications', 'Enable notifications'),
        {
          hint: enabled
            ? tr(language, 'Désactiver le rappel', 'Turn the reminder off')
            : tr(language, `Recevoir un rappel chaque jour à ${hour}`, `Get a reminder every day at ${hour}`),
        },
      )}
    >
      {enabled ? <BellRing color={c.accent} size={20} /> : <Bell color="#fff" size={20} />}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: FONTS.heading,
            fontSize: 14,
            color: enabled ? c.text : '#fff',
          }}
        >
          {enabled
            ? tr(language, `Rappel activé · ${hour}`, `Reminder on · ${hour}`)
            : tr(language, 'Activer les notifs', 'Enable notifications')}
        </Text>
        <Text
          style={{
            fontFamily: FONTS.mono,
            fontSize: 10,
            color: enabled ? c.textFaint : 'rgba(255,255,255,0.85)',
          }}
        >
          {enabled
            ? tr(language, 'Touche pour désactiver', 'Tap to turn off')
            : tr(language, `Chaque jour à ${hour} : joue les 3 défis de ta ligue`, `Every day at ${hour}: play your league's 3 challenges`)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
