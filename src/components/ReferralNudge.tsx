/**
 * Relance parrainage en fin de partie — la moitié « invite → gagne » de la
 * boucle virale, mise là où le joueur passe vraiment (voir
 * src/lib/referralNudge.ts pour la politique : pas avant 3 parties, au plus
 * une fois par semaine).
 *
 * Elle ne s'affiche que connecté (il faut un code) et disparaît d'elle-même
 * quand la politique dit non. Le partage ouvre la feuille dans le tick du tap,
 * comme partout (activation utilisateur du web mobile).
 */
import React, { useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Gift } from 'lucide-react-native';

import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { a11yButton, a11yHidden } from '../lib/a11y';
import { showAlert } from '../lib/alert';
import { track } from '../lib/analytics';
import { myReferralLink } from '../lib/referral';
import { getCachedReferralCode } from '../lib/shareDaily';
import {
  afterGame,
  afterShown,
  shouldShowReferralNudge,
  type NudgeState,
} from '../lib/referralNudge';
import { tr } from '../i18n';

const KEY = 'referral:nudge_v1';

async function readState(): Promise<NudgeState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as NudgeState) : null;
  } catch {
    return null;
  }
}

async function writeState(state: NudgeState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* best-effort */
  }
}

interface Props {
  /** D'où vient l'affichage — propriété `source` de `referral_shared`. */
  source: 'end_of_game' | 'daily_end';
}

export function ReferralNudge({ source }: Props): React.ReactElement | null {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const [code, setCode] = useState<string | null>(null);

  // Une partie vient de finir : on compte, puis on décide. Mount-once.
  useEffect(() => {
    let alive = true;
    (async () => {
      const counted = afterGame(await readState());
      const now = new Date();
      const refCode = getCachedReferralCode();
      if (refCode && shouldShowReferralNudge(counted, now)) {
        await writeState(afterShown(counted, now));
        if (alive) setCode(refCode);
      } else {
        await writeState(counted);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!code) return null;

  const onShare = () => {
    track('referral_shared', { source });
    const link = myReferralLink(code, language);
    const message = tr(
      language,
      'Rejoins-moi sur GeoG 🌍 — on gagne tous les deux 50 pièces : {0}',
      'Join me on GeoG 🌍 — we both earn 50 coins: {0}',
      [link],
    );
    Share.share({ message }).catch(async () => {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(message);
          showAlert(
            tr(language, 'Lien copié', 'Link copied'),
            tr(language, 'Colle-le à un ami : vous gagnez chacun 50 pièces.', 'Paste it to a friend: you both earn 50 coins.'),
          );
        } catch {
          /* nothing else to try */
        }
      }
    });
  };

  return (
    <TouchableOpacity
      onPress={onShare}
      activeOpacity={0.85}
      style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
      {...a11yButton(tr(language, 'Inviter un ami', 'Invite a friend'))}
    >
      <Gift color={c.accent} size={20} {...a11yHidden} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: c.text }]}>
          {tr(language, 'Invite un ami : 50 pièces chacun', 'Invite a friend: 50 coins each')}
        </Text>
        <Text style={[styles.sub, { color: c.textMuted }]}>
          {tr(language, 'Ton lien de parrainage est prêt.', 'Your referral link is ready.')}
        </Text>
      </View>
      <Text style={[styles.cta, { color: c.accent }]}>{tr(language, 'Partager', 'Share')}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignSelf: 'stretch',
  },
  title: { fontFamily: FONTS.heading, fontSize: 13.5 },
  sub: { fontFamily: FONTS.mono, fontSize: 11, marginTop: 1 },
  cta: { fontFamily: FONTS.monoBold, fontSize: 12.5 },
});
