/**
 * Les fiches pays : le tableau de données et les listes de liens.
 *
 * Le texte d'une fiche est écrit à la main (200 à 400 mots, propre au pays) ;
 * ce module ne fournit que ce qui vient des données du jeu — capitale,
 * population, superficie, rangs, densité, voisins — pour qu'aucun chiffre ne
 * soit saisi à la main. Rangs et densité sont calculés ici, jamais recopiés.
 */
import { CONTINENTS } from './continents.mjs';
import { COUNTRIES, NEIGHBOURS, byCca3, capitalName, countryName, flagUrl, num } from './data.mjs';
import { COUNTRY_PAGES, exists, href } from './routes.mjs';
import { attr } from './layout.mjs';

const idOf = (cca3) => `country-${cca3.toLowerCase()}`;

/** Le rang (1 = le plus grand) d'un pays selon un champ numérique. */
function rankBy(country, field) {
  return 1 + COUNTRIES.filter((c) => c[field] > country[field]).length;
}

/** Un nom de pays, avec un lien quand sa fiche existe dans cette langue. */
function link(country, locale) {
  const name = countryName(country, locale);
  const id = idOf(country.cca3);
  return COUNTRY_PAGES.some((p) => p.cca3 === country.cca3) && exists(id, locale)
    ? `<a href="${href(id, locale)}">${name}</a>`
    : name;
}

function row(label, value) {
  return `            <tr><th scope="row">${label}</th><td>${value}</td></tr>`;
}

/** Le tableau d'identité d'un pays. */
export function countryFacts(cca3, locale) {
  const c = byCca3(cca3);
  if (!c) throw new Error(`fiche pays : ${cca3} absent des données du jeu`);
  const fr = locale === 'fr';
  const continent = CONTINENTS.find((k) => k.match(c));
  const density = c.population / c.area;
  const densityText = density >= 10 ? num(Math.round(density), locale) : num(Math.round(density * 10) / 10, locale);
  const neighbours = NEIGHBOURS.get(cca3) ?? [];
  const rank = (n) => (fr ? (n === 1 ? '1ᵉʳ' : `${n}ᵉ`) : `#${n}`);
  const rows = [
    row(fr ? 'Drapeau' : 'Flag', `<img src="${flagUrl(cca3)}" alt="${attr(`${fr ? 'Drapeau de' : 'Flag of'} ${countryName(c, locale)}`)}" width="40" height="27" loading="lazy" decoding="async" />`),
    row(fr ? 'Capitale' : 'Capital', capitalName(c, locale)),
    row(fr ? 'Continent (découpage du jeu)' : 'Continent (game split)', fr ? continent.fr : continent.en),
    row(fr ? 'Population' : 'Population', `${num(c.population, locale)} (${fr ? 'rang mondial' : 'world rank'} ${rank(rankBy(c, 'population'))} / ${COUNTRIES.length})`),
    row(fr ? 'Superficie' : 'Area', `${num(Math.round(c.area), locale)} km² (${fr ? 'rang mondial' : 'world rank'} ${rank(rankBy(c, 'area'))} / ${COUNTRIES.length})`),
    row(fr ? 'Densité' : 'Density', `${densityText} ${fr ? 'hab./km²' : 'people/km²'}`),
    row(fr ? 'Accès à la mer' : 'Coastline', c.coastline ? (fr ? 'Oui' : 'Yes') : fr ? 'Non (pays enclavé)' : 'No (landlocked)'),
    row(
      fr ? `Voisins terrestres jouables (${neighbours.length})` : `Playable land neighbours (${neighbours.length})`,
      neighbours.length ? neighbours.map((n) => link(byCca3(n), locale)).sort().join(', ') : fr ? 'Aucun' : 'None',
    ),
  ];
  return {
    html:
      '      <div class="table-wrap">\n        <table>\n          <tbody>\n' + rows.join('\n') + '\n          </tbody>\n        </table>\n      </div>',
  };
}

/** La liste des fiches publiées dans cette langue, par ordre de population. */
export function countryList(locale) {
  const items = COUNTRY_PAGES.filter((p) => exists(idOf(p.cca3), locale))
    .map((p) => byCca3(p.cca3))
    .sort((a, b) => b.population - a.population)
    .map((c) => `        <li><a href="${href(idOf(c.cca3), locale)}">${countryName(c, locale)}</a></li>`);
  return `<ul>\n${items.join('\n')}\n      </ul>`;
}
