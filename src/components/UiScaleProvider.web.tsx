/**
 * Agrandit l'app entière sur les grands écrans web (voir lib/uiScale.ts pour le
 * raisonnement) et publie le facteur au reste de l'arbre.
 *
 * Le zoom est posé sur `<body>` — pas sur un composant, ni même sur `#root` —
 * pour qu'il attrape TOUT : les écrans, mais aussi les modales, que
 * react-native-web sort de `#root` par un portail vers `document.body`. Une
 * modale restée hors du zoom aurait l'air minuscule à côté de l'app agrandie.
 */
import { useLayoutEffect, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';

import { UiScaleContext, computeUiScale } from '../lib/uiScale';

/** `zoom` est standardisé mais récent côté Firefox : sans lui, on ne fait rien. */
function zoomSupported(): boolean {
  try {
    return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('zoom', '1.5');
  } catch {
    return false;
  }
}

function applyBodyZoom(scale: number): void {
  const body = typeof document === 'undefined' ? null : document.body;
  if (!body) return;
  // Rien d'autre à corriger : sous `zoom`, les pourcentages se résolvent dans
  // l'espace de l'élément zoomé, donc les `height: 100%` de la feuille de style
  // d'Expo continuent de valoir exactement la fenêtre (vérifié dans Chrome).
  if (scale === 1) body.style.removeProperty('zoom');
  else body.style.setProperty('zoom', String(scale));
}

export function UiScaleProvider({ children }: { children: ReactNode }) {
  // La fenêtre en px CSS : le zoom du body ne la change pas, donc pas de
  // boucle de rétroaction entre le facteur et la mesure qui le calcule.
  const { width, height } = useWindowDimensions();
  const scale = zoomSupported() ? computeUiScale(width, height) : 1;

  // Avant peinture : on évite le clignotement « app petite puis agrandie ».
  useLayoutEffect(() => {
    applyBodyZoom(scale);
  }, [scale]);

  return <UiScaleContext.Provider value={scale}>{children}</UiScaleContext.Provider>;
}
