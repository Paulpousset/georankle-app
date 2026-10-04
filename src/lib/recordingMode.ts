/**
 * Mode tournage — build dédié aux vidéos réseaux sociaux (profil EAS
 * `recording`, voir social-video/README.md).
 *
 * Activé UNIQUEMENT par `EXPO_PUBLIC_RECORDING_MODE=1`, valeur inlinée au build :
 * les builds store ne la portent jamais, donc rien ici ne peut fuiter chez un
 * joueur. Le canal EAS `recording` ne reçoit pas les mises à jour OTA de
 * production, qui auraient été compilées sans ce drapeau.
 *
 * Ce que le mode change :
 * - aucun tutoriel ni popup « comment jouer » (le plan doit démarrer sur le jeu) ;
 * - aucune pub interstitielle ni demande de note (rien ne doit couvrir l'écran) ;
 * - les réponses portent un testID (`rec-correct` / `rec-wrong`) pour que les
 *   flows Maestro jouent une partie choisie d'avance, sans deviner.
 *
 * PostHog et Sentry sont coupés par l'absence de clés dans ce profil : les
 * parties filmées ne polluent ni les chiffres ni les erreurs.
 */
export const RECORDING_MODE = process.env.EXPO_PUBLIC_RECORDING_MODE === '1';

/**
 * testID d'une réponse pour les flows Maestro, `undefined` hors tournage (le
 * build store ne porte aucun marqueur de la bonne réponse).
 */
export function recAnswerId(correct: boolean): string | undefined {
  if (!RECORDING_MODE) return undefined;
  return correct ? 'rec-correct' : 'rec-wrong';
}
