/**
 * Le nom des pays et des capitales dans les seize langues.
 *
 * Les données de jeu ne portent que deux noms (`name`/`name_en`,
 * `capital_fr`/`capital`) : le reste vit dans deux tables générées à côté,
 * `assets/country_names.json` (issue du CLDR d'Unicode) et
 * `assets/capital_names.json` (écrite à la main, le CLDR ne nommant pas les
 * villes). Une langue absente retombe sur l'anglais, jamais sur un code.
 *
 * Les fonctions `…AnswerNames` servent au mode CASH, où la réponse est tapée :
 * on accepte **toutes** les orthographes connues, quelle que soit la langue de
 * l'interface. Un joueur grec qui tape « Paris » au clavier latin a raison.
 */
import rawCountryNames from '../../assets/country_names.json';
import rawCapitalNames from '../../assets/capital_names.json';
import type { Language } from '../types';

type NameTable = Record<string, Partial<Record<Language, string>>>;

const COUNTRY_NAMES = rawCountryNames as NameTable;
const CAPITAL_NAMES = rawCapitalNames as NameTable;

/** Le minimum pour nommer un pays : son code et ses deux noms d'origine. */
export interface NameableCountry {
  cca3: string;
  name: string;
  name_en?: string | null;
}

/** Le minimum pour nommer une capitale. */
export interface NameableCapital {
  cca3: string;
  capital: string;
  capital_fr?: string | null;
}

/** Le nom du pays dans la langue active, anglais en repli. */
export function countryName(country: NameableCountry, language: Language): string {
  if (language === 'fr') return country.name;
  const english = country.name_en || country.name;
  if (language === 'en') return english;
  return COUNTRY_NAMES[country.cca3]?.[language] || english;
}

/** La capitale dans la langue active, anglais en repli. */
export function capitalName(stat: NameableCapital, language: Language): string {
  if (language === 'fr') return stat.capital_fr || stat.capital;
  if (language === 'en') return stat.capital;
  return CAPITAL_NAMES[stat.cca3]?.[language] || stat.capital;
}

/** Toutes les orthographes acceptées du nom d'un pays, toutes langues confondues. */
export function countryAnswerNames(country: NameableCountry): string[] {
  const names = [country.name, country.name_en || '', ...Object.values(COUNTRY_NAMES[country.cca3] ?? {})];
  return [...new Set(names.filter(Boolean))];
}

/** Toutes les orthographes acceptées d'une capitale. */
export function capitalAnswerNames(stat: NameableCapital): string[] {
  const names = [stat.capital, stat.capital_fr || '', ...Object.values(CAPITAL_NAMES[stat.cca3] ?? {})];
  return [...new Set(names.filter(Boolean))];
}
