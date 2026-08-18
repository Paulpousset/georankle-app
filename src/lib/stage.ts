/**
 * Largeur de la « scène » — la colonne dans laquelle le jeu est réellement
 * rendu.
 *
 * Sur mobile et sur natif, scène = fenêtre : rien ne change. Sur le web en
 * grand écran, DesktopStage borne le jeu à une colonne centrée (voir
 * DesktopStage.web.tsx), ce qui dégage les gouttières où vivent les rails
 * publicitaires — et accessoirement évite des lignes de menu étirées sur
 * 1600 px.
 *
 * Tout écran qui se dimensionne à la largeur disponible doit donc lire
 * `useStageWidth()` et NON `useWindowDimensions().width` : sans quoi il se
 * calerait sur la fenêtre entière et déborderait de la colonne.
 *
 * L'exception légitime, ce sont les surfaces qui se positionnent en
 * coordonnées écran (le tutoriel d'accueil, qui mesure via `measureInWindow`
 * et se dessine par-dessus tout) : celles-là veulent bien la fenêtre.
 */
import { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * Largeur maximale de la colonne de jeu sur le web en grand écran. 900 px :
 * assez large pour le globe et les grilles à deux colonnes, assez étroit pour
 * dégager 2 × 220 px de gouttière dès 1340 px de fenêtre — le seuil du premier
 * rail publicitaire. railSize() (lib/adsWeb.ts) dérive ses seuils de cette
 * valeur : les deux doivent rester cohérents.
 */
export const STAGE_MAX_WIDTH = 900;

/** null = pas de mise en scène, la fenêtre fait office de scène. */
export const StageWidthContext = createContext<number | null>(null);

/** Largeur utile pour dimensionner du contenu de jeu. */
export function useStageWidth(): number {
  const staged = useContext(StageWidthContext);
  const { width } = useWindowDimensions();
  return staged ?? width;
}

/**
 * L'habillage de la scène : la barre de marque en haut de la fenêtre et les
 * marges qui font flotter la colonne de jeu comme une carte.
 */
export interface StageChrome {
  /** Hauteur de la barre de marque. 0 = pas de barre du tout. */
  barHeight: number;
  /** Marge verticale entre la carte de jeu et le bord de la fenêtre. */
  gapV: number;
  /** Rayon des coins de la carte. 0 quand elle touche les bords. */
  radius: number;
}

/**
 * Hauteur, en unités, qu'on garde au jeu lui-même quoi qu'il arrive.
 *
 * Ce n'est PAS `UI_SCALE_MIN_HEIGHT` (640) : celui-là sert à borner le zoom
 * pour que l'app ne descende jamais sous une taille de téléphone, pas à dire
 * ce dont un écran de jeu a besoin. Les écrans, eux, sont élastiques — entête,
 * énoncé et barre de validation font ~215 unités et le globe prend le reste —
 * donc 600 les laisse tous confortables (un iPhone SE en offre 667, entête
 * système compris). L'habillage se sert dans ce qui dépasse, et disparaît
 * quand il n'y a plus rien à prendre.
 */
export const STAGE_MIN_GAME_HEIGHT = 600;

/**
 * Combien d'habillage la fenêtre peut se payer, en unités de mise en page.
 * Pure — testée unitairement.
 *
 * ⚠️ La barre ne doit jamais recouvrir un rail publicitaire. Un rail fait 600
 * unités de haut, est centré verticalement et n'existe qu'à partir de 660
 * unités de fenêtre (railSize, lib/adsWeb.ts) : son bord haut tombe donc à
 * (hauteur − 600) / 2. C'est ce qui fixe les deux seuils — 30 unités de barre
 * exigent 660 de fenêtre, 44 en exigent 688 — et pas seulement la place
 * disponible. Ne pas gonfler ces hauteurs sans refaire ce calcul.
 */
export function stageChrome(viewportHeight: number): StageChrome {
  const spare = viewportHeight - STAGE_MIN_GAME_HEIGHT;
  if (spare >= 88) return { barHeight: 44, gapV: 16, radius: 20 };
  if (spare >= 46) return { barHeight: 30, gapV: 8, radius: 14 };
  return { barHeight: 0, gapV: 0, radius: 0 };
}
