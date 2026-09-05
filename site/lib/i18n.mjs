/**
 * L'accès du site aux catalogues de traduction de l'app.
 *
 * Les pages de mode republient les phrases que le joueur lit déjà dans le jeu
 * (« Une bannière s'affiche : devinez à quel pays elle appartient »). Elles sont
 * traduites une fois, dans `src/i18n/catalog/`, et lues ici : le site ne
 * réécrit rien et ne peut pas dériver de l'app.
 *
 * La clé est la chaîne **anglaise**, exactement comme dans l'app.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './paths.mjs';
import { SITE_LOCALES } from './siteLocales.mjs';

const CATALOGS = {};
for (const locale of SITE_LOCALES) {
  CATALOGS[locale] = JSON.parse(readFileSync(join(ROOT, 'src/i18n/catalog', `${locale}.json`), 'utf8'));
}

/**
 * La traduction d'une clé anglaise, anglais en repli.
 *
 * Pas de `fail()` sur une clé absente : le catalogue suit le code de l'app, et
 * une phrase retirée du jeu ne doit pas casser la publication du site — elle
 * s'affiche en anglais, ce qui se voit et se corrige.
 */
export function t(locale, key) {
  const catalog = CATALOGS[locale];
  return (catalog && catalog[key]) || key;
}
