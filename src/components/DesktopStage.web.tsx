/**
 * Met le jeu en scène sur les grands écrans web : une barre de marque en haut
 * de la fenêtre, et le jeu dans une colonne centrée, bornée en largeur, posée
 * comme une carte sur un fond de carte ancienne.
 *
 * Trois raisons, dans cet ordre :
 *  1. Un jeu conçu pour le téléphone étiré sur 1600 px est illisible — les
 *     lignes de menu traversent tout l'écran.
 *  2. Bornée mais sans habillage, cette colonne était pire que le mal : même
 *     couleur que le fond, donc aucun bord, un entête qui semble coupé au
 *     couteau et le bleu du globe qui s'arrête net au milieu du parchemin. Le
 *     fond assombri + la carte à coins arrondis + la barre de marque font des
 *     gouttières un choix de mise en page au lieu d'un vide.
 *  3. Ces gouttières sont l'espace où les rails publicitaires peuvent enfin
 *     s'afficher. Avant cette mise en scène, SideRailAds était rendu mais
 *     intégralement recouvert par le jeu plein écran : zéro impression possible.
 *
 * Sous STAGE_MAX_WIDTH, le composant s'efface complètement (pas de View en
 * plus dans l'arbre) : le comportement mobile est strictement inchangé. Et sur
 * une fenêtre courte, `stageChrome()` retire l'habillage plutôt que de rogner
 * la hauteur garantie aux écrans de jeu.
 *
 * Le décor est en `<div>` et pas en `View` : c'est un fichier `.web.tsx`, un
 * dégradé radial et une trame de méridiens s'écrivent en une ligne de CSS
 * (aucun `expo-linear-gradient` à embarquer) et ces couches ne servent qu'à
 * peindre. Elles sont hors flux, donc invisibles à la mise en page.
 */
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../contexts/ThemeContext';
import { STAGE_MAX_WIDTH, StageWidthContext, stageChrome } from '../lib/stage';
import { useViewport } from '../lib/uiScale';
import { FONTS } from '../theme/typography';
import { AtlasGlobe } from './AtlasIcons';

/** Le fond des gouttières : un parchemin plus profond que celui de l'app. */
const BACKDROP = {
  light: 'radial-gradient(120% 90% at 50% 0%, #e6d8b9 0%, #d8c8a4 55%, #c9b58c 100%)',
  dark: 'radial-gradient(120% 90% at 50% 0%, #12203a 0%, #0a1628 55%, #050c17 100%)',
} as const;

/**
 * Le décor complet, en une seule propriété : la trame de méridiens (72 unités
 * de pas, à peine visible) posée SUR le parchemin. Les deux en un, parce que
 * `backgroundImage` ne se cumule pas — écrire le dégradé puis la trame dans
 * deux propriétés fait disparaître le dégradé.
 */
function backdrop(isDarkMode: boolean): string {
  const line = isDarkMode ? 'rgba(122,160,196,0.10)' : 'rgba(122,92,56,0.10)';
  return [
    `repeating-linear-gradient(to right, ${line} 0 1px, transparent 1px 72px)`,
    `repeating-linear-gradient(to bottom, ${line} 0 1px, transparent 1px 72px)`,
    isDarkMode ? BACKDROP.dark : BACKDROP.light,
  ].join(', ');
}

export function DesktopStage({
  children,
  /**
   * Ce qui s'affiche à droite de la barre de marque — en pratique le mode en
   * cours. Ne pas passer la prop du tout (le cas des modales, qui ont déjà leur
   * propre entête) supprime la barre : deux entêtes empilés, c'est un de trop.
   */
  brand,
}: {
  children: ReactNode;
  brand?: string;
}) {
  // La fenêtre en unités de mise en page : sur grand écran l'app est agrandie
  // par un zoom CSS, donc la largeur réellement disponible pour la colonne
  // n'est pas celle en px CSS. Voir lib/uiScale.ts.
  const { width, height } = useViewport();
  const { colors, isDarkMode } = useTheme();

  if (width <= STAGE_MAX_WIDTH) return <>{children}</>;

  const chrome = stageChrome(height);
  const showBar = brand !== undefined && chrome.barHeight > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: backdrop(isDarkMode) }} />
      {showBar && (
        // Décorative : le retour au menu est déjà dans chaque écran, et un
        // second titre lu par un lecteur d'écran n'apporte rien.
        <View
          aria-hidden
          pointerEvents="none"
          style={{
            height: chrome.barHeight,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 26,
            backgroundColor: colors.card,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <AtlasGlobe color={colors.text} size={chrome.barHeight >= 44 ? 20 : 16} />
            <Text
              style={{
                fontFamily: FONTS.headingBlack,
                fontSize: chrome.barHeight >= 44 ? 19 : 15,
                color: colors.text,
                letterSpacing: 0.5,
              }}
            >
              GeoGames
            </Text>
          </View>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: FONTS.mono,
              fontSize: chrome.barHeight >= 44 ? 12 : 10,
              color: colors.textMuted,
              letterSpacing: 1.5,
            }}
          >
            {/* Au menu il n'y a pas de mode en cours : les coordonnées de la
                page d'accueil (CoordLabel) plutôt qu'un côté droit vide. */}
            {brand ? brand.toUpperCase() : '48°N · 2°E'}
          </Text>
        </View>
      )}
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          paddingVertical: chrome.gapV,
        }}
      >
        <View
          style={{
            flex: 1,
            // +2 pour la bordure : `useStageWidth()` promet STAGE_MAX_WIDTH de
            // contenu, et une View est en box-sizing: border-box — sans ça un
            // écran qui se dimensionne à la scène déborderait de 2 px et se
            // ferait rogner par l'overflow ci-dessous.
            width: STAGE_MAX_WIDTH + 2,
            // Le jeu se dessine jusqu'aux bords de la colonne et pas au-delà —
            // et les coins arrondis rognent le bleu du globe au passage.
            overflow: 'hidden',
            borderRadius: chrome.radius,
            borderWidth: 1,
            borderColor: colors.border,
            boxShadow: isDarkMode
              ? '0 22px 54px rgba(0,0,0,0.66)'
              : '0 22px 50px rgba(44,24,16,0.28)',
          }}
        >
          <StageWidthContext.Provider value={STAGE_MAX_WIDTH}>
            {children}
          </StageWidthContext.Provider>
        </View>
      </View>
    </View>
  );
}
