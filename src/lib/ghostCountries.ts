/**
 * « Pays fantômes » — les défis d'Halloween, joués sur les plateaux existants :
 * Silhouette, Quiz Pays (capitales), Point sur le Globe et À l'échelle. Les
 * questions gardent la forme de chaque mode, mais leurs réponses sont des ids
 * de src/data/ghostCountries.ts (en minuscules, jamais un cca3).
 */
import type { Language } from '../types';
import rawCountriesStats from '../../assets/countries_stats.json';
import { GHOST_COUNTRIES, type GhostCountry } from '../data/ghostCountries';
import type { Challenge, ChallengeEntity } from '../data/challenges';
import { capitalAnswerNames, capitalName } from './geoNames';
import { samplePinpoint, type PinpointQuestion } from './pinpoint';
import { createSeededRng, seededShuffle } from './rng';
import {
  fitPath,
  projectLngLatRings,
  silhouetteCountryName,
  unionLngLatRings,
  type SilhouetteQuestion,
} from './silhouette';
import { tr } from '../i18n';

interface StatEntry {
  cca3: string;
  capital: string;
  capital_fr?: string;
  lat: number;
  lng: number;
  area?: number;
}
const STATS_BY_ID = new Map((rawCountriesStats as StatEntry[]).map((s) => [s.cca3, s]));

const BY_ID = new Map(GHOST_COUNTRIES.map((g) => [g.id, g]));

/** Un id de pays fantôme (et non un cca3) ? */
export function isGhostId(id: string): boolean {
  return BY_ID.has(id);
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

/** Les anneaux [lng, lat] de la silhouette d'époque (vide si id inconnu). */
export function ghostLngLatRings(id: string): number[][][] {
  const g = BY_ID.get(id);
  if (!g) return [];
  return [...unionLngLatRings(g.members), ...(g.patches ?? [])].filter(
    (ring) => g.maxLat === undefined || ring.every(([, lat]) => lat <= g.maxLat!),
  );
}

/** Superficie (km²) : la somme des pays actuels qui le composent. */
export function ghostArea(id: string): number | null {
  const g = BY_ID.get(id);
  if (!g) return null;
  let total = 0;
  for (const cca3 of g.members) total += STATS_BY_ID.get(cca3)?.area ?? 0;
  return total || null;
}

const PATH_CACHE = new Map<string, string | null>();

/** Le tracé SVG de la silhouette d'époque, dans un viewBox `size`×`size`. */
export function ghostPath(id: string, size = 100): string | null {
  const key = `${id}:${size}`;
  if (PATH_CACHE.has(key)) return PATH_CACHE.get(key)!;
  const rings = ghostLngLatRings(id);
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

// ── Capitales fantômes (plateau du Quiz Pays) ────────────────────────────────

let capitalsChallenge: Challenge | null = null;

/**
 * « Capitales fantômes » : le nom du pays disparu → sa capitale d'alors. Hors
 * de CHALLENGES (dont l'ordre est un contrat pour `challengeForSeed`) : seul le
 * défi du jour des jours hantés le joue.
 */
export function ghostCapitalsChallenge(): Challenge {
  if (capitalsChallenge) return capitalsChallenge;
  const entities: ChallengeEntity[] = [];
  for (const g of GHOST_COUNTRIES) {
    const cap = g.capital;
    if (!cap) continue;
    const base = { id: g.id, promptFr: g.names.fr, promptEn: g.names.en, promptI18n: g.names };
    if ('cca3' in cap) {
      const stat = STATS_BY_ID.get(cap.cca3);
      if (!stat) continue;
      const answerI18n = Object.fromEntries(
        (Object.keys(g.names) as Language[]).map((lang) => [lang, capitalName(stat, lang)]),
      ) as Record<Language, string>;
      entities.push({
        ...base,
        answerFr: answerI18n.fr,
        answerEn: answerI18n.en,
        answerI18n,
        aliases: capitalAnswerNames(stat),
      });
    } else {
      entities.push({ ...base, answerFr: cap.fr, answerEn: cap.en, aliases: cap.aliases });
    }
  }
  capitalsChallenge = {
    id: 'ghost-capitals',
    country: 'GHOST',
    emoji: '👻',
    titleFr: 'Capitales fantômes',
    titleEn: 'Ghost capitals',
    subtitleFr: 'La capitale des pays disparus',
    subtitleEn: 'The capitals of vanished countries',
    questionFr: 'Quelle était la capitale de ce pays disparu {0} ?',
    questionEn: 'What was the capital of this vanished country {0}?',
    promptKind: 'text',
    answerKind: 'name',
    entities,
  };
  return capitalsChallenge;
}

// ── Globe hanté (plateau de Point sur le Globe) ──────────────────────────────

export interface GhostPinpointQuestion extends PinpointQuestion {
  /** Le pays actuel où tombe le point (cadrage du globe). */
  frame: string;
}

/** Distance angulaire grossière (degrés) entre un point et un pays actuel. */
function degreesTo(lat: number, lng: number, cca3: string): number {
  const s = STATS_BY_ID.get(cca3);
  if (!s) return Infinity;
  const dLng = Math.abs(((lng - s.lng + 540) % 360) - 180) * Math.cos((lat * Math.PI) / 180);
  return Math.hypot(lat - s.lat, dLng);
}

/**
 * Un point tombe dans un pays actuel ; à quel pays fantôme appartenait-il ? Les
 * leurres sont les fantômes les plus proches du point (comme pour le mode
 * normal), pour que la Grande Colombie hésite avec l'Amérique centrale.
 */
export function buildGhostPinpointRun(seed: number, count = 5): GhostPinpointQuestion[] {
  const rng = createSeededRng(seed);
  const ids = GHOST_COUNTRIES.map((g) => g.id);
  const answers = seededShuffle(ids, rng).slice(0, Math.min(count, ids.length));
  return answers.map((answer) => {
    const g = BY_ID.get(answer)!;
    const frame = g.members[Math.floor(rng() * g.members.length)];
    const point = samplePinpoint(frame, rng) ?? { lat: 0, lng: 0 };
    const near = (id: string) =>
      Math.min(...BY_ID.get(id)!.members.map((m) => degreesTo(point.lat, point.lng, m)));
    const distractors = ids
      .filter((id) => id !== answer)
      .sort((a, b) => near(a) - near(b))
      .slice(0, 3);
    return {
      answer,
      frame,
      lat: point.lat,
      lng: point.lng,
      distractors,
      options: seededShuffle([answer, ...distractors], rng),
    };
  });
}

/** Les pays actuels à colorier sur le globe pour un fantôme. */
export function ghostMembers(id: string): string[] {
  return BY_ID.get(id)?.members ?? [];
}
