/**
 * « Revanche » — relancer le même duel depuis l'écran de fin de match.
 *
 * Le seul bouton de cet écran était « Retour au menu » : rejouer contre la même
 * personne imposait de ressortir, rouvrir les amis, réinviter, et refixer mode
 * et best-of. Ici, un tap recrée la partie (lib/rematch), prévient l'adversaire
 * et attend sa réponse sur place.
 *
 * Autonome : il porte son état d'attente et son abonnement realtime, calqués
 * sur ceux de l'écran Matchmaking (UPDATE sur la ligne du match : in_progress →
 * on démarre, cancelled → l'adversaire a refusé). Démonté en cours d'attente,
 * il annule la ligne pour ne pas laisser d'invitation fantôme.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Swords, X } from 'lucide-react-native';

import type { Match } from '../types';
import { supabase } from '../lib/supabase';
import { createRematch } from '../lib/rematch';
import { track } from '../lib/analytics';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { a11yButton, a11yHidden, announce } from '../lib/a11y';
import { tr } from '../i18n';
import { useToast } from './ToastProvider';

interface RematchPanelProps {
  match: Match;
  currentUserId: string;
  /** Pseudo de l'adversaire, pour le message d'attente. */
  opponentName?: string | null;
  /** L'adversaire a accepté : la nouvelle partie démarre. */
  onStartMatch: (match: Match) => void;
}

export function RematchPanel({
  match,
  currentUserId,
  opponentName,
  onStartMatch,
}: RematchPanelProps) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const toast = useToast();
  const c = getColors(isDarkMode);

  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<Match | null>(null);
  // Une partie démarrée ne doit plus être annulée au démontage.
  const startedRef = useRef(false);

  useEffect(() => {
    if (!pending) return;
    const channel = supabase
      .channel(`rematch_${pending.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${pending.id}` },
        async (payload: { new: Match }) => {
          const next = payload.new;
          if (next.status === 'in_progress') {
            startedRef.current = true;
            announce(tr(language, 'Revanche acceptée, la partie commence', 'Rematch accepted, match starting'));
            const { data: full } = await supabase
              .from('matches')
              .select('*')
              .eq('id', next.id)
              .single();
            onStartMatch((full ?? next) as Match);
          } else if (next.status === 'cancelled') {
            setPending(null);
            toast.info(tr(language, 'Revanche refusée.', 'Rematch declined.'));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // `onStartMatch`/`toast` changent d'identité à chaque rendu du parent ;
    // les suivre réabonnerait la voie realtime en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.id, language]);

  // Quitter l'écran pendant l'attente ne doit pas laisser une invitation en
  // suspens chez l'adversaire.
  useEffect(
    () => () => {
      if (pending && !startedRef.current) {
        void supabase
          .from('matches')
          .update({ status: 'cancelled' })
          .eq('id', pending.id)
          .eq('status', 'waiting');
      }
    },
    [pending],
  );

  const start = async () => {
    if (creating) return;
    setCreating(true);
    track('rematch_requested', { mode: match.game_mode });
    const { match: created, error } = await createRematch(match, currentUserId);
    setCreating(false);
    if (error || !created) {
      toast.error(tr(language, 'Impossible de lancer la revanche.', 'Could not start the rematch.'));
      return;
    }
    setPending(created);
    announce(tr(language, 'Revanche envoyée', 'Rematch sent'));
  };

  const cancel = async () => {
    if (!pending) return;
    const row = pending;
    setPending(null);
    await supabase
      .from('matches')
      .update({ status: 'cancelled' })
      .eq('id', row.id)
      .eq('status', 'waiting');
  };

  const name = opponentName || tr(language, "l'adversaire", 'your opponent');

  if (pending) {
    return (
      <View
        style={{
          width: '100%',
          maxWidth: 400,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 14,
          paddingVertical: 14,
          paddingHorizontal: 16,
        }}
      >
        <ActivityIndicator size="small" color={c.accent} />
        <Text style={{ flex: 1, color: c.text, fontFamily: FONTS.mono, fontSize: 13 }}>
          {tr(language, `En attente de ${name}…`, `Waiting for ${name}…`)}
        </Text>
        <TouchableOpacity
          onPress={cancel}
          {...a11yButton(tr(language, 'Annuler la revanche', 'Cancel the rematch'))}
        >
          <X color={c.textMuted} size={18} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={start}
      disabled={creating}
      activeOpacity={0.85}
      {...a11yButton(tr(language, 'Demander une revanche', 'Ask for a rematch'), { disabled: creating })}
      style={{
        width: '100%',
        maxWidth: 400,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: c.accentStrong,
        borderRadius: 14,
        paddingVertical: 16,
        opacity: creating ? 0.6 : 1,
      }}
    >
      {creating ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Swords color="#fff" size={20} {...a11yHidden} />
      )}
      <Text style={{ color: '#fff', fontFamily: FONTS.monoBold, fontSize: 16 }}>
        {tr(language, 'Revanche', 'Rematch')}
      </Text>
    </TouchableOpacity>
  );
}
