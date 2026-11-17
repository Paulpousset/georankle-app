/**
 * Fin de défi du jour › « Défier un ami sur ce défi ».
 *
 * Le défi du jour est déjà la même grille pour tout le monde : on en fait un
 * défi entre amis (même mode, même graine, même date), jouable même après
 * minuit. Deux temps, parce que la feuille de partage doit s'ouvrir dans le
 * tick du tap : 1) créer le défi, 2) « Envoyer ». Connecté seulement (il faut
 * un nom à afficher chez l'ami) ; les invités gardent le partage habituel.
 */
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Send, Swords } from 'lucide-react-native';

import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { a11yButton, a11yHidden } from '../lib/a11y';
import { seedFor, type DailyResult } from '../lib/daily';
import { createFriendChallenge, shareChallenge } from '../lib/friendChallenge';
import { useToast } from './ToastProvider';
import { tr } from '../i18n';

export function ChallengeFromDaily({ result }: { result: DailyResult }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { isDarkMode } = useTheme();
  const c = getColors(isDarkMode);
  const toast = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const create = async () => {
    if (busy) return;
    setBusy(true);
    const made = await createFriendChallenge({
      mode: result.mode,
      seed: seedFor(result.date, result.mode),
      date: result.date,
      score: result.score,
    });
    setBusy(false);
    if (made) setCode(made);
    else
      toast.error(
        tr(
          language,
          'Impossible de créer le défi, réessaie.',
          'Could not create the challenge, try again.',
        ),
      );
  };

  const send = () => {
    if (!code) return;
    shareChallenge(result.mode, result.score, code, language, () =>
      toast.success(tr(language, 'Lien copié !', 'Link copied!')),
    ).catch(() => {});
  };

  const label = code
    ? tr(language, 'Envoyer le défi à un ami', 'Send the challenge to a friend')
    : busy
      ? tr(language, 'Création du défi…', 'Creating the challenge…')
      : tr(language, 'Défier un ami sur ce défi', 'Challenge a friend on this one');
  const Icon = code ? Send : Swords;

  return (
    <TouchableOpacity
      onPress={code ? send : create}
      disabled={busy}
      style={[styles.card, { borderColor: c.accent, backgroundColor: c.card }]}
      {...a11yButton(label)}
    >
      <Icon color={c.accent} size={18} {...a11yHidden} />
      <Text style={[styles.text, { color: c.accent }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 11,
    alignSelf: 'stretch',
  },
  text: { fontFamily: FONTS.monoBold, fontSize: 13 },
});
