import type { Language } from '../types';

/**
 * Le registre des langues de l'app : nom natif, script, police et locale ICU.
 *
 * C'est la source unique — le sélecteur de langue, la détection à la première
 * ouverture, le formatage des nombres, le choix de la police et le générateur
 * du site en découlent tous. Le libellé est écrit **dans la langue elle-même** :
 * un joueur qui ne comprend pas l'interface actuelle doit pouvoir retrouver la
 * sienne dans la liste.
 */
export interface LocaleMeta {
  /** Le nom de la langue, écrit dans cette langue. */
  native: string;
  /** Son nom en anglais, pour les journaux et l'administration. */
  english: string;
  /**
   * L'écriture. `latin` couvre aussi les diacritiques étendues (polonais,
   * roumain, turc, vietnamien) ; le reste demande une police de repli, car
   * Space Mono et Playfair Display s'arrêtent au latin étendu.
   */
  script: 'latin' | 'cyrillic' | 'greek' | 'thai';
  /** La locale ICU/BCP-47 complète, pour `Intl` et l'attribut `lang` du web. */
  tag: string;
  /** Le drapeau du sélecteur — un pays représentatif, pas un jugement. */
  flag: string;
}

export const LOCALES: Record<Language, LocaleMeta> = {
  fr: { native: 'Français', english: 'French', script: 'latin', tag: 'fr-FR', flag: '🇫🇷' },
  en: { native: 'English', english: 'English', script: 'latin', tag: 'en-US', flag: '🇬🇧' },
  es: { native: 'Español', english: 'Spanish', script: 'latin', tag: 'es-ES', flag: '🇪🇸' },
  pt: { native: 'Português', english: 'Portuguese', script: 'latin', tag: 'pt-BR', flag: '🇧🇷' },
  de: { native: 'Deutsch', english: 'German', script: 'latin', tag: 'de-DE', flag: '🇩🇪' },
  it: { native: 'Italiano', english: 'Italian', script: 'latin', tag: 'it-IT', flag: '🇮🇹' },
  ru: { native: 'Русский', english: 'Russian', script: 'cyrillic', tag: 'ru-RU', flag: '🇷🇺' },
  tr: { native: 'Türkçe', english: 'Turkish', script: 'latin', tag: 'tr-TR', flag: '🇹🇷' },
  pl: { native: 'Polski', english: 'Polish', script: 'latin', tag: 'pl-PL', flag: '🇵🇱' },
  nl: { native: 'Nederlands', english: 'Dutch', script: 'latin', tag: 'nl-NL', flag: '🇳🇱' },
  id: { native: 'Bahasa Indonesia', english: 'Indonesian', script: 'latin', tag: 'id-ID', flag: '🇮🇩' },
  vi: { native: 'Tiếng Việt', english: 'Vietnamese', script: 'latin', tag: 'vi-VN', flag: '🇻🇳' },
  th: { native: 'ไทย', english: 'Thai', script: 'thai', tag: 'th-TH', flag: '🇹🇭' },
  uk: { native: 'Українська', english: 'Ukrainian', script: 'cyrillic', tag: 'uk-UA', flag: '🇺🇦' },
  ro: { native: 'Română', english: 'Romanian', script: 'latin', tag: 'ro-RO', flag: '🇷🇴' },
  el: { native: 'Ελληνικά', english: 'Greek', script: 'greek', tag: 'el-GR', flag: '🇬🇷' },
};

/** Les codes, dans l'ordre d'affichage du sélecteur. */
export const LANGUAGE_CODES = Object.keys(LOCALES) as Language[];

/** `true` si `value` est une langue que l'app parle. */
export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && value in LOCALES;
}

/**
 * La langue de l'app la plus proche d'une liste de balises système
 * (`['pt-BR', 'en-US']` → `pt`). Rend `null` si aucune ne correspond : au
 * premier lancement, l'appelant retombe alors sur l'anglais.
 *
 * Le portugais européen retombe volontairement sur notre `pt` (brésilien) :
 * mieux vaut un portugais légèrement décalé que de l'anglais.
 */
export function matchLanguage(tags: readonly (string | null | undefined)[]): Language | null {
  for (const tag of tags) {
    if (!tag) continue;
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (isLanguage(base)) return base;
  }
  return null;
}
