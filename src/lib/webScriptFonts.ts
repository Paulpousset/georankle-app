/**
 * Le repli de police, écriture par écriture, sur le web.
 *
 * Sur natif, une `fontFamily` inconnue retombe sur la police système (voir
 * `lib/appFonts.ts`). Le navigateur, lui, ne fait ce repli que **glyphe par
 * glyphe**, et seulement si la famille déclare ne pas couvrir la plage
 * concernée. On ajoute donc, sous les **mêmes noms de famille** que ceux
 * qu'enregistre expo-font, des `@font-face` dont l'unique source est une police
 * locale et dont l'`unicode-range` couvre le cyrillique, le grec, le thaï et le
 * vietnamien.
 *
 * Le navigateur fusionne alors les déclarations en une seule famille : le latin
 * garde Space Mono, le russe et le grec passent en police système, dans la même
 * ligne de texte s'il le faut. Aucune feuille à charger, aucun octet réseau.
 */
import { Platform } from 'react-native';

/** `id` de la balise <style> injectée (une seule, réutilisée). */
export const SCRIPT_FONT_STYLE_ID = 'rk-script-fonts';

/**
 * Les plages couvertes par le repli : cyrillique (+ supplément), grec, thaï et
 * les voyelles vietnamiennes que Space Mono n'a pas. Le latin de base n'y est
 * évidemment pas — sinon le jeu perdrait sa police partout.
 */
const RANGES = [
  'U+0370-03FF', // grec
  'U+0400-04FF', // cyrillique
  'U+0500-052F', // cyrillique, supplément
  'U+0E00-0E7F', // thaï
  'U+1E00-1EFF', // latin étendu additionnel (vietnamien)
  'U+2000-206F', // ponctuation générale utilisée par ces écritures
].join(', ');

/** Les familles enregistrées par expo-font, avec leur graisse. */
const FAMILIES: { family: string; weight: number; serif: boolean }[] = [
  { family: 'SpaceMono_400Regular', weight: 400, serif: false },
  { family: 'SpaceMono_700Bold', weight: 700, serif: false },
  { family: 'PlayfairDisplay_700Bold', weight: 700, serif: true },
  { family: 'PlayfairDisplay_900Black', weight: 900, serif: true },
];

/** La feuille de repli, prête à être injectée. */
export function scriptFontCss(): string {
  return FAMILIES.map(({ family, weight, serif }) => {
    const stack = serif
      ? "local('Noto Serif'), local('Georgia'), serif"
      : "local('Noto Sans'), local('Arial'), sans-serif";
    return `@font-face{font-family:'${family}';font-weight:${weight};font-display:swap;src:${stack};unicode-range:${RANGES};}`;
  }).join('\n');
}

/** Pose la feuille une fois, sur le web uniquement. */
export function installScriptFonts(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById(SCRIPT_FONT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SCRIPT_FONT_STYLE_ID;
  style.textContent = scriptFontCss();
  document.head.appendChild(style);
}
