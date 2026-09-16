/**
 * L'accès aux données du jeu depuis le générateur du site.
 *
 * Rien n'est recopié : les tableaux des pages continent, la liste des drapeaux
 * et le nombre de voisins sont lus dans les mêmes fichiers que le jeu. C'est ce
 * qui rend ces pages tenables — 18 pages continent maintenues à la main
 * divergeraient de l'app en quelques semaines — et c'est aussi ce qui les rend
 * justes : un pays corrigé dans `countries_stats.json` corrige le site au build
 * suivant.
 *
 * Les sources TypeScript (codes ISO, frontières) sont lues au regex plutôt
 * qu'importées : un transpileur pour deux tables serait disproportionné, et une
 * regex qui ne matche plus arrête le build au lieu de publier des trous.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './paths.mjs';

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** Les 195 pays, avec capitale, continent, population, superficie… */
export const COUNTRIES = JSON.parse(read('assets/countries_stats.json'));

const GAME_DATA = JSON.parse(read('assets/game_data.json'));

/** Les thèmes de classement (Rankle, Streak, Plus ou Moins). */
export const THEMES = GAME_DATA.themes;

/**
 * Les pays tels que le jeu les charge, AVEC leurs rangs par thème
 * (`ranks.population` = 36…). `countries_stats.json` n'a pas ces rangs : la
 * grille d'exemple de Rankle lit donc ici, pour afficher exactement ce que
 * l'app afficherait.
 */
export const GAME_COUNTRIES = GAME_DATA.countries;

/** cca3 → cca2, pour construire les URL de drapeaux comme le fait l'app. */
export const CCA2 = (() => {
  const src = read('src/data/countryCodes.ts');
  const map = Object.fromEntries(
    [...src.matchAll(/^\s{2}([A-Z]{3}): '([A-Z]{2})',$/gm)].map(([, a3, a2]) => [a3, a2]),
  );
  if (Object.keys(map).length < 200) {
    throw new Error(`CCA3_TO_CCA2 : ${Object.keys(map).length} entrées lues, la source a changé`);
  }
  return map;
})();

/**
 * cca3 → liste des voisins (cca3), symétrisée.
 *
 * ⚠️ Le compte peut différer de `borders_count` : la France du jeu est
 * métropolitaine (pas de Guyane), et quelques voisins sont hors des 195
 * (Kosovo, Sahara occidental…). `src/data/borders.ts` documente chaque écart —
 * c'est le nombre de voisins **jouables** qu'on affiche, en le disant.
 */
export const NEIGHBOURS = (() => {
  const src = read('src/data/borders.ts');
  const block = src.match(/export const BORDER_PAIRS: string\[\] = \(([\s\S]*?)\)\s*\.split/);
  if (!block) throw new Error('BORDER_PAIRS introuvable dans src/data/borders.ts');
  const pairs = [...block[1].matchAll(/'([^']+)'/g)]
    .map(([, chunk]) => chunk.trim())
    .join(' ')
    .split(/\s+/)
    .filter(Boolean);
  const map = new Map(COUNTRIES.map((c) => [c.cca3, []]));
  for (const pair of pairs) {
    const [a, b] = pair.split('-');
    if (!map.has(a) || !map.has(b)) continue;
    map.get(a).push(b);
    map.get(b).push(a);
  }
  if (pairs.length < 300) throw new Error(`BORDER_PAIRS : ${pairs.length} paires lues, trop peu`);
  return map;
})();

/**
 * Le classement de notoriété du jeu (1 = le plus connu, {{countries}} = le moins).
 *
 * C'est la même mesure qui pilote la difficulté du mode Histoire et le tirage
 * des questions : un mélange normalisé de population, de PIB, de tourisme et de
 * taux de connexion à Internet. Elle n'est ni un jugement ni une mesure
 * d'importance — juste une estimation de la fréquence à laquelle un pays est
 * rencontré par le grand public.
 */
export const NOTORIETY = JSON.parse(read('assets/notoriety.json')).ranks;

/** Un pays par son code alpha-3. */
export function byCca3(cca3) {
  return COUNTRIES.find((c) => c.cca3 === cca3);
}

/** L'URL du drapeau, même CDN que l'app (`src/lib/flags.ts`). */
export function flagUrl(cca3, width = 80) {
  const code = CCA2[cca3];
  return `https://flagcdn.com/w${width}/${(code || 'un').toLowerCase()}.png`;
}

/** Le nom d'un pays dans la langue de la page. */
export function countryName(country, locale) {
  return locale === 'fr' ? country.name : country.name_en || country.name;
}

/** La capitale d'un pays dans la langue de la page. */
export function capitalName(country, locale) {
  return locale === 'fr' ? country.capital_fr || country.capital : country.capital;
}

/** Formate un entier avec des espaces insécables fines, façon typographie FR. */
export function num(value, locale = 'fr') {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US').format(value);
}

/**
 * Les rangs du mode classé, lus dans `src/lib/ranked.ts`.
 *
 * Les seuils d'ELO sont une règle de jeu : les recopier dans une page les
 * ferait diverger au premier équilibrage. Ils sont donc extraits de la source.
 */
export const RANKS = (() => {
  const src = read('src/lib/ranked.ts');
  const block = src.match(/export const RANKS: RankInfo\[\] = \[([\s\S]*?)\n\];/);
  if (!block) throw new Error('RANKS introuvable dans src/lib/ranked.ts');
  const ranks = [...block[1].matchAll(/\{([\s\S]*?)\}/g)].map(([, body]) => ({
    nameFr: body.match(/nameFr: '([^']+)'/)[1],
    name: body.match(/name: '([^']+)'/)[1],
    minElo: Number(body.match(/minElo: (\d+)/)[1]),
    maxElo: /maxElo: null/.test(body) ? null : Number(body.match(/maxElo: (\d+)/)[1]),
  }));
  if (ranks.length < 4) throw new Error(`RANKS : ${ranks.length} rangs lus, trop peu`);
  return ranks;
})();

/**
 * Les modes solo que `/play?mode=` sait démarrer, lus dans `src/lib/webEntry.ts`.
 *
 * C'est la liste blanche de l'app : un lien `{{playmode:xxx}}` vers un mode
 * absent d'ici tomberait silencieusement sur le défi du jour, et la page
 * perdrait tout le trafic qu'elle amène. Lue à la source pour ne jamais
 * diverger ; la regex qui ne matche plus arrête le build.
 */
export const BOOTABLE_MODES = (() => {
  const src = read('src/lib/webEntry.ts');
  const block = src.match(/const BOOTABLE[^=]*=\s*new Set<GameMode>\(\[([\s\S]*?)\]\)/);
  if (!block) throw new Error('BOOTABLE introuvable dans src/lib/webEntry.ts');
  const modes = [...block[1].matchAll(/'([a-z-]+)'/g)].map(([, m]) => m);
  if (modes.length < 5) throw new Error(`BOOTABLE : ${modes.length} modes lus, trop peu`);
  return new Set(modes);
})();
