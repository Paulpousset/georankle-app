/**
 * Pose la feuille de style du survol (voir lib/webHover.ts pour le raisonnement)
 * et garde sa teinte accordée au thème.
 *
 * Ne rend rien : c'est un effet de bord sur `document`, monté une fois sous le
 * ThemeProvider — le seul endroit d'où l'on sait s'il fait jour ou nuit.
 */
import { useLayoutEffect } from 'react';

import { useTheme } from '../contexts/ThemeContext';
import {
  HOVER_BRIGHTNESS_VAR,
  HOVER_STYLE_ID,
  POINTER_CLASSES,
  buildHoverCss,
  hoverBrightness,
} from '../lib/webHover';

/**
 * Les classes que react-native-web donne aux éléments cliquables, lues dans les
 * règles qu'il a réellement insérées — de sorte qu'un changement de hachage (ou
 * le raccourcissement des identifiants en build minifié) ne rende pas le survol
 * silencieusement inerte. Repli sur les valeurs connues si le balayage ne
 * trouve rien (feuilles d'une autre origine, appel avant le premier rendu d'un
 * bouton…).
 */
function findPointerClasses(): string[] {
  const found: string[] = [];
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // feuille cross-origin : illisible, on passe
      }
      for (const rule of Array.from(rules)) {
        // Une classe unique, du préfixe atomique de RNW, qui pose le curseur
        // « main » : c'est exactement sa marque « ceci est cliquable ».
        if (
          rule instanceof CSSStyleRule &&
          rule.style.cursor === 'pointer' &&
          /^\.r-[\w-]+$/.test(rule.selectorText)
        ) {
          found.push(rule.selectorText.slice(1));
        }
      }
    }
  } catch {
    /* pas de DOM exploitable : repli */
  }
  return found.length ? found : POINTER_CLASSES;
}

function installHoverStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(HOVER_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HOVER_STYLE_ID;
  style.textContent = buildHoverCss(findPointerClasses());
  // En fin de <head> : après la feuille de RNW, donc nos règles l'emportent à
  // spécificité égale.
  document.head.appendChild(style);
}

export function WebHoverStyles() {
  const { isDarkMode } = useTheme();

  useLayoutEffect(() => {
    installHoverStyles();
  }, []);

  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty(HOVER_BRIGHTNESS_VAR, hoverBrightness(isDarkMode));
  }, [isDarkMode]);

  return null;
}
