import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Marge basse d'une feuille glissée depuis le bas dans une <Modal>.
 *
 * Sur Android, l'app est en « edge-to-edge » (app.json → edgeToEdgeEnabled) :
 * React Native 0.81 dessine alors TOUTES les <Modal> sous la barre de
 * navigation système. Sans cette marge, les derniers boutons d'une feuille
 * passent sous les trois boutons (ou la barre de gestes) et deviennent
 * intouchables. On ajoute donc la hauteur de cette barre à la marge prévue.
 *
 * iOS reste inchangé : la mise en page actuelle y est déjà validée.
 */
export function useSheetBottomPadding(base: number): number {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'android' ? base + insets.bottom : base;
}
