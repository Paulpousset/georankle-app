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

export interface RematchResult {
  match: Match | null;
  error: string | null;
}

/**
 * Crée la revanche et prévient l'adversaire. Le créateur devient joueur 1 quel
 * que soit son rôle précédent : c'est lui qui lance, donc lui qui attend.
 *
 * Jamais de revanche classée : un match classé se relance par la file classée,
 * qui seule apparie sur l'ELO — l'appelant ne doit pas proposer le bouton.
 */
export async function createRematch(
  match: Match,
  currentUserId: string,
): Promise<RematchResult> {
  const opponentId =
    match.player1_id === currentUserId ? match.player2_id : match.player1_id;
  if (!opponentId) return { match: null, error: 'no_opponent' };

  const { data, error } = await supabase
    .from('matches')
    .insert([
      {
        player1_id: currentUserId,
        player2_id: opponentId,
        game_mode: match.game_mode,
        is_public: false,
        status: 'waiting',
        best_of: match.best_of,
        game_data: buildRematchGameData(match) as unknown as Json,
      },
    ])
    .select()
    .single();

  if (error || !data) return { match: null, error: error?.message ?? 'insert_failed' };

  // Notification push (au cas où l'adversaire a déjà quitté l'app).
  supabase.functions.invoke('notify-invite', { body: { match_id: data.id } }).catch(() => {});

  return { match: data as Match, error: null };
}
