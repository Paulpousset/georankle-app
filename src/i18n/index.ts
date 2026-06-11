import type { Language, LocalizedLabel } from '../types';

/**
 * Picks the string for the active language. Replaces the repeated
 * `language === 'fr' ? fr : en` ternary scattered across screens.
 */
export function tr(language: Language, fr: string, en: string): string {
  return language === 'fr' ? fr : en;
}

/**
 * Picks the localized value from a `{ fr, en }` label, falling back to `fr`
 * when the English variant is missing (as some game data lacks `en`).
 */
export function pickLabel(label: LocalizedLabel, language: Language): string {
  return language === 'fr' ? label.fr : label.en || label.fr;
}
