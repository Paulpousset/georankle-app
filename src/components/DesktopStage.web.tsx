/**
 * Met le jeu en scène sur les grands écrans web : une colonne centrée, bornée
 * en largeur, sur un fond qui occupe le reste de la fenêtre.
 *
 * Deux raisons, dans cet ordre :
 *  1. Un jeu conçu pour le téléphone étiré sur 1600 px est illisible — les
 *     lignes de menu traversent tout l'écran.
 *  2. Les gouttières ainsi dégagées sont l'espace où les rails publicitaires
 *     peuvent enfin s'afficher. Avant cette mise en scène, SideRailAds était
 *     rendu mais intégralement recouvert par le jeu plein écran : zéro
 *     impression possible.
 *
 * Sous STAGE_MAX_WIDTH, le composant s'efface complètement (pas de View en
 * plus dans l'arbre) : le comportement mobile est strictement inchangé.
 */
import type { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { useTheme } from '../contexts/ThemeContext';
import { STAGE_MAX_WIDTH, StageWidthContext } from '../lib/stage';

export function DesktopStage({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();

  if (width <= STAGE_MAX_WIDTH) return <>{children}</>;

  return (
    <View style={{ flex: 1, alignItems: 'center', backgroundColor: colors.background }}>
      <View
        style={{
          flex: 1,
          width: STAGE_MAX_WIDTH,
          // Le jeu se dessine jusqu'aux bords de la colonne et pas au-delà.
          overflow: 'hidden',
        }}
      >
        <StageWidthContext.Provider value={STAGE_MAX_WIDTH}>
          {children}
        </StageWidthContext.Provider>
      </View>
    </View>
  );
}
