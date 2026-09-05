/**
 * « Revanche » — relancer le même duel depuis l'écran de fin de match.
 *
 * Le seul bouton de cet écran était « Retour au menu » : rejouer contre la même
 * personne imposait de ressortir, rouvrir les amis, réinviter, et refixer mode
 * et best-of.
 *
 * C'est un ACCORD MUTUEL, pas une invitation : le bouton dit simplement où en
 * est l'autre. Un clic pose l'intention (RPC `request_rematch`) ; chez
 * l'adversaire le bouton passe à « Accepter la revanche » ; au second clic la
 * partie naît déjà en cours et les deux y sont envoyés d'un coup — plus aucune
 * modale « Nouveau défi ! » ne s'intercale, elle ne se déclenchait que pour un
 * match en status 'waiting', ce que la revanche ne crée plus.
 *
 * Autonome : il porte son état et sa voie realtime (UPDATE sur la ligne du
 * match joué, qui porte les trois colonnes `rematch_*`). Un sondage de secours
 * couvre la perte de la voie realtime, et quitter l'écran retire l'intention
 * pour ne pas laisser l'autre devant une attente morte.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Swords, X } from 'lucide-react-native';

import type { Match } from '../types';
import { supabase } from '../lib/supabase';
import { cancelRematch, fetchMatch, fetchRematchState, requestRematch } from '../lib/rematch';
import { track } from '../lib/analytics';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { a11yButton, a11yHidden, announce } from '../lib/a11y';
import { tr } from '../i18n';
import { useToast } from './ToastProvider';

/** Filet quand la voie realtime tombe : l'attente serait sinon sans issue. */
const POLL_MS = 4000;

interface RematchPanelProps {
  match: Match;
  currentUserId: string;
  /** Pseudo de l'adversaire, pour les messages d'attente. */
  opponentName?: string | null;
  /** Les deux ont accepté : la nouvelle partie démarre. */
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

  // Qui a demandé la revanche : personne, moi, ou l'adversaire.
  const [requestedBy, setRequestedBy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // La partie est trouvée : on ne cherche plus, et on n'annule plus au démontage.
  const startedRef = useRef(false);
  const [starting, setStarting] = useState(false);
  // Un sondage parti avant notre propre clic peut revenir après lui, avec un
  // état périmé qui effacerait la demande à peine posée. On date les écritures
  // locales et on jette toute lecture plus ancienne.
  const localWriteAtRef = useRef(0);

  const mine = requestedBy === currentUserId;
  const theirs = requestedBy !== null && requestedBy !== currentUserId;
  const name = opponentName || tr(language, "l'adversaire", 'your opponent');

  // Rejoindre la revanche : une seule fois, quelle que soit la voie qui
  // l'annonce (réponse de la RPC, realtime, ou sondage).
  const enter = async (matchId: string) => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarting(true);
    announce(tr(language, 'Revanche acceptée, la partie commence', 'Rematch accepted, match starting'));
    const full = await fetchMatch(matchId);
    if (!full) {
      startedRef.current = false;
      setStarting(false);
      toast.error(tr(language, 'Impossible de rejoindre la revanche.', 'Could not join the rematch.'));
      return;
    }
    onStartMatch(full);
  };

  // État d'entrée + realtime + sondage de secours. `enter`/`toast` changent
  // d'identité à chaque rendu du parent ; les suivre réabonnerait en boucle.
  useEffect(() => {
    let alive = true;

    const sync = async () => {
      const startedAt = Date.now();
      const state = await fetchRematchState(match.id);
      if (!alive || !state || startedRef.current) return;
      if (startedAt < localWriteAtRef.current) return;
      if (state.startedMatchId) {
        void enter(state.startedMatchId);
        return;
      }
      setRequestedBy(state.requestedBy);
    };

    void sync();
    const poll = setInterval(sync, POLL_MS);

    const channel = supabase
      .channel(`rematch_${match.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${match.id}` },
        (payload: { new: Match }) => {
          if (!alive || startedRef.current) return;
          const row = payload.new;
          if (row.rematch_match_id) {
            void enter(row.rematch_match_id);
            return;
          }
          setRequestedBy(row.rematch_requested_by ?? null);
        },
      )
      .subscribe();

    return () => {
      alive = false;
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id, currentUserId, language]);

  // Quitter l'écran pendant qu'on attend ne doit pas laisser l'adversaire
  // devant une demande qui n'attend plus personne.
  useEffect(
    () => () => {
      if (mine && !startedRef.current) void cancelRematch(match.id);
    },
    [mine, match.id],
  );

  // Demander ET accepter, c'est le même appel : la RPC crée la partie dès que
  // les deux intentions sont là.
  const press = async () => {
    if (busy || starting) return;
    setBusy(true);
    track('rematch_requested', { mode: match.game_mode });
    const result = await requestRematch(match);
    setBusy(false);
    if (result.error) {
      toast.error(tr(language, 'Impossible de lancer la revanche.', 'Could not start the rematch.'));
      return;
    }
    if (result.state === 'started' && result.matchId) {
      void enter(result.matchId);
      return;
    }
    localWriteAtRef.current = Date.now();
    setRequestedBy(currentUserId);
    announce(tr(language, 'Revanche demandée', 'Rematch requested'));
  };

  const cancel = async () => {
    if (starting) return;
    localWriteAtRef.current = Date.now();
    setRequestedBy(null);
    await cancelRematch(match.id);
    // Un sondage parti pendant l'appel lirait encore notre demande : on redate
    // pour qu'il soit jeté lui aussi.
    localWriteAtRef.current = Date.now();
  };

  const boxStyle = {
    width: '100%' as const,
    maxWidth: 400,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  };

  // La partie est là : les deux clients basculent, l'écran ne sert plus qu'à
  // couvrir le temps du chargement.
  if (starting) {
    return (
      <View style={[boxStyle, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border }]}>
        <ActivityIndicator size="small" color={c.accent} />
        <Text style={{ flex: 1, color: c.text, fontFamily: FONTS.mono, fontSize: 13 }}>
          {tr(language, 'La revanche commence…', 'The rematch is starting…')}
        </Text>
      </View>
    );
  }

  // J'ai demandé : l'adversaire n'a pas encore répondu.
  if (mine) {
    return (
      <View style={[boxStyle, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border }]}>
        <ActivityIndicator size="small" color={c.accent} />
        <Text style={{ flex: 1, color: c.text, fontFamily: FONTS.mono, fontSize: 13 }}>
          {tr(language, 'En attente de {0}…', 'Waiting for {0}…', [name])}
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

  // L'adversaire a demandé : le bouton devient l'acceptation, et le dit.
  return (
    <View style={{ width: '100%', maxWidth: 400, gap: 6 }}>
      {theirs && (
        <Text
          style={{
            color: c.accent,
            fontFamily: FONTS.monoBold,
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          {tr(language, '{0} veut la revanche !', '{0} wants a rematch!', [name])}
        </Text>
      )}
      <TouchableOpacity
        onPress={press}
        disabled={busy}
        activeOpacity={0.85}
        {...a11yButton(
          theirs
            ? tr(language, 'Accepter la revanche', 'Accept the rematch')
            : tr(language, 'Demander une revanche', 'Ask for a rematch'),
          { disabled: busy },
        )}
        style={{
          width: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          backgroundColor: c.accentStrong,
          borderRadius: 14,
          paddingVertical: 16,
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Swords color="#fff" size={20} {...a11yHidden} />
        )}
        <Text style={{ color: '#fff', fontFamily: FONTS.monoBold, fontSize: 16 }}>
          {theirs
            ? tr(language, 'Accepter la revanche', 'Accept the rematch')
            : tr(language, 'Revanche', 'Rematch')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
