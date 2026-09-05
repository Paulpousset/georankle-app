/**
 * Échelle d'interface du web sur écran d'ordinateur.
 *
 * Le jeu est dessiné pour un téléphone : polices de 9 à 17 px, cartes bornées
 * à 400 px, pastilles de 22 px. Rendues telles quelles sur un 27 pouces, ces
 * valeurs paraissent petites — d'où, un temps, un agrandissement global de
 * l'app entière par un `zoom` CSS unique posé sur `<body>` (plutôt que de
 * dupliquer 700 `fontSize` en version « desktop »).
 *
 * ⚠️ Cet agrandissement est DÉSACTIVÉ depuis le 26/08 : `UI_SCALE_MAX` vaut 1,
 * donc `computeUiScale` renvoie toujours 1 et aucun `zoom` n'est posé. Paul
 * trouve le web sur ordi plus beau « dézoomé à 80 % », et 80 % de l'ancien
 * plafond (1,25) fait exactement 1 — sur toutes les tailles de fenêtre, parce
 * que le plafond était atteint dès qu'on dézoomait. Depuis la mise en scène
 * de DesktopStage (fond parchemin, colonne de jeu en carte), l'app n'a plus
 * besoin de grossir pour ne pas avoir l'air perdue au milieu de l'écran : elle
 * est posée sur un décor qui remplit les gouttières.
 *
 * Le mécanisme est conservé entier — c'est la molette à retourner si l'app
 * paraît de nouveau trop petite : remonter `UI_SCALE_MAX` (1,15 / 1,25) et la
 * courbe largeur ÷ `UI_SCALE_BASE_WIDTH` reprend vie telle quelle. Le natif
 * n'est de toute façon jamais concerné (provider inerte).
 *
 * Conséquence importante tant qu'un zoom est en vigueur : les px de mise en
 * page de l'app (les « unités ») ne sont plus les px CSS de la fenêtre.
 * `useWindowDimensions()` renvoie la fenêtre en px CSS, donc TROP GRAND d'un
 * facteur `scale` pour dimensionner du contenu. Il faut lire :
 *   - `useStageWidth()` (lib/stage) pour une largeur de contenu,
 *   - `useViewport()`   ici,        pour la fenêtre en unités de mise en page,
 *   - et diviser par `useUiScale()` toute coordonnée venue du DOM
 *     (`measureInWindow`, qui répond en px CSS, donc zoomés).
 * Ces appels restent justes à l'identique sous facteur 1 : ne pas les
 * démonter, sans quoi remonter la molette recasserait tout.
 */
import { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * Largeur de fenêtre à partir de laquelle l'app serait agrandie. En dessous,
 * on ne touche à rien : c'est le territoire des téléphones, des tablettes et
 * des petits portables, où la mise en page téléphone est déjà à la bonne
 * taille. Le facteur vaut largeur ÷ cette valeur, plafonné.
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
 * LE plafond, et aujourd'hui LA molette : 1 = l'app est rendue 1:1 sur
 * ordinateur, aucun `zoom` n'est posé (voir l'entête). Toute valeur ≤ 1,05
 * revient au même — en dessous, le gain ne vaudrait pas les demi-pixels qu'il
 * sème. Au-delà, l'agrandissement reprend, et il vaut mieux rester bas : sur
 * un 27 pouces, mieux vaut de l'espace autour d'une app à taille normale
 * qu'une app à taille de loupe.
 */
export const UI_SCALE_MAX = 1;

/**
 * Facteur d'agrandissement pour une fenêtre donnée. Pur — testé unitairement.
 *
 * Renvoie exactement 1 (donc aucun zoom posé) tant que le gain resterait
 * imperceptible, et se tronque au pas de 0,05 — par le bas, pour ne jamais
 * dépasser la garantie de hauteur — histoire d'éviter les facteurs à rallonge
 * qui sèment des demi-pixels partout.
 *
 * `max` n'est là que pour que les tests puissent exercer la courbe sans
 * dépendre du réglage du jour : l'app appelle toujours la fonction à deux
 * arguments.
 */
export function computeUiScale(
  windowWidth: number,
  windowHeight: number,
  max: number = UI_SCALE_MAX,
): number {
  const raw = Math.min(
    windowWidth / UI_SCALE_BASE_WIDTH,
    windowHeight / UI_SCALE_MIN_HEIGHT,
    max,
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
 * `useWindowDimensions()` renvoie tant qu'aucun zoom n'est posé. À utiliser
 * dès qu'on dimensionne ou positionne du contenu par rapport à l'écran.
 */
export function useViewport(): { width: number; height: number } {
  const { width, height } = useWindowDimensions();
  const scale = useUiScale();
  return { width: width / scale, height: height / scale };
}
