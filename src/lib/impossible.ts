/**
 * « L'Impossible du jour » — une question très dure par mode, chaque jour UTC.
 *
 * Même principe que le défi du jour : tout est tiré d'une graine date + mode
 * (`seedFor`), donc la question est la même pour tout le monde et aucun serveur
 * n'a besoin de la stocker. La difficulté vient du choix des sujets (les pays
 * les moins connus, des valeurs au coude-à-coude) et des leurres (pays voisins,
 * même sous-région, voisins de voisins), pas d'un mode de jeu à part.
 *
 * Une seule tentative : la question est marquée « ouverte » avant d'être
 * montrée, et une question ouverte puis abandonnée compte comme ratée. Le
 * serveur (`submit_impossible`) n'accepte qu'une réponse par jour et par mode.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { GameMode, Language } from '../types';
import rawCountriesStats from '../../assets/countries_stats.json';
import { gameData } from '../data/gameData';
import { createSeededRng, seededShuffle } from './rng';
import { seedFor, getTodayUTC } from './daily';
import { borderNeighbors } from './borders';
import { silhouetteCountries } from './silhouette';
import { capitalName, countryName } from './geoNames';
import { supabase } from './supabase';
import { track } from './analytics';
import { tr } from '../i18n';

/** Les six modes de l'Impossible, dans l'ordre d'affichage. */
export const IMPOSSIBLE_MODES = [
  'quiz-flag',
  'quiz-capital',
  'silhouette',
  'higherlower',
  'borders',
  'classic',
] as const satisfies readonly GameMode[];
export type ImpossibleMode = (typeof IMPOSSIBLE_MODES)[number];

/** Secondes pour répondre ; au-delà, c'est raté. */
export const IMPOSSIBLE_SECONDS = 20;

interface Stat {
  cca3: string;
  name: string;
  name_en: string;
  capital: string;
  capital_fr: string;
  region: string;
  subregion: string;
  population: number;
}

const STATS = (rawCountriesStats as Stat[]).filter((s) => s.population > 0);
const STAT_BY_ID = new Map(STATS.map((s) => [s.cca3, s]));

/** Les pays du moins peuplé au plus peuplé : en haut de liste, les moins connus. */
const BY_POPULATION = [...STATS].sort((a, b) => a.population - b.population).map((s) => s.cca3);
/** Le vivier des sujets « obscurs » : le tiers le moins peuplé. */
const OBSCURE = new Set(BY_POPULATION.slice(0, 70));

/** Thèmes chiffrés assez complets et assez parlants pour Plus/Moins et Classement. */
const HARD_THEMES = [
  'population',
  'area',
  'population_density',
  'gdp_per_capita',
  'life_expectancy',
  'forest_area',
  'coastline_length',
  'internet_users',
  'urban_population',
  'tourist_arrivals',
  'highest_point',
  'avg_temperature',
  'co2_emissions_pc',
  'fertility_rate',
];

export type ImpossibleKind = 'flag' | 'capital' | 'silhouette' | 'higher' | 'border' | 'rank';

export interface ImpossibleQuestion {
  mode: ImpossibleMode;
  kind: ImpossibleKind;
  /** Le pays sur lequel porte la question (drapeau, capitale, silhouette, frontière, rang). */
  subject?: string;
  /** Thème chiffré (Plus/Moins, Classement). */
  themeId?: string;
  /** Identifiants des options dans l'ordre d'affichage (cca3, ou rang pour Classement). */
  options: string[];
  answer: string;
}

// ── Valeurs des thèmes ───────────────────────────────────────────────────────

function themeValue(cca3: string, themeId: string): number | null {
  const country = gameData.countries.find((c) => c.cca3 === cca3);
  const v = (country?.data as Record<string, { value?: number | null }> | undefined)?.[themeId]
    ?.value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** La ligne d'affichage d'une valeur (« 👥 Population : 42 647 492 hab. »). */
export function themeDisplay(cca3: string, themeId: string, language: Language): string {
  const country = gameData.countries.find((c) => c.cca3 === cca3);
  const entry = (
    country?.data as Record<string, { display_fr?: string; display_en?: string }> | undefined
  )?.[themeId];
  if (!entry) return '';
  const raw = language === 'fr' ? entry.display_fr : entry.display_en;
  // Garde la valeur seule : « Population : 42 647 492 hab. » → « 42 647 492 hab. »
  return (raw ?? '').replace(/^.*?:\s*/, '');
}

export function themeLabel(themeId: string, language: Language): string {
  const theme = gameData.themes[themeId];
  if (!theme) return themeId;
  return tr(language, theme.label.fr, theme.label.en);
}

/** Les pays ayant une valeur pour le thème, du plus grand au plus petit. */
function ranked(themeId: string): { cca3: string; value: number }[] {
  return gameData.countries
    .map((c) => ({ cca3: c.cca3, value: themeValue(c.cca3, themeId) }))
    .filter((e): e is { cca3: string; value: number } => e.value !== null && STAT_BY_ID.has(e.cca3))
    .sort((a, b) => b.value - a.value);
}

// ── Génération ───────────────────────────────────────────────────────────────

/** Les leurres les plus proches : même sous-région, puis même continent. */
function lookalikes(subject: string, pool: string[], rand: () => number, count: number): string[] {
  const s = STAT_BY_ID.get(subject);
  const others = pool.filter((c) => c !== subject && STAT_BY_ID.has(c));
  const sameSub = others.filter((c) => STAT_BY_ID.get(c)!.subregion === s?.subregion);
  const sameRegion = others.filter(
    (c) => STAT_BY_ID.get(c)!.region === s?.region && !sameSub.includes(c),
  );
  const rest = others.filter((c) => !sameSub.includes(c) && !sameRegion.includes(c));
  return [
    ...seededShuffle(sameSub, rand),
    ...seededShuffle(sameRegion, rand),
    ...seededShuffle(rest, rand),
  ].slice(0, count);
}

function pickObscure(rand: () => number, pool: string[]): string {
  const candidates = pool.filter((c) => OBSCURE.has(c));
  return seededShuffle(candidates.length ? candidates : pool, rand)[0];
}

function buildChoice(
  mode: ImpossibleMode,
  kind: 'flag' | 'capital' | 'silhouette',
  rand: () => number,
  pool: string[],
): ImpossibleQuestion {
  const subject = pickObscure(rand, pool);
  const options = seededShuffle([subject, ...lookalikes(subject, pool, rand, 5)], rand);
  return { mode, kind, subject, options, answer: subject };
}

/** Plus/Moins : quatre pays aux valeurs consécutives, lequel est devant ? */
function buildHigher(rand: () => number): ImpossibleQuestion {
  const themeId = HARD_THEMES[Math.floor(rand() * HARD_THEMES.length)];
  const list = ranked(themeId);
  // Une fenêtre de 4 valeurs voisines et toutes distinctes, hors du top 10
  // (trop connu).
  for (let tries = 0; tries < 50; tries++) {
    const start = 10 + Math.floor(rand() * Math.max(1, list.length - 14));
    const window = list.slice(start, start + 4);
    if (window.length === 4 && new Set(window.map((w) => w.value)).size === 4) {
      return {
        mode: 'higherlower',
        kind: 'higher',
        themeId,
        options: seededShuffle(
          window.map((w) => w.cca3),
          rand,
        ),
        answer: window[0].cca3,
      };
    }
  }
  const window = list.slice(20, 24);
  return {
    mode: 'higherlower',
    kind: 'higher',
    themeId,
    options: seededShuffle(
      window.map((w) => w.cca3),
      rand,
    ),
    answer: window[0].cca3,
  };
}

/** Frontières : un seul des six pays touche le sujet ; les autres en sont tout près. */
function buildBorder(rand: () => number): ImpossibleQuestion {
  const all = STATS.map((s) => s.cca3);
  const candidates = seededShuffle(
    all.filter((c) => borderNeighbors(c).length >= 2),
    rand,
  );
  for (const subject of candidates) {
    const neighbors = new Set(borderNeighbors(subject));
    // Voisins de voisins qui ne touchent pas le sujet : les meilleurs leurres.
    const second = new Set<string>();
    for (const n of neighbors) for (const nn of borderNeighbors(n)) second.add(nn);
    const decoys = [...second].filter(
      (c) => c !== subject && !neighbors.has(c) && STAT_BY_ID.has(c),
    );
    const extra = lookalikes(
      subject,
      all.filter((c) => !neighbors.has(c) && !decoys.includes(c)),
      rand,
      5,
    );
    const distractors = [...seededShuffle(decoys, rand), ...extra].slice(0, 5);
    if (distractors.length < 5) continue;
    const answer = seededShuffle(
      [...neighbors].filter((n) => STAT_BY_ID.has(n)),
      rand,
    )[0];
    if (!answer) continue;
    return {
      mode: 'borders',
      kind: 'border',
      subject,
      options: seededShuffle([answer, ...distractors], rand),
      answer,
    };
  }
  // Repli impossible en pratique (le jeu a plus de 150 pays frontaliers).
  return {
    mode: 'borders',
    kind: 'border',
    subject: 'FRA',
    options: ['ESP', 'PRT', 'NLD', 'AUT', 'DNK', 'GBR'],
    answer: 'ESP',
  };
}

/** Classement : le rang mondial exact d'un pays peu connu, parmi six rangs voisins. */
function buildRank(rand: () => number): ImpossibleQuestion {
  const themeId = HARD_THEMES[Math.floor(rand() * HARD_THEMES.length)];
  const list = ranked(themeId);
  const obscure = list.filter((e) => OBSCURE.has(e.cca3));
  const pick = seededShuffle(obscure.length ? obscure : list, rand)[0];
  const rank = list.findIndex((e) => e.cca3 === pick.cca3) + 1;
  const offset = Math.floor(rand() * 6);
  let first = rank - offset;
  first = Math.max(1, Math.min(first, list.length - 5));
  const options = Array.from({ length: 6 }, (_, i) => String(first + i));
  return {
    mode: 'classic',
    kind: 'rank',
    subject: pick.cca3,
    themeId,
    options,
    answer: String(rank),
  };
}

/** La question du jour pour un mode — pure et déterministe. */
export function buildImpossibleQuestion(date: string, mode: ImpossibleMode): ImpossibleQuestion {
  const rand = createSeededRng(seedFor(date, `impossible:${mode}` as GameMode));
  switch (mode) {
    case 'quiz-flag':
      return buildChoice(
        mode,
        'flag',
        rand,
        STATS.map((s) => s.cca3),
      );
    case 'quiz-capital':
      return buildChoice(
        mode,
        'capital',
        rand,
        // Une capitale qui porte le nom du pays (Singapour, Koweït…) serait offerte.
        STATS.filter((s) => s.capital && !s.name.includes(s.capital_fr || s.capital)).map(
          (s) => s.cca3,
        ),
      );
    case 'silhouette':
      return buildChoice(mode, 'silhouette', rand, silhouetteCountries());
    case 'higherlower':
      return buildHigher(rand);
    case 'borders':
      return buildBorder(rand);
    case 'classic':
      return buildRank(rand);
  }
}

// ── Textes ───────────────────────────────────────────────────────────────────

export function countryLabel(cca3: string, language: Language): string {
  const s = STAT_BY_ID.get(cca3);
  return s ? countryName(s, language) : cca3;
}

export function impossibleModeLabel(mode: ImpossibleMode, language: Language): string {
  switch (mode) {
    case 'quiz-flag':
      return tr(language, 'Drapeaux', 'Flags');
    case 'quiz-capital':
      return tr(language, 'Capitales', 'Capitals');
    case 'silhouette':
      return tr(language, 'Silhouette', 'Silhouette');
    case 'higherlower':
      return tr(language, 'Plus ou moins', 'Higher or lower');
    case 'borders':
      return tr(language, 'Frontières', 'Borders');
    case 'classic':
      return tr(language, 'Classement', 'Ranking');
  }
}

export function impossiblePrompt(q: ImpossibleQuestion, language: Language): string {
  const subject = q.subject ? countryLabel(q.subject, language) : '';
  switch (q.kind) {
    case 'flag':
      return tr(
        language,
        'À quel pays appartient ce drapeau ?',
        'Which country does this flag belong to?',
      );
    case 'capital':
      return tr(language, 'Quelle est la capitale de {0} ?', 'What is the capital of {0}?', [
        subject,
      ]);
    case 'silhouette':
      return tr(language, 'Quel pays a cette forme ?', 'Which country has this shape?');
    case 'higher':
      return tr(language, 'Lequel est devant en « {0} » ?', 'Which one ranks highest for “{0}”?', [
        themeLabel(q.themeId!, language),
      ]);
    case 'border':
      return tr(
        language,
        'Un seul de ces pays a une frontière terrestre avec {0}. Lequel ?',
        'Only one of these countries shares a land border with {0}. Which?',
        [subject],
      );
    case 'rank':
      return tr(
        language,
        'Quel est le rang mondial de {0} en « {1} » ?',
        'What is {0}’s world rank for “{1}”?',
        [subject, themeLabel(q.themeId!, language)],
      );
  }
}

export function impossibleOptionLabel(
  q: ImpossibleQuestion,
  id: string,
  language: Language,
): string {
  if (q.kind === 'rank') return tr(language, '{0}e', '#{0}', [id]);
  if (q.kind === 'capital') {
    const s = STAT_BY_ID.get(id);
    return s ? capitalName(s, language) : id;
  }
  return countryLabel(id, language);
}

/** La phrase d'explication montrée après la réponse. */
export function impossibleReveal(q: ImpossibleQuestion, language: Language): string {
  switch (q.kind) {
    case 'flag':
    case 'silhouette':
      return countryLabel(q.answer, language);
    case 'capital':
      return tr(language, '{0} : {1}', '{0}: {1}', [
        countryLabel(q.answer, language),
        impossibleOptionLabel(q, q.answer, language),
      ]);
    case 'higher':
      return q.options
        .map((c) => ({ c, v: themeValue(c, q.themeId!) ?? 0 }))
        .sort((a, b) => b.v - a.v)
        .map(({ c }) => `${countryLabel(c, language)} · ${themeDisplay(c, q.themeId!, language)}`)
        .join('\n');
    case 'border':
      return tr(language, '{0} touche {1}.', '{0} borders {1}.', [
        countryLabel(q.answer, language),
        countryLabel(q.subject!, language),
      ]);
    case 'rank':
      return tr(language, '{0} : {1}e au monde ({2})', '{0}: #{1} in the world ({2})', [
        countryLabel(q.subject!, language),
        q.answer,
        themeDisplay(q.subject!, q.themeId!, language),
      ]);
  }
}

// ── État local (une tentative) ───────────────────────────────────────────────

export interface ImpossibleAnswer {
  /** null tant que la question est ouverte sans réponse. */
  correct: boolean | null;
  ms: number;
  choice?: string;
  /** Envoyé au serveur. */
  synced?: boolean;
}

export interface ImpossibleState {
  date: string;
  answers: Partial<Record<ImpossibleMode, ImpossibleAnswer>>;
}

const KEY = 'impossible:state';

export async function getImpossibleState(today = getTodayUTC()): Promise<ImpossibleState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as ImpossibleState) : null;
    if (parsed && parsed.date === today) return parsed;
  } catch {
    // Cache illisible : on repart d'une journée vierge.
  }
  return { date: today, answers: {} };
}

async function save(state: ImpossibleState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Au pire, la journée se rejoue en local ; le serveur garde la 1re réponse.
  }
}

/**
 * À l'ouverture de l'écran : une question ouverte puis abandonnée (appli
 * quittée en pleine question) devient une réponse ratée, enregistrée et
 * envoyée comme les autres.
 */
export async function settleAbandoned(
  signedIn: boolean,
  date = getTodayUTC(),
): Promise<ImpossibleState> {
  const state = await getImpossibleState(date);
  let changed = false;
  for (const mode of IMPOSSIBLE_MODES) {
    const a = state.answers[mode];
    if (a && a.correct === null) {
      state.answers[mode] = { correct: false, ms: IMPOSSIBLE_SECONDS * 1000, choice: '' };
      changed = true;
    }
  }
  if (changed) await save(state);
  if (signedIn) {
    for (const mode of IMPOSSIBLE_MODES) {
      const a = state.answers[mode];
      if (a && a.correct !== null && !a.synced) await syncImpossible(mode, state);
    }
  }
  return state;
}

/** Marque la question comme ouverte AVANT de l'afficher (pas de seconde chance). */
export async function openImpossible(mode: ImpossibleMode, date = getTodayUTC()): Promise<void> {
  const state = await getImpossibleState(date);
  if (state.answers[mode]) return;
  state.answers[mode] = { correct: null, ms: 0 };
  await save(state);
  track('impossible_open', { mode });
}

export interface ImpossibleSubmitResult {
  players: number;
  winners: number;
  coins: number;
}

/** Enregistre la réponse (localement, puis sur le serveur si connecté). */
export async function answerImpossible(
  mode: ImpossibleMode,
  choice: string | null,
  correct: boolean,
  ms: number,
  signedIn: boolean,
  date = getTodayUTC(),
): Promise<ImpossibleSubmitResult | null> {
  const state = await getImpossibleState(date);
  const prev = state.answers[mode];
  // Déjà répondu : la première réponse fait foi.
  if (prev && prev.correct !== null) return null;
  state.answers[mode] = { correct, ms, choice: choice ?? '' };
  await save(state);
  track('impossible_answer', { mode, correct, ms });
  if (!signedIn) return null;
  return syncImpossible(mode, state);
}

async function syncImpossible(
  mode: ImpossibleMode,
  state: ImpossibleState,
): Promise<ImpossibleSubmitResult | null> {
  const a = state.answers[mode];
  if (!a || a.correct === null) return null;
  const { data, error } = await supabase.rpc('submit_impossible', {
    p_date: state.date,
    p_mode: mode,
    p_correct: a.correct,
    p_ms: Math.round(a.ms),
  });
  if (error) return null;
  a.synced = true;
  await save(state);
  const r = (data ?? {}) as { players?: number; winners?: number; coins?: number };
  return { players: r.players ?? 0, winners: r.winners ?? 0, coins: r.coins ?? 0 };
}

export function impossibleSummary(state: ImpossibleState): { answered: number; correct: number } {
  const answers = IMPOSSIBLE_MODES.map((m) => state.answers[m]).filter(
    Boolean,
  ) as ImpossibleAnswer[];
  return {
    answered: answers.length,
    correct: answers.filter((a) => a.correct === true).length,
  };
}

// ── Classement et taux de réussite ───────────────────────────────────────────

export interface ImpossibleRow {
  user_id: string;
  username: string | null;
  correct: number;
  answered: number;
  total_ms: number;
}

export async function fetchImpossibleLeaderboard(date = getTodayUTC()): Promise<ImpossibleRow[]> {
  const { data, error } = await supabase.rpc('impossible_leaderboard', {
    p_date: date,
    p_limit: 50,
  });
  if (error) throw error;
  return (data ?? []) as ImpossibleRow[];
}

export async function fetchImpossibleStats(
  date = getTodayUTC(),
): Promise<Partial<Record<ImpossibleMode, { players: number; winners: number }>>> {
  const { data, error } = await supabase.rpc('impossible_day_stats', { p_date: date });
  if (error || !data) return {};
  const out: Partial<Record<ImpossibleMode, { players: number; winners: number }>> = {};
  for (const row of data as { game_mode: ImpossibleMode; players: number; winners: number }[]) {
    out[row.game_mode] = { players: row.players, winners: row.winners };
  }
  return out;
}
