/**
 * Le socle des animations de fin de partie.
 *
 * Trois choses vivaient en double (StoryMap, GuessCountryGame) et manquaient
 * partout ailleurs : le garde-fou « pas de pilote natif sur le web », la sonde
 * « réduire les animations » du téléphone, et surtout un TEMPO commun. Toutes
 * les fins de partie (solo, histoire, quotidien, duel, mêlée) suivent la même
 * partition pour que le jeu ait une signature :
 *
 *   0 – 0,7 s   le globe entre (chute + rebond, ou duel)
 *   0,7 – 1,5 s le verdict : score compté, étoiles, VICTOIRE
 *   1,5 – 2,2 s le détail : récap, orbite, ELO
 *   2,2 – 2,9 s la récompense, puis les actions
 *
 * « Réduire les animations » activé = état final direct, sans particules.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/** react-native-web n'a pas de module animé natif — on le tait. */
export const NATIVE_ANIM = Platform.OS !== 'web';

/** Les temps (ms) de la partition commune, depuis l'affichage de l'écran. */
export const END_CHOREO = {
  globe: 0,
  /** Le globe touche le sol (fin du rebond) : score, titre, haptique. */
  verdict: 700,
  /** Récap, orbite, ELO. */
  detail: 1500,
  /** Pièces + doubleur. */
  reward: 2200,
  /** Boutons. */
  actions: 2600,
} as const;

let reduceMotionCache: boolean | null = null;
let reduceMotionProbe: Promise<boolean> | null = null;

/** Sonde unique, mise en cache pour la vie de l'app (comme StoryMap le faisait). */
export function probeReducedMotion(): Promise<boolean> {
  if (reduceMotionCache != null) return Promise.resolve(reduceMotionCache);
  if (!reduceMotionProbe) {
    reduceMotionProbe = AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        reduceMotionCache = v;
        return v;
      })
      .catch(() => false);
  }
  return reduceMotionProbe;
}

/** Valeur connue tout de suite (false tant que la sonde n'a pas répondu). */
export function reducedMotionNow(): boolean {
  return reduceMotionCache ?? false;
}

/** Test : force la valeur (et évite la sonde). */
export function __setReducedMotionForTests(value: boolean | null): void {
  reduceMotionCache = value;
  reduceMotionProbe = null;
}

/** « Réduire les animations » du téléphone, partagé par toutes les animations. */
export function useReducedMotion(): boolean {
  const [rm, setRm] = useState(reduceMotionCache ?? false);
  useEffect(() => {
    if (reduceMotionCache != null) return;
    let alive = true;
    probeReducedMotion().then((v) => {
      if (alive) setRm(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return rm;
}

/** Générateur [0,1) déterministe — les particules doivent être stables entre rendus. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
