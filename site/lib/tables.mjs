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
import { COUNTRIES, NEIGHBOURS, NOTORIETY, RANKS, THEMES, capitalName, countryName, flagUrl, num } from './data.mjs';
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
  continents: continentsTable,
  area: areaTable,
  subregions: subregionsTable,
  modes: modesTable,
  ranks: ranksTable,
  notoriety: notorietyTable,
  landlocked: landlockedTable,
  smallest: smallestTable,
};
