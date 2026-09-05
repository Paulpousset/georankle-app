import type { Language, LocalizedLabel } from '../types';
import { catalogFor } from './catalog';

/**
 * Le point de passage de tout le texte affiché.
 *
 * Le code continue d'écrire ses deux langues d'origine en clair —
 * `t('Rejouer', 'Play again')` — et c'est la chaîne **anglaise** qui sert de
 * clé pour les quatorze autres langues. Deux avantages : les mille appels
 * existants n'ont pas bougé, et une clé oubliée retombe sur un anglais correct
 * plutôt que sur un identifiant technique à l'écran.
 *
 * Les chaînes à trous s'écrivent `{0}`, `{1}` — `scripts/i18n_extract.mjs` a
 * converti les gabarits interpolés qui traînaient dans le code, parce qu'une
 * chaîne assemblée à l'exécution ne peut pas être une clé.
 */
const PLACEHOLDER = /\{(\d+)\}/g;

/** Remplace `{0}`, `{1}`… par les valeurs fournies. */
export function format(text: string, args?: readonly unknown[]): string {
  if (!args || args.length === 0) return text;
  return text.replace(PLACEHOLDER, (whole, index) => {
    const value = args[Number(index)];
    return value === undefined || value === null ? whole : String(value);
  });
}

/**
 * Rend la chaîne dans la langue active.
 *
 * `fr` et `en` sont servis tels quels ; les autres langues cherchent la clé
 * anglaise dans leur catalogue et retombent sur l'anglais si elle manque.
 */
export function tr(language: Language, fr: string, en: string, args?: readonly unknown[]): string {
  if (language === 'fr') return format(fr, args);
  const english = en || fr;
  if (language === 'en') return format(english, args);
  const hit = catalogFor(language)[english];
  return format(hit || english, args);
}

/**
 * Choisit la valeur localisée d'un libellé `{ fr, en }` des données de jeu.
 * Même mécanique que `tr` : l'anglais est la clé, et le repli.
 */
export function pickLabel(label: LocalizedLabel, language: Language): string {
  return tr(language, label.fr, label.en || label.fr);
}
