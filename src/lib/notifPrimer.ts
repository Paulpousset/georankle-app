/**
 * Quand proposer les notifications (carte « Je te préviens ? »).
 *
 * Constat (diagnostic du 16/11/2026) : la permission était demandée à froid au
 * lancement. Résultat : 68 joueurs sur 312 (22 %) avec un jeton de push, alors
 * que ceux qui en ont un jouent 8,8 jours en moyenne contre 4,0. On ne demande
 * plus au lancement : on propose après un défi du jour terminé, quand le
 * joueur sait ce qu'on lui rappellera. La boîte de dialogue système ne s'ouvre
 * que s'il répond oui.
 *
 * Politique pure et testée ; la persistance vit dans le composant.
 */

/** Jours minimum entre deux propositions après un « Plus tard ». */
export const PRIMER_COOLDOWN_DAYS = 3;
/** Au-delà de ce nombre de « Plus tard », on n'insiste plus. */
export const PRIMER_MAX_DISMISSALS = 3;

const DAY_MS = 86_400_000;

export interface PrimerState {
  dismissals: number;
  /** ISO du dernier « Plus tard », ou null. */
  lastDismissedAt: string | null;
}

export const EMPTY_PRIMER_STATE: PrimerState = { dismissals: 0, lastDismissedAt: null };

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/** Faut-il afficher la carte maintenant ? */
export function shouldShowPrimer(
  permission: PermissionState,
  state: PrimerState | null,
  now: Date,
): boolean {
  // Déjà accordé, refusé (le système ne redemandera pas) ou web : rien à proposer.
  if (permission !== 'undetermined') return false;
  const s = state ?? EMPTY_PRIMER_STATE;
  if (s.dismissals >= PRIMER_MAX_DISMISSALS) return false;
  if (!s.lastDismissedAt) return true;
  const since = now.getTime() - new Date(s.lastDismissedAt).getTime();
  return !(since >= 0 && since < PRIMER_COOLDOWN_DAYS * DAY_MS);
}

/** L'état après un « Plus tard ». */
export function afterDismiss(state: PrimerState | null, now: Date): PrimerState {
  const s = state ?? EMPTY_PRIMER_STATE;
  return { dismissals: s.dismissals + 1, lastDismissedAt: now.toISOString() };
}
