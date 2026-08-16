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
