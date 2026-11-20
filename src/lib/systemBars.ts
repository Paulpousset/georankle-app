/**
 * Accorde les barres système d'Android au thème CHOISI dans l'app.
 *
 * Le thème de GeoG se règle dans l'app (et se mémorise), indépendamment de
 * celui du téléphone. Sans ce réglage, Android gardait :
 *   - un fond de fenêtre blanc, visible en mode sombre pendant les transitions
 *     et à l'ouverture du clavier (flash blanc) ;
 *   - des boutons de navigation sombres, invisibles sur la barre d'onglets
 *     sombre (navigation à trois boutons).
 *
 *   - des icônes de barre d'état réglées sur le thème du TÉLÉPHONE dans les
 *     modales plein écran (classements…) : React Native les calcule d'après
 *     le mode nuit Android. `Appearance.setColorScheme` aligne ce mode nuit sur
 *     le thème de l'app (sans redémarrer l'activité : `uiMode` est déclaré
 *     dans configChanges par Expo).
 *
 * `androidNavigationBar.enforceContrast: false` (app.json) retire le voile
 * qu'Android posait derrière ces boutons : c'est la couleur de l'app qui va
 * jusqu'en bas, et `setStyle` choisit des boutons clairs ou sombres.
 *
 * Modules natifs : ils n'existent que dans les binaires ≥ 5.8.0. La
 * runtimeVersion suit `expo.version`, donc aucune mise à jour OTA portant ce
 * code n'atteint un binaire plus ancien. Le try/catch reste un filet.
 */
import { Appearance, Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';

export function applySystemBars(isDarkMode: boolean, background: string): void {
  if (Platform.OS !== 'android') return;
  try {
    Appearance.setColorScheme(isDarkMode ? 'dark' : 'light');
    SystemUI.setBackgroundColorAsync(background).catch(() => {});
    // 'dark' = barre sombre → boutons clairs ; 'light' = l'inverse.
    NavigationBar.setStyle(isDarkMode ? 'dark' : 'light');
  } catch {
    // Binaire sans les modules natifs : on garde l'apparence par défaut.
  }
}
