/**
 * « Pays fantômes » — le défi d'Halloween, joué sur le plateau de la Silhouette
 * (DUO / CARRÉ / CASH). Les questions ont la même forme qu'une
 * `SilhouetteQuestion`, mais `answer` et `options` sont des ids de
 * src/data/ghostCountries.ts, pas des cca3.
 */
import type { Language } from '../types';
import { GHOST_COUNTRIES, GHOST_DAYS, type GhostCountry } from '../data/ghostCountries';
import { createSeededRng, seededShuffle } from './rng';
import {
  fitPath,
  projectLngLatRings,
  silhouetteCountryName,
  unionLngLatRings,
  type SilhouetteQuestion,
} from './silhouette';
import { tr } from '../i18n';

const BY_ID = new Map(GHOST_COUNTRIES.map((g) => [g.id, g]));

/** Le slot « Silhouette » du défi du jour est-il « Pays fantômes » ce jour-là ? */
export function isGhostDay(date: string): boolean {
  return GHOST_DAYS.includes(date);
}

/** Une manche seedée : réponses sans doublon, trois leurres pris parmi les autres fantômes. */
export function buildGhostRun(seed: number, count = 5): SilhouetteQuestion[] {
  const rng = createSeededRng(seed);
  const ids = GHOST_COUNTRIES.map((g) => g.id);
  const answers = seededShuffle(ids, rng).slice(0, Math.min(count, ids.length));
  return answers.map((answer) => {
    const distractors = seededShuffle(
      ids.filter((id) => id !== answer),
      rng,
    ).slice(0, 3);
    return { answer, options: seededShuffle([answer, ...distractors], rng) };
  });
}

export function ghostCountry(id: string): GhostCountry | undefined {
  return BY_ID.get(id);
}

export function ghostName(id: string, language: Language): string {
  const g = BY_ID.get(id);
  return g ? g.names[language] || g.names.en : id;
}

/** Comme la Silhouette : toutes les langues sont acceptées en CASH, plus les sigles. */
export function ghostAcceptedAnswers(id: string): string[] {
  const g = BY_ID.get(id);
  if (!g) return [id];
  return Array.from(new Set([...Object.values(g.names), ...(g.aliases ?? [])]));
}

const PATH_CACHE = new Map<string, string | null>();

/** Le tracé SVG de la silhouette d'époque, dans un viewBox `size`×`size`. */
export function ghostPath(id: string, size = 100): string | null {
  const key = `${id}:${size}`;
  if (PATH_CACHE.has(key)) return PATH_CACHE.get(key)!;
  const g = BY_ID.get(id);
  const rings = g
    ? [...unionLngLatRings(g.members), ...(g.patches ?? [])].filter(
        (ring) => g.maxLat === undefined || ring.every(([, lat]) => lat <= g.maxLat!),
      )
    : [];
  const d = rings.length ? fitPath(projectLngLatRings(rings), size) : null;
  PATH_CACHE.set(key, d);
  return d;
}

/**
 * La ligne affichée après la réponse : la période, puis ce qu'il en reste
 * aujourd'hui (« 1918–1992 · Aujourd'hui : Tchéquie, Slovaquie »).
 */
export function ghostFactLine(id: string, language: Language): string {
  const g = BY_ID.get(id);
  if (!g) return '';
  const today =
    g.members.length > 7
      ? tr(language, '{0} pays aujourd’hui', '{0} countries today', [g.members.length])
      : tr(language, 'Aujourd’hui : {0}', 'Today: {0}', [
          g.members.map((cca3) => silhouetteCountryName(cca3, language)).join(', '),
        ]);
  return `${g.years} · ${today}`;
}
