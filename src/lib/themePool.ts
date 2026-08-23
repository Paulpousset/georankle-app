/**
 * Pool de thèmes du tirage solo — VERSIONNÉ PAR DATE, jamais édité en place.
 *
 * Rankle et Plus ou Moins tirent leurs thèmes avec `seededShuffle(pool, rng)`.
 * Le pool venait jusqu'ici de `Object.keys(gameData.themes)`, c'est-à-dire de
 * `assets/game_data.json` — un fichier EMBARQUÉ DANS LE BINAIRE. Mélanger 41
 * entrées ne rend pas les mêmes 8 que mélanger 29 : deux joueurs sur deux
 * versions de l'app obtenaient donc deux défis quotidiens différents le même
 * jour, et la v5.4.0 a justement fait passer le pool de 29 à 41.
 *
 * C'est le même piège que celui documenté dans `league.ts` pour le pool de
 * modes (« appending one entry would turn every % 10 into a % 11 — for past
 * dates too »). Le remède est le même : figer la liste ICI, dans le code, et
 * dater chaque extension.
 *
 * ⚠️ NE JAMAIS RÉORDONNER NI INSÉRER — uniquement ajouter en fin de liste, dans
 * une nouvelle version datée. Un test de garde (`themePool.test.ts`) vérifie que
 * chaque version reste un préfixe strict de la suivante.
 *
 * Effet de bord voulu, identique à celui de `league.ts` : jusqu'à la date de
 * bascule, un vieux client et un client à jour calculent le MÊME tirage — la
 * livraison peut donc partir sans attendre que tout le parc soit à jour.
 */

/**
 * Date UTC (incluse) à partir de laquelle poolV2 s'applique. FIGÉE une fois
 * livrée. Choisie assez loin pour qu'un joueur qui ne met jamais à jour reste
 * d'accord avec les autres jusque-là — même raisonnement que
 * `LEAGUE_POOL_V3_FROM`.
 */
export const THEME_POOL_V2_FROM = '2026-11-01';

/**
 * FIGÉ POUR TOUJOURS — les 29 thèmes livrés jusqu'à la v5.3.2 incluse, dans
 * l'ordre exact où `Object.keys()` les rendait à l'époque.
 */
const THEME_POOL_V1: string[] = [
  'population',
  'area',
  'population_density',
  'coastline_length',
  'forest_area',
  'agricultural_land',
  'renewable_energy',
  'co2_emissions_pc',
  'gdp',
  'gdp_per_capita',
  'gdp_growth',
  'inflation',
  'unemployment_rate',
  'military_expenditure',
  'life_expectancy',
  'fertility_rate',
  'literacy_rate',
  'physicians_per_1000',
  'health_expenditure',
  'alcohol_consumption',
  'obesity_rate',
  'suicide_rate',
  'homicide_rate',
  'urban_population',
  'access_to_electricity',
  'internet_users',
  'mobile_subscriptions',
  'tourist_arrivals',
  'passport_power',
];

/**
 * V2 = V1 dans le MÊME ordre, les 12 thèmes sport/culture de la v5.4.0 ajoutés
 * à la fin. Préfixe strict — c'est ce qui garantit que rien du passé ne bouge.
 */
const THEME_POOL_V2: string[] = [
  ...THEME_POOL_V1,
  'fifa_ranking',
  'fiba_ranking',
  'rugby_ranking',
  'olympic_medals',
  'world_heritage',
  'highest_point',
  'avg_temperature',
  'armed_forces',
  'air_passengers',
  'women_parliament',
  'rd_expenditure',
  'electric_consumption',
];

/**
 * Le pool en vigueur à une date donnée (`YYYY-MM-DD`). La comparaison
 * lexicographique sur ce format est chronologique : pas de parsing de date, pas
 * de fuseau, et reproductible tel quel en SQL — c'est ce qui garde les deux
 * implémentations honnêtes, comme pour `leaguePoolFor`.
 */
export function themePoolFor(date: string): string[] {
  return date >= THEME_POOL_V2_FROM ? THEME_POOL_V2 : THEME_POOL_V1;
}

/**
 * Le pool le plus complet — pour le solo libre, où rien n'est comparé entre
 * joueurs et où les nouveaux thèmes doivent donc être jouables tout de suite.
 * À NE PAS utiliser pour le quotidien ni la ligue.
 */
export const THEME_POOL_LATEST = THEME_POOL_V2;

/** Points d'accroche pour les tests de parité. */
export const __THEME_POOL_V1 = THEME_POOL_V1;
export const __THEME_POOL_V2 = THEME_POOL_V2;
