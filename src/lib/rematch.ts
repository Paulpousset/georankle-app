/**
 * La revanche : refaire une partie contre le même adversaire, sans repasser par
 * le matchmaking.
 *
 * Un duel se terminait sur un « Retour au menu » et rien d'autre : rejouer
 * contre la même personne demandait de ressortir, d'ouvrir les amis, de
 * réinviter, de refixer le mode et le BO. La revanche recrée la même partie —
 * même mode, même best-of, mêmes réglages — et se contente de rafraîchir le
 * tirage pour qu'aucun des deux joueurs ne rejoue des questions qu'il connaît
 * déjà.
 *
 * C'est un ACCORD MUTUEL, pas une invitation. La première version insérait un
 * match en status 'waiting' : indiscernable d'une invitation classique, elle
 * déclenchait chez l'adversaire le toast et la modale « Nouveau défi ! ».
 * Désormais le premier clic ne fait que poser une intention sur la ligne du
 * match joué (RPC `request_rematch`, voir rematch.sql) ; le second clic crée la
 * partie, directement en status 'in_progress' — jamais 'waiting', donc jamais
 * d'invitation. Les deux clients y sont envoyés du même coup.
 *
 * `buildClassicSessions` vivait dans l'écran Matchmaking ; il est ici pour que
 * la création d'un match et sa revanche produisent EXACTEMENT le même
 * `game_data` — c'est ce que les deux clients lisent pour jouer la même partie.
 */
import { gameData as gd } from '../data/gameData';
import { pickRoundCountries } from './matchCountries';
import { createSeededRng, seededShuffle } from './rng';
import { supabase } from './supabase';
import type { Json } from '../types/database';
import type { Match, MatchGameData, MatchMode } from '../types';

const SESSION_SIZE = 8;

/** Les 8 thèmes + 8 pays de chaque manche de Rankle, figés à la création. */
export function buildClassicSessions(
  seed: number,
  numRounds: number,
): Record<number, { themeIds: string[]; countryCca3s: string[] }> {
  const sessions: Record<number, { themeIds: string[]; countryCca3s: string[] }> = {};
  for (let r = 1; r <= numRounds; r++) {
    const rand = createSeededRng(seed + (r - 1) * 997);
    const allThemeIds = Object.keys(gd.themes).filter(
      (id) => gd.countries.filter((c) => c.ranks?.[id] !== undefined).length > 10,
    );
    const themeIds = seededShuffle(allThemeIds, rand).slice(0, SESSION_SIZE);
    let countries = gd.countries.filter((c) =>
      themeIds.every((id) => c.ranks?.[id] !== undefined && c.data?.[id] !== undefined),
    );
    if (countries.length < SESSION_SIZE) {
      countries = [...gd.countries].sort(
        (a, b) => Object.keys(b.ranks).length - Object.keys(a.ranks).length,
      );
    }
    const countryCca3s = seededShuffle(countries, rand).slice(0, SESSION_SIZE).map((c) => c.cca3);
    sessions[r] = { themeIds, countryCca3s };
  }
  return sessions;
}

/**
 * Le `game_data` de la revanche : celui du match joué, avec un tirage neuf.
 *
 * On repart de l'existant plutôt que de le reconstruire, pour ne rien perdre
 * des réglages propres au mode (type de question, pays de Régions, id du défi,
 * séquence d'une partie perso…). Seuls les champs dérivés du seed sont
 * régénérés, et uniquement s'ils étaient déjà là — un match qui n'avait pas de
 * `sessions` ne doit pas en gagner.
 */
export function buildRematchGameData(match: Match): MatchGameData {
  const previous = (match.game_data ?? { seed: 0 }) as MatchGameData;
  const seed = Math.floor(Math.random() * 2147483647);
  const next: MatchGameData = { ...previous, seed };

  if (previous.sessions) {
    next.sessions = buildClassicSessions(seed, match.best_of);
  }

  if (previous.roundCountries) {
    // Les modes de la revanche : la séquence d'une partie perso/classée, sinon
    // le mode du match répété sur chaque manche.
    const modes: MatchMode[] =
      previous.modes ??
      previous.rounds?.map((r) => r.mode) ??
      Array.from({ length: match.best_of }, () => match.game_mode);
    // Longueur par manche : on reprend celle du match précédent, elle est déjà
    // la bonne (1 pour Devine le Pays, roundsPerSet ailleurs).
    const perRoundCounts: Record<number, number> = {};
    for (const [round, ids] of Object.entries(previous.roundCountries)) {
      perRoundCounts[Number(round)] = ids.length;
    }
    next.roundCountries = pickRoundCountries(seed, modes, { perRoundCounts });
  }

  return next;
}

/** Ce que renvoie `request_rematch` : on attend l'autre, ou la partie est là. */
export interface RematchRequestResult {
  state: 'waiting' | 'started';
  /** L'id de la revanche, seulement quand `state === 'started'`. */
  matchId: string | null;
  error: string | null;
}

/**
 * Signale qu'on veut la revanche.
 *
 * Le tirage neuf part avec la demande, mais seul celui du PREMIER demandeur est
 * retenu côté serveur : les deux joueurs doivent lire exactement le même
 * `game_data`, et le calculer chacun de son côté donnerait deux seeds.
 *
 * Si l'adversaire avait déjà demandé, la RPC crée la partie et la renvoie —
 * l'appel qui « accepte » est donc le même que celui qui « demande ».
 */
export async function requestRematch(match: Match): Promise<RematchRequestResult> {
  const { data, error } = await supabase.rpc('request_rematch', {
    p_match_id: match.id,
    p_game_data: buildRematchGameData(match) as unknown as Json,
  });
  if (error) return { state: 'waiting', matchId: null, error: error.message };
  const result = (data ?? {}) as { state?: string; match_id?: string };
  return {
    state: result.state === 'started' ? 'started' : 'waiting',
    matchId: result.match_id ?? null,
    error: null,
  };
}

/**
 * Retire sa demande. Quitter l'écran de fin ne doit pas laisser l'adversaire
 * devant un « Accepter la revanche » qui n'attend plus personne. Sans effet si
 * la partie est déjà lancée.
 */
export async function cancelRematch(matchId: string): Promise<void> {
  await supabase.rpc('cancel_rematch', { p_match_id: matchId });
}

/** L'état de la revanche tel qu'il vit sur la ligne du match joué. */
export interface RematchState {
  requestedBy: string | null;
  startedMatchId: string | null;
}

/**
 * Relit l'état de la revanche. Le realtime porte les changements, mais il faut
 * ce premier appel : l'adversaire a pu cliquer avant qu'on arrive sur l'écran
 * de fin. Il sert aussi de filet quand la voie realtime tombe.
 */
export async function fetchRematchState(matchId: string): Promise<RematchState | null> {
  const { data } = await supabase
    .from('matches')
    .select('rematch_requested_by, rematch_match_id')
    .eq('id', matchId)
    .single();
  if (!data) return null;
  return {
    requestedBy: data.rematch_requested_by ?? null,
    startedMatchId: data.rematch_match_id ?? null,
  };
}

/** La ligne complète d'un match, pour démarrer la revanche des deux côtés. */
export async function fetchMatch(matchId: string): Promise<Match | null> {
  const { data } = await supabase.from('matches').select('*').eq('id', matchId).single();
  return (data as Match) ?? null;
}
