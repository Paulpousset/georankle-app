/**
 * Garde une callback à identité STABLE tout en appelant toujours la dernière
 * version reçue.
 *
 * Pourquoi ce hook existe. `useMatchEngine` renvoie un objet littéral contenant
 * neuf fonctions redéfinies à chaque rendu (aucun `useCallback` dans ses 745
 * lignes). Cet objet descend jusqu'aux écrans via `Router`. Résultat : toute
 * callback qui figurait dans le tableau de dépendances d'un `useEffect` à
 * minuterie relançait cette minuterie **à chaque rendu du parent** :
 *
 *   - `WaitingOpponent` : le bouton « Quitter » (30 s) pouvait n'apparaître
 *     jamais — précisément le bouton censé débloquer un joueur coincé ;
 *   - `RoundSummary` et `PreGameLobby` : le décompte ne descendait jamais si le
 *     parent se re-rendait plus vite qu'une seconde, donc la manche suivante ne
 *     démarrait pas.
 *
 * Envelopper la callback ici sort son identité des dépendances : la minuterie
 * n'est plus armée qu'une fois, tout en invoquant la version la plus récente.
 *
 * NOTE : ceci traite le symptôme là où il fait mal. La cause racine reste
 * l'objet non mémoïsé de `useMatchEngine` — à mémoïser une fois ce hook couvert
 * par des tests (il est aujourd'hui à 0 %).
 */
import { useCallback, useLayoutEffect, useRef } from 'react';

export function useEventCallback<A extends unknown[], R>(
  fn: ((...args: A) => R) | undefined,
): (...args: A) => R | undefined {
  const ref = useRef(fn);
  // Mise à jour en useLayoutEffect, PAS pendant le rendu : écrire une ref au
  // rendu casse le rendu concurrent (et `react-hooks/refs` le refuse). Le
  // layout effect s'exécute avant toute peinture, donc `ref` porte la dernière
  // version bien avant qu'une minuterie ou un geste ne puisse la lire.
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current?.(...args), []);
}
