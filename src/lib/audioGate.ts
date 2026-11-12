/**
 * Coupures temporaires du son, indépendantes du réglage du joueur (jamais
 * persistées) : une pub plein écran en cours, ou un portail de jeux qui
 * demande le silence (réglage « muteAudio » de CrazyGames, prioritaire sur le
 * nôtre). Le son ne revient que lorsque plus aucune raison ne tient.
 *
 * Module sans dépendance, à part de sfx.ts : les modules de pub (adsWeb,
 * portal) l'importent sans tirer expo-audio dans leurs tests.
 */
const suppressions = new Set<string>();

/** Coupe (`on = true`) ou rend le son pour une raison donnée. */
export function setSfxSuppressed(reason: string, on: boolean): void {
  if (on) suppressions.add(reason);
  else suppressions.delete(reason);
}

/** Une raison de silence tient-elle en ce moment ? */
export function isSfxSuppressed(): boolean {
  return suppressions.size > 0;
}

/** Remet le module à zéro entre deux tests. */
export function __resetAudioGateForTests(): void {
  suppressions.clear();
}
