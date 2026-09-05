import type { Language } from '../../types';

import de from './de.json';
import el from './el.json';
import es from './es.json';
import id from './id.json';
import it from './it.json';
import nl from './nl.json';
import pl from './pl.json';
import pt from './pt.json';
import ro from './ro.json';
import ru from './ru.json';
import th from './th.json';
import tr from './tr.json';
import uk from './uk.json';
import vi from './vi.json';

/**
 * Les catalogues de traduction, indexés sur la chaîne **anglaise**.
 *
 * Ils sont générés puis relus à la main depuis `src/i18n/keys.json`
 * (`node scripts/i18n_extract.mjs --write` pour rafraîchir la liste des clés,
 * `node scripts/i18n_sync.mjs` pour propager les ajouts/retraits aux quatorze
 * fichiers). Une valeur vide vaut « pas encore traduit » : `tr` retombe alors
 * sur l'anglais, jamais sur une chaîne vide à l'écran.
 *
 * Les imports sont statiques et non paresseux : Metro n'éclate pas le paquet,
 * un `require` conditionnel n'aurait donc rien économisé, et le chargement
 * différé aurait fait clignoter l'anglais au démarrage.
 */
export type Catalog = Record<string, string>;

const CATALOGS: Partial<Record<Language, Catalog>> = {
  de,
  el,
  es,
  id,
  it,
  nl,
  pl,
  pt,
  ro,
  ru,
  th,
  tr,
  uk,
  vi,
};

const EMPTY: Catalog = {};

/** Le catalogue d'une langue — vide pour le français et l'anglais, écrits dans le code. */
export function catalogFor(language: Language): Catalog {
  return CATALOGS[language] ?? EMPTY;
}

/**
 * Toutes les traductions connues d'une clé anglaise, toutes langues confondues.
 *
 * Sert aux réponses tapées (mode CASH) : le nom d'une langue ou d'un thème est
 * accepté dans n'importe laquelle des seize langues, comme les noms de pays.
 */
export function allTranslations(english: string): string[] {
  const out = new Set<string>();
  for (const catalog of Object.values(CATALOGS)) {
    const hit = catalog[english];
    if (hit) out.add(hit);
  }
  return [...out];
}
