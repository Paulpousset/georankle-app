/**
 * Quand proposer le parrainage hors de l'écran Amis.
 *
 * Constat (ANALYTICS_FUNNELS.md) : `referral_shared` a été émis UNE fois depuis
 * le lancement. La boucle n'est pas cassée, elle est invisible : la seule
 * entrée est une carte au fond de l'écran Amis. On la propose désormais sur
 * l'écran de fin de partie — le moment où le joueur vient de gagner quelque
 * chose et a la main libre — mais avec parcimonie : pas avant la 3e partie
 * terminée, et au plus une fois par semaine. Une relance qui revient à chaque
 * partie devient du bruit et se fait ignorer.
 *
 * La politique est pure et testée ; la persistance vit dans le composant.
 */

/** Ne rien proposer avant que le joueur ait fini autant de parties. */
export const MIN_GAMES_BEFORE_NUDGE = 3;
/** Jours minimum entre deux propositions sur un même appareil. */
export const NUDGE_COOLDOWN_DAYS = 7;

const DAY_MS = 86_400_000;

export interface NudgeState {
  /** Parties terminées sur cet appareil (toutes surfaces). */
  games: number;
  /** ISO de la dernière proposition affichée, ou null. */
  lastShownAt: string | null;
}

export const EMPTY_NUDGE_STATE: NudgeState = { games: 0, lastShownAt: null };

/** Faut-il afficher la relance maintenant, sachant qu'une partie vient de finir ? */
export function shouldShowReferralNudge(state: NudgeState | null, now: Date): boolean {
  const s = state ?? EMPTY_NUDGE_STATE;
  if (s.games < MIN_GAMES_BEFORE_NUDGE) return false;
  if (!s.lastShownAt) return true;
  const since = now.getTime() - new Date(s.lastShownAt).getTime();
  return !(since >= 0 && since < NUDGE_COOLDOWN_DAYS * DAY_MS);
}

/** L'état après une partie terminée (compteur incrémenté). */
export function afterGame(state: NudgeState | null): NudgeState {
  const s = state ?? EMPTY_NUDGE_STATE;
  return { ...s, games: s.games + 1 };
}

/** L'état après une proposition affichée. */
export function afterShown(state: NudgeState | null, now: Date): NudgeState {
  const s = state ?? EMPTY_NUDGE_STATE;
  return { ...s, lastShownAt: now.toISOString() };
}
