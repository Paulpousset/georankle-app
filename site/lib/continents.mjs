/**
 * Les six continents *éditoriaux* du site, et leur traduction en filtres sur
 * `assets/countries_stats.json`.
 *
 * ⚠️ Le jeu, lui, n'en connaît que cinq (`src/data/continents.ts`) : les
 * Amériques y sont un bloc unique, parce que c'est un **périmètre de jeu** — le
 * choix de zone en solo. Y toucher changerait des tirages. Le site a besoin du
 * découpage usuel en français, où l'Amérique du Nord et l'Amérique du Sud sont
 * deux entrées de recherche distinctes ; on le reconstruit donc ici, à partir
 * du champ `subregion`, sans jamais modifier la source côté app.
 *
 * Convention retenue pour l'Amérique du Nord : au sens large, Amérique centrale
 * et Caraïbes incluses (23 pays), comme dans l'enseignement francophone. Les
 * pages concernées l'annoncent explicitement au lecteur plutôt que de laisser
 * planer le doute — c'est aussi ce qui les rend utiles.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './paths.mjs';

const STATS = JSON.parse(readFileSync(join(ROOT, 'assets', 'countries_stats.json'), 'utf8'));

/**
 * `match` reçoit une entrée de countries_stats et dit si elle appartient au
 * continent. Tout passe par `region`/`subregion`, jamais par une liste de pays
 * en dur : un pays ajouté au jeu tombe automatiquement dans la bonne page.
 */
export const CONTINENTS = [
  {
    id: 'europe',
    fr: 'Europe',
    en: 'Europe',
    frDe: "d'Europe",
    match: (c) => c.region === 'Europe',
  },
  {
    id: 'afrique',
    fr: 'Afrique',
    en: 'Africa',
    frDe: "d'Afrique",
    match: (c) => c.region === 'Africa',
  },
  {
    id: 'asie',
    fr: 'Asie',
    en: 'Asia',
    frDe: "d'Asie",
    match: (c) => c.region === 'Asia',
  },
  {
    id: 'amerique-du-nord',
    fr: 'Amérique du Nord',
    en: 'North America',
    frDe: "d'Amérique du Nord",
    match: (c) =>
      c.region === 'Americas' &&
      ['North America', 'Central America', 'Caribbean'].includes(c.subregion),
  },
  {
    id: 'amerique-du-sud',
    fr: 'Amérique du Sud',
    en: 'South America',
    frDe: "d'Amérique du Sud",
    match: (c) => c.region === 'Americas' && c.subregion === 'South America',
  },
  {
    id: 'oceanie',
    fr: 'Océanie',
    en: 'Oceania',
    frDe: "d'Océanie",
    match: (c) => c.region === 'Oceania',
  },
];

/** Les pays d'un continent, triés par nom français. */
export function countriesOf(continentId) {
  const continent = CONTINENTS.find((c) => c.id === continentId);
  if (!continent) throw new Error(`continent inconnu : ${continentId}`);
  return STATS.filter(continent.match).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Le continent d'un pays (par cca3), ou `undefined`. */
export function continentOf(cca3) {
  const country = STATS.find((c) => c.cca3 === cca3);
  return country && CONTINENTS.find((k) => k.match(country));
}

/**
 * Garde-fou : les six continents doivent couvrir exactement les 195 pays, sans
 * trou ni doublon. Un `subregion` renommé en amont casserait silencieusement
 * une page entière — ici, il casse le build.
 */
export function assertPartition() {
  const seen = new Map();
  for (const continent of CONTINENTS) {
    for (const country of STATS.filter(continent.match)) {
      if (seen.has(country.cca3)) {
        throw new Error(
          `${country.name} appartient à deux continents : ${seen.get(country.cca3)} et ${continent.id}`,
        );
      }
      seen.set(country.cca3, continent.id);
    }
  }
  const missing = STATS.filter((c) => !seen.has(c.cca3));
  if (missing.length) {
    throw new Error(
      `pays sans continent : ${missing.map((c) => `${c.name} (${c.region}/${c.subregion})`).join(', ')}`,
    );
  }
  return seen.size;
}

export { STATS };
