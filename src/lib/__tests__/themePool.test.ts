/**
 * Garde du pool de thèmes daté.
 *
 * Ces tests protègent la propriété qui rend le défi quotidien comparable entre
 * joueurs : le pool doit être FIGÉ et APPEND-ONLY. La v5.4.0 a fait passer
 * `assets/game_data.json` de 29 à 41 thèmes, et comme le tirage est un
 * `seededShuffle(pool)`, dériver le pool du JSON embarqué donnait deux défis
 * différents pour la même date selon la version installée.
 *
 * Si l'un de ces tests casse, c'est que quelqu'un a réordonné ou inséré dans une
 * version déjà livrée — ce qui rejouerait tout l'historique des tirages.
 */
import {
  THEME_POOL_LATEST,
  THEME_POOL_V2_FROM,
  __THEME_POOL_V1,
  __THEME_POOL_V2,
  themePoolFor,
} from '../themePool';
import { createSeededRng, seededShuffle } from '../rng';
import { gameData } from '../../data/gameData';

/**
 * Les 29 thèmes livrés jusqu'à la v5.3.2, dans l'ordre exact rendu par
 * `Object.keys(gameData.themes)` à l'époque (relevé sur le commit ac7fb66).
 * Fixture volontairement écrite en dur : c'est elle le contrat.
 */
const V1_FIXTURE = [
  'population', 'area', 'population_density', 'coastline_length', 'forest_area',
  'agricultural_land', 'renewable_energy', 'co2_emissions_pc', 'gdp',
  'gdp_per_capita', 'gdp_growth', 'inflation', 'unemployment_rate',
  'military_expenditure', 'life_expectancy', 'fertility_rate', 'literacy_rate',
  'physicians_per_1000', 'health_expenditure', 'alcohol_consumption',
  'obesity_rate', 'suicide_rate', 'homicide_rate', 'urban_population',
  'access_to_electricity', 'internet_users', 'mobile_subscriptions',
  'tourist_arrivals', 'passport_power',
];

describe('themePool — contrat de gel', () => {
  it('V1 est exactement les 29 thèmes de la v5.3.2, dans l’ordre', () => {
    expect(__THEME_POOL_V1).toEqual(V1_FIXTURE);
  });

  it('V2 est un préfixe strict de V1 suivi des nouveaux thèmes', () => {
    expect(__THEME_POOL_V2.slice(0, __THEME_POOL_V1.length)).toEqual(__THEME_POOL_V1);
    expect(__THEME_POOL_V2.length).toBe(41);
  });

  it('aucun doublon dans aucune version', () => {
    for (const pool of [__THEME_POOL_V1, __THEME_POOL_V2]) {
      expect(new Set(pool).size).toBe(pool.length);
    }
  });

  it('tout id du pool existe réellement dans game_data.json', () => {
    // Sans cette garde, une faute de frappe serait silencieuse : le filtre de
    // couverture écarterait l'id et le pool rétrécirait d'un cran — ce qui
    // décale à nouveau tout le tirage.
    const known = new Set(Object.keys(gameData.themes));
    expect(__THEME_POOL_V2.filter((t) => !known.has(t))).toEqual([]);
  });

  it('V2 couvre tous les thèmes du jeu de données courant', () => {
    // Si ce test casse après un `build_game_data.py`, c'est qu'il faut créer un
    // THEME_POOL_V3 daté — surtout PAS étendre V2 en place.
    expect(new Set(__THEME_POOL_V2)).toEqual(new Set(Object.keys(gameData.themes)));
  });

  it('la date de bascule est au format YYYY-MM-DD', () => {
    expect(THEME_POOL_V2_FROM).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('themePoolFor — bascule datée', () => {
  it('rend V1 avant la date de bascule', () => {
    expect(themePoolFor('2026-08-23')).toEqual(__THEME_POOL_V1);
    expect(themePoolFor('2020-01-01')).toEqual(__THEME_POOL_V1);
  });

  it('rend V2 à partir de la date de bascule (incluse)', () => {
    expect(themePoolFor(THEME_POOL_V2_FROM)).toEqual(__THEME_POOL_V2);
    expect(themePoolFor('2099-12-31')).toEqual(__THEME_POOL_V2);
  });

  it('la veille de la bascule rend encore V1', () => {
    const [y, m, d] = THEME_POOL_V2_FROM.split('-').map(Number);
    const eve = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
    expect(themePoolFor(eve)).toEqual(__THEME_POOL_V1);
  });

  it('THEME_POOL_LATEST est la version la plus complète', () => {
    expect(THEME_POOL_LATEST).toEqual(__THEME_POOL_V2);
  });
});

describe('non-régression du tirage quotidien', () => {
  /**
   * Le cœur du correctif : à graine égale, un build v5.3.2 (qui mélangeait 29
   * ids) et un build actuel doivent tirer les MÊMES thèmes pour une date
   * antérieure à la bascule. C'est ce que `themePoolFor` restaure.
   */
  it('reproduit le tirage d’un build 29-thèmes pour une date passée', () => {
    for (const date of ['2026-07-01', '2026-08-01', '2026-08-23', '2026-10-31']) {
      const legacy = seededShuffle(V1_FIXTURE, createSeededRng(12345)).slice(0, 8);
      const now = seededShuffle(themePoolFor(date), createSeededRng(12345)).slice(0, 8);
      expect(now).toEqual(legacy);
    }
  });

  it('un pool plus large change bien le tirage — c’est la raison d’être du gel', () => {
    const on29 = seededShuffle(__THEME_POOL_V1, createSeededRng(12345)).slice(0, 8);
    const on41 = seededShuffle(__THEME_POOL_V2, createSeededRng(12345)).slice(0, 8);
    expect(on41).not.toEqual(on29);
  });
});

describe('non-régression du tirage de Streak', () => {
  /**
   * Streak ne tirait pas depuis `gameData.themes` mais depuis
   * `Object.keys(country.ranks)` — ce qui l'avait fait passer sous le radar du
   * premier correctif. Or les 195 pays ont vu leur nombre de thèmes changer
   * entre v5.3.2 et v5.4.0, donc son tirage quotidien dérivait autant.
   *
   * Le correctif parcourt le POOL GELÉ et garde les thèmes que le pays possède
   * (au lieu de partir des clés du pays). Ce test verrouille les deux
   * propriétés qui rendent ça sûr : ordre indépendant de la version, et
   * insensibilité aux thèmes ajoutés.
   */
  const themesOf = (ranks: Record<string, number>, pool: string[]) =>
    pool.filter((t) => ranks[t] !== undefined);

  it('ignore les thèmes hors du pool gelé', () => {
    // Un pays « v5.4.0 » : il porte des rangs sur des thèmes récents.
    const ranks: Record<string, number> = {};
    for (const t of __THEME_POOL_V2) ranks[t] = 1;

    const avant = themesOf(ranks, themePoolFor('2026-08-23'));
    expect(avant).toEqual(__THEME_POOL_V1);
    expect(avant).not.toContain('fifa_ranking');
  });

  it('rend le même tirage de 4 thèmes qu’un build 29-thèmes', () => {
    const ranks: Record<string, number> = {};
    for (const t of __THEME_POOL_V2) ranks[t] = 1;

    const legacy = seededShuffle(V1_FIXTURE, createSeededRng(999)).slice(0, 4);
    const now = seededShuffle(
      themesOf(ranks, themePoolFor('2026-08-23')),
      createSeededRng(999),
    ).slice(0, 4);
    expect(now).toEqual(legacy);
  });

  it('l’ordre ne dépend pas de l’ordre des clés du pays', () => {
    // Deux pays avec les mêmes thèmes, insérés dans des ordres opposés :
    // partir du pool (et non des clés) doit rendre le même résultat.
    const a: Record<string, number> = {};
    for (const t of __THEME_POOL_V1) a[t] = 1;
    const b: Record<string, number> = {};
    for (const t of [...__THEME_POOL_V1].reverse()) b[t] = 1;

    const pool = themePoolFor('2026-08-23');
    expect(themesOf(a, pool)).toEqual(themesOf(b, pool));
  });
});
