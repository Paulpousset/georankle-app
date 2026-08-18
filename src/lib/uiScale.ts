/**
 * Échelle d'interface du web sur écran d'ordinateur.
 *
 * Le jeu est dessiné pour un téléphone : polices de 9 à 17 px, cartes bornées
 * à 400 px, pastilles de 22 px. Rendues telles quelles sur un 27 pouces, ces
 * valeurs sont ridiculement petites — l'app a l'air d'une maquette perdue au
 * milieu de l'écran.
 *
 * Plutôt que de dupliquer 700 `fontSize` en version « desktop », on agrandit
 * l'app entière d'un facteur unique : `UiScaleProvider` (web) pose un
 * `zoom` CSS sur `#root`, et tout le monde grossit dans les mêmes proportions.
 * Le natif n'est pas concerné (provider inerte).
 *
 * Conséquence importante : sous zoom, les px de mise en page de l'app (les
 * « unités ») ne sont plus les px CSS de la fenêtre. `useWindowDimensions()`
 * renvoie la fenêtre en px CSS, donc TROP GRAND d'un facteur `scale` pour
 * dimensionner du contenu. Il faut lire :
 *   - `useStageWidth()` (lib/stage) pour une largeur de contenu,
 *   - `useViewport()`   ici,        pour la fenêtre en unités de mise en page,
 *   - et diviser par `useUiScale()` toute coordonnée venue du DOM
 *     (`measureInWindow`, qui répond en px CSS, donc zoomés).
 */
import { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * Largeur de fenêtre à partir de laquelle l'app est agrandie. En dessous, on
 * ne touche à rien : c'est le territoire des téléphones, des tablettes et des
 * petits portables, où la mise en page téléphone est déjà à la bonne taille.
 *
 * C'est LA molette à tourner si l'app paraît trop petite (baisser) ou trop
 * grosse (monter) sur ordinateur : le facteur vaut largeur ÷ cette valeur. Un
 * premier essai à 1080 donnait 1,30 sur un 1440 — jugé trop gros.
 */
export const UI_SCALE_BASE_WIDTH = 1200;

/**
 * Hauteur minimale, en unités de mise en page, qu'on garantit aux écrans. Les
 * écrans de jeu sont conçus pour un téléphone (~650 px de haut utile) : si on
 * agrandissait sans regarder la hauteur, une fenêtre large mais courte
 * (1600 × 700) se retrouverait avec 440 unités de haut et tronquerait les
 * boutons sous le globe.
 */
export const UI_SCALE_MIN_HEIGHT = 640;

/**
 * Plafond : au-delà, l'app fait « interface pour malvoyants », pas « app ».
 * Volontairement bas — sur un 27 pouces, mieux vaut de l'espace vide autour
 * d'une app à taille normale qu'une app à taille de loupe.
 */
export const UI_SCALE_MAX = 1.25;

/**
 * Facteur d'agrandissement pour une fenêtre donnée. Pur — testé unitairement.
 *
 * Renvoie exactement 1 (donc aucun zoom posé) tant que le gain resterait
 * imperceptible, et se tronque au pas de 0,05 — par le bas, pour ne jamais
 * dépasser la garantie de hauteur — histoire d'éviter les facteurs à rallonge
 * qui sèment des demi-pixels partout.
 */
export function computeUiScale(windowWidth: number, windowHeight: number): number {
  const raw = Math.min(
    windowWidth / UI_SCALE_BASE_WIDTH,
    windowHeight / UI_SCALE_MIN_HEIGHT,
    UI_SCALE_MAX,
  );
  if (!Number.isFinite(raw) || raw <= 1.05) return 1;
  return Math.floor(raw * 20) / 20;
}

/** 1 = pas de mise à l'échelle (natif, web mobile, petites fenêtres). */
export const UiScaleContext = createContext(1);

/** Facteur d'agrandissement en vigueur. */
export function useUiScale(): number {
  return useContext(UiScaleContext);
}

/**
 * La fenêtre exprimée dans les unités de mise en page de l'app — ce que
 * `useWindowDimensions()` renvoyait avant le zoom. À utiliser dès qu'on
 * dimensionne ou positionne du contenu par rapport à l'écran.
 */
export function useViewport(): { width: number; height: number } {
  const { width, height } = useWindowDimensions();
  const scale = useUiScale();
  return { width: width / scale, height: height / scale };
}
