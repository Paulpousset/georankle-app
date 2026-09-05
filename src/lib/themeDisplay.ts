/**
 * Le libellé de la valeur d'un thème — « 👥 Population : 42 647 492 hab. » —
 * dans les seize langues.
 *
 * Les données de jeu ne portent que deux versions figées (`display_fr` /
 * `display_en`), écrites par `build_game_data.py`. Les regénérer en seize
 * langues aurait multiplié par huit un fichier déjà à 1,7 Mo pour rien : la
 * phrase est composée de quatre morceaux qu'on a déjà séparément — l'emoji, le
 * libellé du thème, le nombre et l'unité. On la recompose donc à l'exécution,
 * et le français comme l'anglais continuent d'être servis tels quels, à
 * l'octet près.
 *
 * Le nombre est reformaté par `Intl` : un Allemand lit « 42.647.492 » et un
 * Russe « 42 647 492 ». Si `Intl` manque à l'appel (moteur JS réduit), on
 * garde le groupement anglais plutôt que d'afficher un nombre brut.
 */
import { gameData } from '../data/gameData';
import { pickLabel, tr } from '../i18n';
import { LOCALES } from '../i18n/locales';
import type { Language } from '../types';

/** Ce qu'il faut pour afficher une valeur : le nombre et ses deux versions figées. */
export interface DisplayableDatum {
  value: number;
  display_fr: string;
  display_en: string;
}

/** Le nombre de décimales affichées par la version anglaise (« 65.3 » → 1). */
function decimalsOf(display: string): number {
  const match = display.match(/\d+\.(\d+)/);
  return match ? match[1].length : 0;
}

/** Le nombre, groupé selon la langue. */
function formatNumber(value: number, decimals: number, language: Language): string {
  try {
    return new Intl.NumberFormat(LOCALES[language].tag, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return value.toFixed(decimals);
  }
}

/**
 * La phrase complète, dans la langue active. `themeId` sert à retrouver
 * l'emoji, le libellé et l'unité ; un thème inconnu retombe sur l'anglais.
 */
export function themeDisplay(themeId: string, datum: DisplayableDatum, language: Language): string {
  if (language === 'fr') return datum.display_fr;
  if (language === 'en') return datum.display_en;

  const theme = gameData.themes[themeId] as
    | { emoji?: string; label?: { fr: string; en: string }; unit?: { fr: string; en: string } }
    | undefined;
  if (!theme?.label) return datum.display_en;

  const label = pickLabel({ fr: theme.label.fr, en: theme.label.en }, language);
  const unit = theme.unit ? tr(language, theme.unit.fr, theme.unit.en) : '';
  const number = formatNumber(datum.value, decimalsOf(datum.display_en), language);
  // Seul le français met une espace avant les deux-points.
  const body = !unit ? number : unit === '%' ? `${number}%` : `${number} ${unit}`;
  return `${theme.emoji ?? ''} ${label}: ${body}`.trim();
}
