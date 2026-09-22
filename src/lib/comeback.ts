/**
 * Bonus de retour après absence.
 *
 * Un joueur qui rouvre l'app après 7 jours ou plus reçoit quelques pièces et
 * une invitation à relancer le défi du jour. Tout est décidé côté serveur
 * (supabase/migrations/20260922_01_comeback.sql) : le client ne fait qu'appeler
 * la RPC et fêter le résultat. Tant que la migration n'est pas en production,
 * la RPC n'existe pas et l'appel échoue silencieusement.
 *
 * ⚠️ À appeler AVANT `touchLastSeen()` : la fonction mesure l'absence sur
 * `profiles.last_seen`, qu'un touch précédent aurait déjà rafraîchi.
 */
import { supabase } from './supabase';
import { track } from './analytics';
import { showAlert } from './alert';
import { readStoredLanguage } from '../contexts/LanguageContext';
import { tr } from '../i18n';

interface ComebackResult {
  granted?: boolean;
  coins?: number;
  days_away?: number;
  reason?: string;
}

let attempted = false;

/** Une tentative par session d'app : le serveur est de toute façon idempotent. */
export function resetComebackAttempt(): void {
  attempted = false;
}

export async function claimComeback(): Promise<ComebackResult | null> {
  if (attempted) return null;
  attempted = true;
  try {
    const { data, error } = await supabase.rpc('claim_comeback');
    if (error || !data) return null;
    const res = data as ComebackResult;
    if (res.granted && res.coins) {
      track('comeback_granted', { coins: res.coins, days_away: res.days_away ?? 0 });
      const language = await readStoredLanguage();
      showAlert(
        tr(language, '👋 Content de te revoir !', '👋 Welcome back!'),
        tr(
          language,
          '{0} pièces offertes pour ton retour. Le défi du jour t’attend 🌍',
          '{0} coins for coming back. Today’s challenge is waiting 🌍',
          [res.coins],
        ),
      );
    }
    return res;
  } catch {
    return null;
  }
}
