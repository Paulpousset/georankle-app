/**
 * Les tableaux de référence générés depuis les données du jeu.
 *
 * C'est le cœur des phases 2 et 3 du plan SEO : sans eux, une page de mode est
 * une page promotionnelle de plus, et une page continent un paragraphe creux.
 * Avec eux, « quelle est la capitale du Kazakhstan » a une réponse chez nous,
 * et la page a une raison d'exister pour quelqu'un qui ne jouera jamais.
 *
 * Chaque tableau est enveloppé dans `.table-wrap` (défilement horizontal
 * autonome : la page, elle, ne défile jamais latéralement) et renvoie aussi la
 * liste de ses entrées, que la page transforme en JSON-LD `ItemList`.
 */
import { CONTINENTS, countriesOf } from './continents.mjs';
import { MODES } from './modes.mjs';
import { COUNTRIES, GAME_COUNTRIES, NEIGHBOURS, NOTORIETY, RANKS, THEMES, capitalName, countryName, flagUrl, num } from './data.mjs';
import { strings } from './strings.mjs';
import { attr } from './layout.mjs';

/** Le sous-ensemble désigné par un scope : un id de continent, ou `all`. */
function scopeCountries(scope) {
  if (scope === 'all') {
    return [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }
  return countriesOf(scope);
}

/** Le libellé français d'un scope, pour les titres et le JSON-LD. */
function scopeLabel(scope, locale) {
  if (scope === 'all') return locale === 'fr' ? 'du monde' : 'of the world';
  const continent = CONTINENTS.find((c) => c.id === scope);
  return locale === 'fr' ? continent.frDe : continent.en;
}

function cell(value) {
  return `<td>${value}</td>`;
}

function table(headers, rows) {
  return (
    '      <div class="table-wrap">\n' +
    '        <table>\n' +
    `          <thead><tr>${headers.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead>\n` +
    '          <tbody>\n' +
    rows.map((r) => `            <tr>${r}</tr>`).join('\n') +
    '\n          </tbody>\n' +
    '        </table>\n' +
    '      </div>'
  );
}

/**
 * Drapeau + pays + capitale.
 *
 * Les images viennent de flagcdn, le même CDN que l'app (`src/lib/flags.ts`) —
 * pas de duplication de 195 fichiers dans le dépôt. Toutes en `lazy` avec des
 * dimensions explicites : elles sont sous la ligne de flottaison, elles ne
 * pèsent donc ni sur le LCP ni sur le CLS.
 */
export function flagsTable(scope, locale) {
  const s = strings(locale);
  const list = scopeCountries(scope);
  const rows = list.map(
    (c) =>
      cell(
        `<img src="${flagUrl(c.cca3)}" alt="${attr(`${locale === 'fr' ? 'Drapeau' : 'Flag'} ${locale === 'fr' ? 'de' : 'of'} ${countryName(c, locale)}`)}" width="40" height="27" loading="lazy" decoding="async" />`,
      ) +
      cell(`<strong>${countryName(c, locale)}</strong>`) +
      cell(capitalName(c, locale)),
  );
  return {
    html: table([s.flag, s.country, s.capital], rows),
    items: list.map((c) => countryName(c, locale)),
    name:
      locale === 'fr'
        ? `Les drapeaux ${scopeLabel(scope, locale)}`
        : `Flags ${scopeLabel(scope, locale)}`,
  };
}

/** Pays → capitale, avec le continent quand la portée est mondiale. */
export function capitalsTable(scope, locale) {
  const s = strings(locale);
  const list = scopeCountries(scope);
  const withContinent = scope === 'all';
  const rows = list.map((c) => {
    const continent = CONTINENTS.find((k) => k.match(c));
    return (
      cell(`<strong>${countryName(c, locale)}</strong>`) +
      cell(capitalName(c, locale)) +
      (withContinent ? cell(locale === 'fr' ? continent.fr : continent.en) : '')
    );
  });
  return {
    html: table(
      [s.country, s.capital, ...(withContinent ? [s.continent] : [])],
      rows,
    ),
    items: list.map((c) => `${countryName(c, locale)} — ${capitalName(c, locale)}`),
    name:
      locale === 'fr'
        ? `Les capitales ${scopeLabel(scope, locale)}`
        : `Capitals ${scopeLabel(scope, locale)}`,
  };
}

/** Fiche complète : capitale, population, superficie, voisins. */
export function countriesTable(scope, locale) {
  const s = strings(locale);
  const list = scopeCountries(scope);
  const rows = list.map(
    (c) =>
      cell(`<strong>${countryName(c, locale)}</strong>`) +
      cell(capitalName(c, locale)) +
      cell(num(c.population, locale)) +
      cell(num(c.area, locale)) +
      cell(String(NEIGHBOURS.get(c.cca3).length)),
  );
  return {
    html: table([s.country, s.capital, s.population, s.area, s.neighbours], rows),
    items: list.map((c) => countryName(c, locale)),
    name:
      locale === 'fr' ? `Les pays ${scopeLabel(scope, locale)}` : `Countries ${scopeLabel(scope, locale)}`,
  };
}

/**
 * Pays → nombre de voisins, du plus entouré au plus isolé.
 *
 * Le décompte est celui du jeu : la France y est métropolitaine, et les voisins
 * hors des 195 (Kosovo, Sahara occidental…) ne comptent pas. La page le dit.
 */
export function bordersTable(scope, locale) {
  const s = strings(locale);
  const list = scopeCountries(scope)
    .filter((c) => NEIGHBOURS.get(c.cca3).length > 0)
    .sort(
      (a, b) =>
        NEIGHBOURS.get(b.cca3).length - NEIGHBOURS.get(a.cca3).length ||
        a.name.localeCompare(b.name, 'fr'),
    );
  const rows = list.map((c) => {
    const names = NEIGHBOURS.get(c.cca3)
      .map((n) => countryName(COUNTRIES.find((x) => x.cca3 === n), locale))
      .sort((a, b) => a.localeCompare(b, 'fr'));
    return (
      cell(`<strong>${countryName(c, locale)}</strong>`) +
      cell(String(names.length)) +
      cell(names.join(', '))
    );
  });
  return {
    html: table([s.country, s.neighbours, locale === 'fr' ? 'Lesquels' : 'Which ones'], rows),
    items: list.map((c) => `${countryName(c, locale)} — ${NEIGHBOURS.get(c.cca3).length}`),
    name: locale === 'fr' ? 'Pays par nombre de voisins' : 'Countries by number of neighbours',
  };
}

/** Population et superficie, du plus peuplé au moins peuplé. */
export function sizeTable(scope, locale) {
  const s = strings(locale);
  const list = scopeCountries(scope).sort((a, b) => b.population - a.population);
  const rows = list.map(
    (c, i) =>
      cell(`<strong>${i + 1}</strong>`) +
      cell(countryName(c, locale)) +
      cell(num(c.population, locale)) +
      cell(num(c.area, locale)),
  );
  return {
    html: table(['#', s.country, s.population, s.area], rows),
    items: list.map((c) => countryName(c, locale)),
    name: locale === 'fr' ? 'Pays par population' : 'Countries by population',
  };
}

/** Les thèmes de classement du jeu, avec leur intitulé et leur icône. */
export function themesTable(scope, locale) {
  void scope;
  const entries = Object.entries(THEMES)
    .map(([id, theme]) => ({
      id,
      emoji: theme.emoji || '✦',
      label: locale === 'fr' ? theme.label.fr : theme.label.en || theme.label.fr,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, locale === 'fr' ? 'fr' : 'en'));
  const rows = entries.map((t) => cell(t.emoji) + cell(`<strong>${t.label}</strong>`));
  return {
    html: table(
      [locale === 'fr' ? 'Icône' : 'Icon', locale === 'fr' ? 'Critère de classement' : 'Ranking criterion'],
      rows,
    ),
    items: entries.map((t) => t.label),
    name: locale === 'fr' ? 'Les critères de classement de Rankle' : 'Rankle ranking criteria',
  };
}


/**
 * Une grille de Rankle résolue, calculée depuis les données du jeu.
 *
 * Huit pays et huit critères fixés ici, les rangs lus dans `game_data.json`
 * (les mêmes que ceux de l'app), et le placement optimal trouvé par le même
 * algorithme que `solveOptimal` (src/lib/gameLogic.ts) : recherche exhaustive
 * avec élagage, 8! = 40 320 affectations au plus. La page d'astuces s'en sert
 * pour montrer le piège du mode — le meilleur critère d'un pays pris seul
 * n'est pas toujours celui qu'il faut lui donner — sans rien inventer : si les
 * données changent, la grille et son commentaire se recalculent au build.
 */
const RANKLE_EXAMPLE = {
  countries: ['RUS', 'BRA', 'JPN', 'NOR', 'EGY', 'AUS', 'MCO', 'QAT'],
  themes: ['area', 'population', 'coastline_length', 'gdp_per_capita', 'forest_area', 'tourist_arrivals', 'world_heritage', 'highest_point'],
};

/** Rang d'un pays sur un thème, 200 quand la donnée manque — comme l'app. */
function rankOf(country, themeId) {
  return country.ranks?.[themeId] || 200;
}

/** Le placement de somme minimale : `assignment[i]` = index de thème du pays i. */
function solveRankle(matrix) {
  const n = matrix.length;
  let best = null;
  let min = Infinity;
  const current = [];
  const go = (i, used, sum) => {
    if (i === n) {
      if (sum < min) {
        min = sum;
        best = [...current];
      }
      return;
    }
    for (let t = 0; t < n; t++) {
      if (used & (1 << t)) continue;
      const next = sum + matrix[i][t];
      if (next >= min) continue;
      current[i] = t;
      go(i + 1, used | (1 << t), next);
    }
  };
  go(0, 0, 0);
  return { assignment: best, total: min };
}

/** Le placement « glouton » : chaque pays, dans l'ordre, prend son meilleur critère encore libre. */
function greedyRankle(matrix) {
  const n = matrix.length;
  let used = 0;
  let total = 0;
  const assignment = [];
  for (let i = 0; i < n; i++) {
    let bestT = -1;
    for (let t = 0; t < n; t++) {
      if (used & (1 << t)) continue;
      if (bestT === -1 || matrix[i][t] < matrix[i][bestT]) bestT = t;
    }
    assignment[i] = bestT;
    used |= 1 << bestT;
    total += matrix[i][bestT];
  }
  return { assignment, total };
}

/** Les éléments de la grille d'exemple, partagés par le tableau et son commentaire. */
export function rankleExample(locale) {
  const countries = RANKLE_EXAMPLE.countries.map((cca3) => {
    const c = GAME_COUNTRIES.find((x) => x.cca3 === cca3);
    if (!c?.ranks) throw new Error(`grille Rankle : pays inconnu ou sans rangs ${cca3}`);
    return c;
  });
  const themes = RANKLE_EXAMPLE.themes.map((id) => {
    const t = THEMES[id];
    if (!t) throw new Error(`grille Rankle : thème inconnu ${id}`);
    return { id, emoji: t.emoji || '✦', label: locale === 'fr' ? t.label.fr : t.label.en || t.label.fr };
  });
  const matrix = countries.map((c) => themes.map((t) => rankOf(c, t.id)));
  const optimal = solveRankle(matrix);
  const greedy = greedyRankle(matrix);
  const greedyEfficiency = Math.round((optimal.total / Math.max(greedy.total, 1)) * 100);
  // Le commentaire de rankle-tips raconte CETTE grille : la Russie, première en
  // superficie, ne reçoit pas la superficie, et Monaco reçoit la richesse par
  // habitant. Si une mise à jour des données défait l'histoire, on arrête le
  // build plutôt que de publier un commentaire faux — il faudra réécrire le
  // paragraphe (ou changer les pays de RANKLE_EXAMPLE).
  const themeOf = (cca3) => themes[optimal.assignment[countries.findIndex((c) => c.cca3 === cca3)]].id;
  if (themeOf('RUS') === 'area' || themeOf('MCO') !== 'gdp_per_capita' || greedyEfficiency >= 90) {
    throw new Error('grille Rankle : les données ne montrent plus le piège décrit dans rankle-tips — reprendre le commentaire');
  }
  return { countries, themes, matrix, optimal, greedy, greedyEfficiency };
}

/** La grille d'exemple en tableau : rangs mondiaux, placement optimal en gras. */
export function rankleExampleTable(scope, locale) {
  void scope;
  const ex = rankleExample(locale);
  const s = strings(locale);
  const rows = ex.countries.map((c, i) =>
    cell(`<strong>${countryName(c, locale)}</strong>`) +
    ex.themes
      .map((t, j) => {
        const rank = ex.matrix[i][j];
        const text = rank >= 200 ? '—' : String(rank);
        return cell(ex.optimal.assignment[i] === j ? `<strong>★ ${text}</strong>` : text);
      })
      .join(''),
  );
  return {
    html: table([s.country, ...ex.themes.map((t) => `${t.emoji} ${t.label}`)], rows),
    items: ex.countries.map((c) => countryName(c, locale)),
    name: locale === 'fr' ? 'Une grille de Rankle résolue' : 'A solved Rankle grid',
  };
}


/**
 * Pour chaque critère, les trois pays en tête — le « qui est premier » que la
 * page d'astuces recommande de connaître. Lu dans les rangs du jeu, jamais
 * saisi ; les critères sans donnée pour un pays ignorent ce pays.
 */
export function rankleLeadersTable(scope, locale) {
  void scope;
  const entries = Object.entries(THEMES)
    .map(([id, theme]) => {
      const top = GAME_COUNTRIES.filter((c) => c.ranks?.[id])
        .sort((a, b) => a.ranks[id] - b.ranks[id])
        .slice(0, 3)
        .map((c) => countryName(c, locale));
      return {
        id,
        emoji: theme.emoji || '✦',
        label: locale === 'fr' ? theme.label.fr : theme.label.en || theme.label.fr,
        top,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, locale === 'fr' ? 'fr' : 'en'));
  const rows = entries.map(
    (t) => cell(`${t.emoji} <strong>${t.label}</strong>`) + t.top.map((name, i) => cell(i === 0 ? `<strong>${name}</strong>` : name)).join(''),
  );
  return {
    html: table(
      locale === 'fr' ? ['Critère', '1ᵉʳ', '2ᵉ', '3ᵉ'] : ['Criterion', '1st', '2nd', '3rd'],
      rows,
    ),
    items: entries.map((t) => `${t.label} : ${t.top[0]}`),
    name: locale === 'fr' ? 'Les pays en tête de chaque critère de Rankle' : 'Leading countries for each Rankle criterion',
  };
}


/** Vue d'ensemble des six continents : effectif, extrêmes, pays enclavés. */
export function continentsTable(scope, locale) {
  void scope;
  const rows = CONTINENTS.map((k) => {
    const list = countriesOf(k.id);
    const biggest = [...list].sort((a, b) => b.area - a.area)[0];
    const smallest = [...list].sort((a, b) => a.area - b.area)[0];
    const landlocked = list.filter((c) => !c.coastline).length;
    return (
      cell(`<strong>${locale === 'fr' ? k.fr : k.en}</strong>`) +
      cell(String(list.length)) +
      cell(countryName(biggest, locale)) +
      cell(countryName(smallest, locale)) +
      cell(String(landlocked))
    );
  });
  return {
    html: table(
      locale === 'fr'
        ? ['Continent', 'Pays', 'Le plus vaste', 'Le plus petit', 'Sans littoral']
        : ['Continent', 'Countries', 'Largest', 'Smallest', 'Landlocked'],
      rows,
    ),
    items: CONTINENTS.map((k) => (locale === 'fr' ? k.fr : k.en)),
    name: locale === 'fr' ? 'Les continents et leurs pays' : 'Continents and their countries',
  };
}

/** Les pays du plus vaste au plus petit — l'angle du mode Silhouette. */
export function areaTable(scope, locale) {
  const s = strings(locale);
  const list = scopeCountries(scope).sort((a, b) => b.area - a.area);
  const rows = list.map(
    (c, i) =>
      cell(`<strong>${i + 1}</strong>`) +
      cell(countryName(c, locale)) +
      cell(num(c.area, locale)) +
      cell(locale === 'fr' ? (c.coastline ? 'Oui' : 'Non') : c.coastline ? 'Yes' : 'No'),
  );
  return {
    html: table(['#', s.country, s.area, locale === 'fr' ? 'Littoral' : 'Coastline'], rows),
    items: list.map((c) => countryName(c, locale)),
    name: locale === 'fr' ? 'Les pays par superficie' : 'Countries by area',
  };
}

/**
 * Les sous-régions du monde — la granularité qu'utilise le mode Devine le Pays
 * pour son premier indice, et le meilleur découpage pour réviser par blocs.
 */
export function subregionsTable(scope, locale) {
  void scope;
  const groups = new Map();
  for (const c of COUNTRIES) {
    if (!groups.has(c.subregion)) groups.set(c.subregion, []);
    groups.get(c.subregion).push(c);
  }
  const rows = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([subregion, list]) => {
      const continent = CONTINENTS.find((k) => k.match(list[0]));
      return (
        cell(`<strong>${SUBREGION_FR[subregion] || subregion}</strong>`) +
        cell(locale === 'fr' ? continent.fr : continent.en) +
        cell(String(list.length)) +
        cell(
          list
            .map((c) => countryName(c, locale))
            .sort((a, b) => a.localeCompare(b, 'fr'))
            .join(', '),
        )
      );
    });
  return {
    html: table(
      locale === 'fr'
        ? ['Sous-région', 'Continent', 'Pays', 'Lesquels']
        : ['Subregion', 'Continent', 'Countries', 'Which ones'],
      rows,
    ),
    items: [...groups.keys()].map((k) => SUBREGION_FR[k] || k),
    name: locale === 'fr' ? 'Les sous-régions du monde' : 'World subregions',
  };
}

/** Les libellés français des sous-régions de `countries_stats.json`. */
const SUBREGION_FR = {
  'Eastern Africa': "Afrique de l'Est",
  'Middle Africa': 'Afrique centrale',
  'Northern Africa': 'Afrique du Nord',
  'Southern Africa': 'Afrique australe',
  'Western Africa': "Afrique de l'Ouest",
  Caribbean: 'Caraïbes',
  'Central America': 'Amérique centrale',
  'North America': 'Amérique du Nord (continentale)',
  'South America': 'Amérique du Sud',
  'Central Asia': 'Asie centrale',
  'Eastern Asia': "Asie de l'Est",
  'South-Eastern Asia': 'Asie du Sud-Est',
  'Southern Asia': 'Asie du Sud',
  'Western Asia': "Asie de l'Ouest",
  'Central Europe': 'Europe centrale',
  'Eastern Europe': "Europe de l'Est",
  'Northern Europe': 'Europe du Nord',
  'Southeast Europe': 'Europe du Sud-Est',
  'Southern Europe': 'Europe du Sud',
  'Western Europe': "Europe de l'Ouest",
  'Australia and New Zealand': 'Australie et Nouvelle-Zélande',
  Melanesia: 'Mélanésie',
  Micronesia: 'Micronésie',
  Polynesia: 'Polynésie',
};

/** Les douze modes de jeu et leur page dédiée. */
export function modesTable(scope, locale) {
  void scope;
  const rows = MODES.map((m) => {
    const label = (m[locale] || m.fr).name;
    const slug = (m[locale] || m.fr).slug;
    return cell(`<strong><a href="${slug}">${label}</a></strong>`) + cell(MODE_PITCH[m.id][locale] || MODE_PITCH[m.id].fr);
  });
  return {
    html: table(
      locale === 'fr' ? ['Mode', 'Ce qu’on y fait'] : ['Mode', 'What you do'],
      rows,
    ),
    items: MODES.map((m) => (m[locale] || m.fr).name),
    name: locale === 'fr' ? 'Les modes de jeu de GeoG' : 'GeoG game modes',
  };
}

/** Une phrase par mode, la même partout : un seul endroit à corriger. */
const MODE_PITCH = {
  'mode-flags': { fr: 'Reconnaître le pays derrière un drapeau.', en: 'Name the country behind a flag.' },
  'mode-capitals': { fr: 'Retrouver la capitale d’un pays parmi quatre propositions.', en: 'Find a country’s capital among four options.' },
  'mode-globe': { fr: 'Localiser un pays en faisant tourner un globe 3D.', en: 'Locate a country by spinning a 3D globe.' },
  'mode-silhouettes': { fr: 'Identifier un pays à sa seule forme, sans nom ni voisins.', en: 'Identify a country from its outline alone.' },
  'mode-borders': { fr: 'Relier deux pays de frontière en frontière.', en: 'Link two countries border by border.' },
  'mode-guess': { fr: 'Trouver un pays mystère à partir d’indices successifs.', en: 'Find a mystery country from successive clues.' },
  'mode-rankle': { fr: 'Répartir huit pays sur huit critères de classement.', en: 'Spread eight countries across eight ranking criteria.' },
  'mode-higherlower': { fr: 'Dire lequel de deux pays est au-dessus sur un critère.', en: 'Say which of two countries ranks higher.' },
  'mode-daily': { fr: 'Une série quotidienne identique pour tous les joueurs.', en: 'A daily run, identical for every player.' },
  'mode-online': { fr: 'Duels en temps réel et matchs jusqu’à huit joueurs.', en: 'Live duels and matches for up to eight players.' },
  'mode-ranked': { fr: 'Un classement ELO avec rangs et saisons.', en: 'ELO ladder with tiers and seasons.' },
  'mode-story': { fr: 'Une campagne de niveaux à étoiles autour du monde.', en: 'A starred level campaign around the world.' },
};

/** Les rangs du mode classé et leurs seuils d'ELO. */
export function ranksTable(scope, locale) {
  void scope;
  const rows = RANKS.map((r) =>
    cell(`<strong>${locale === 'fr' ? r.nameFr : r.name}</strong>`) +
    cell(r.maxElo === null ? `${num(r.minElo, locale)} +` : `${num(r.minElo, locale)} – ${num(r.maxElo, locale)}`),
  );
  return {
    html: table(
      locale === 'fr' ? ['Rang', 'Points de classement (ELO)'] : ['Tier', 'Rating (ELO)'],
      rows,
    ),
    items: RANKS.map((r) => (locale === 'fr' ? r.nameFr : r.name)),
    name: locale === 'fr' ? 'Les rangs du mode classé' : 'Ranked tiers',
  };
}

/**
 * Les pays les moins connus, du dernier au plus connu.
 *
 * `limit` permet de ne montrer que la queue du classement : `{{table:notoriety:30}}`
 * donne les trente pays les moins familiers.
 */
export function notorietyTable(scope, locale) {
  const limit = Number(scope) || 30;
  const list = [...COUNTRIES]
    .filter((c) => NOTORIETY[c.cca3])
    .sort((a, b) => NOTORIETY[b.cca3].rank - NOTORIETY[a.cca3].rank)
    .slice(0, limit);
  const rows = list.map((c) => {
    const continent = CONTINENTS.find((k) => k.match(c));
    return (
      cell(`<strong>${NOTORIETY[c.cca3].rank}ᵉ</strong>`) +
      cell(countryName(c, locale)) +
      cell(locale === 'fr' ? continent.fr : continent.en) +
      cell(capitalName(c, locale)) +
      cell(num(c.population, locale))
    );
  });
  return {
    html: table(
      locale === 'fr'
        ? ['Rang de notoriété', 'Pays', 'Continent', 'Capitale', 'Population']
        : ['Notoriety rank', 'Country', 'Continent', 'Capital', 'Population'],
      rows,
    ),
    items: list.map((c) => countryName(c, locale)),
    name: locale === 'fr' ? 'Les pays les moins connus' : 'The least familiar countries',
  };
}

/** Les pays sans accès à la mer, groupés par continent. */
export function landlockedTable(scope, locale) {
  void scope;
  const list = COUNTRIES.filter((c) => !c.coastline).sort((a, b) => {
    const ka = CONTINENTS.find((k) => k.match(a)).fr;
    const kb = CONTINENTS.find((k) => k.match(b)).fr;
    return ka.localeCompare(kb, 'fr') || a.name.localeCompare(b.name, 'fr');
  });
  const rows = list.map((c) => {
    const continent = CONTINENTS.find((k) => k.match(c));
    const neighbours = NEIGHBOURS.get(c.cca3);
    const doubly =
      neighbours.length > 0 &&
      neighbours.every((n) => {
        const other = COUNTRIES.find((x) => x.cca3 === n);
        return other && !other.coastline;
      });
    return (
      cell(`<strong>${countryName(c, locale)}</strong>`) +
      cell(locale === 'fr' ? continent.fr : continent.en) +
      cell(String(neighbours.length)) +
      cell(doubly ? (locale === 'fr' ? 'Oui' : 'Yes') : '—')
    );
  });
  return {
    html: table(
      locale === 'fr'
        ? ['Pays', 'Continent', 'Voisins', 'Doublement enclavé']
        : ['Country', 'Continent', 'Neighbours', 'Doubly landlocked'],
      rows,
    ),
    items: list.map((c) => countryName(c, locale)),
    name: locale === 'fr' ? 'Les pays sans littoral' : 'Landlocked countries',
  };
}

/** Les plus petits États du monde, par superficie croissante. */
export function smallestTable(scope, locale) {
  const limit = Number(scope) || 15;
  const list = [...COUNTRIES].sort((a, b) => a.area - b.area).slice(0, limit);
  const rows = list.map((c, i) => {
    const continent = CONTINENTS.find((k) => k.match(c));
    return (
      cell(`<strong>${i + 1}</strong>`) +
      cell(countryName(c, locale)) +
      cell(locale === 'fr' ? continent.fr : continent.en) +
      cell(num(c.area, locale)) +
      cell(num(c.population, locale))
    );
  });
  return {
    html: table(
      locale === 'fr'
        ? ['#', 'Pays', 'Continent', 'Superficie (km²)', 'Population']
        : ['#', 'Country', 'Continent', 'Area (km²)', 'Population'],
      rows,
    ),
    items: list.map((c) => countryName(c, locale)),
    name: locale === 'fr' ? 'Les plus petits États du monde' : 'The smallest countries in the world',
  };
}

/** Le tableau demandé par une directive `{{table:famille:portée}}`. */
export const TABLES = {
  flags: flagsTable,
  capitals: capitalsTable,
  countries: countriesTable,
  borders: bordersTable,
  size: sizeTable,
  themes: themesTable,
  'rankle-example': rankleExampleTable,
  'rankle-leaders': rankleLeadersTable,
  continents: continentsTable,
  area: areaTable,
  subregions: subregionsTable,
  modes: modesTable,
  ranks: ranksTable,
  notoriety: notorietyTable,
  landlocked: landlockedTable,
  smallest: smallestTable,
};
