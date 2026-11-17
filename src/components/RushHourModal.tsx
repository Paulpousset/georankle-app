/**
 * Fenêtre « Duel 20h » : explique l'heure de pointe (pièces doublées en duel
 * chaque soir pendant une heure) et mène à l'onglet Duel.
 */
import { useEffect, useState } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { Swords, X } from 'lucide-react-native';

import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton } from '../lib/a11y';
import {
  isRushHour,
  msLeftInRush,
  nextRushStart,
  rushLocalEndHour,
  rushLocalHour,
} from '../lib/rush';

export const RUSH_GREEN = '#24753f';

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onGoDuel: () => void;
}

export function RushHourModal({ visible, onClose, onGoDuel }: Props) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [visible]);

  const live = isRushHour(now);
  const start = rushLocalHour(now, language);
  const end = rushLocalEndHour(now, language);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.75)',
          padding: 20,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 380,
            backgroundColor: c.card,
            borderRadius: 24,
            padding: 22,
            borderWidth: 2,
            borderColor: RUSH_GREEN,
            gap: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Swords color={RUSH_GREEN} size={26} />
            <Text style={{ flex: 1, fontFamily: FONTS.headingBlack, fontSize: 22, color: c.text }}>
              {tr(language, 'Duel de {0}', '{0} Duel', [start])}
            </Text>
            <TouchableOpacity onPress={onClose} {...a11yButton(tr(language, 'Fermer', 'Close'))}>
              <X color={c.textMuted} size={22} />
            </TouchableOpacity>
          </View>
          <View
            style={{
              borderRadius: 16,
              padding: 16,
              backgroundColor: RUSH_GREEN,
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Text
              style={{
                fontFamily: FONTS.monoBold,
                fontSize: 11,
                color: 'rgba(255,255,255,0.85)',
                letterSpacing: 1.2,
              }}
            >
              {live
                ? tr(language, 'EN COURS · FIN DANS', 'LIVE · ENDS IN')
                : tr(language, 'PROCHAINE SESSION DANS', 'NEXT SESSION IN')}
            </Text>
            <Text style={{ fontFamily: FONTS.headingBlack, fontSize: 32, color: '#fff' }}>
              {clock(live ? msLeftInRush(now) : nextRushStart(now).getTime() - now.getTime())}
            </Text>
          </View>
          <Text style={{ fontFamily: FONTS.mono, fontSize: 12.5, color: c.text, lineHeight: 19 }}>
            {tr(
              language,
              'Chaque soir de {0} à {1}, tous les duels en ligne rapportent leurs pièces en double : +20 par victoire, +8 par défaite. Tout le monde joue à la même heure, donc tu trouves un adversaire en quelques secondes.',
              'Every evening from {0} to {1}, every online duel pays double coins: +20 per win, +8 per loss. Everyone plays at the same time, so you find an opponent in seconds.',
              [start, end],
            )}
          </Text>
          <TouchableOpacity
            onPress={onGoDuel}
            style={{
              height: 50,
              borderRadius: 25,
              backgroundColor: live ? RUSH_GREEN : 'transparent',
              borderWidth: live ? 0 : 1.5,
              borderColor: RUSH_GREEN,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            {...a11yButton(tr(language, 'Aller au Duel', 'Go to Duel'))}
          >
            <Text
              style={{ fontFamily: FONTS.monoBold, fontSize: 15, color: live ? '#fff' : c.text }}
            >
              {live
                ? tr(language, 'Lancer un duel', 'Start a duel')
                : tr(language, 'Aller au Duel', 'Go to Duel')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
