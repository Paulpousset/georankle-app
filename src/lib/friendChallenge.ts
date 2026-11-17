/**
 * Défis entre amis en différé : « bats mon score sur la même grille ».
 *
 * Constat (diagnostic du 16/11/2026) : les joueurs qui ont au moins un ami
 * jouent 10,5 jours en moyenne contre 3,3, mais le jeu en ligne en temps réel
 * tourne à vide (811 recherches classées sans adversaire en 30 jours). Un défi
 * en différé ne demande pas que les deux soient là en même temps :
 *
 *   1. A joue une grille (mode + graine + date du vivier, comme le défi du jour) ;
 *   2. A partage un lien `/play?defi=CODE` ;
 *   3. B joue exactement la même grille quand il veut, dans l'app ou le navigateur ;
 *   4. Les deux deviennent amis, A reçoit une notification avec le résultat.
 *
 * Serveur : supabase/migrations/20261117_01_friend_challenges.sql. Les
 * fonctions pures de ce module sont testées ; le réseau est mince autour.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Share } from 'react-native';

import type { GameMode, Language } from '../types';
import { supabase } from './supabase';
import { SITE_URL } from './links';
import { DAILY_MODES, dailyModeLabel } from './daily';
import { track } from './analytics';
import { log } from './log';
import { tr } from '../i18n';

export interface ChallengeResultRow {
  user_id?: string;
  username: string | null;
  score: number;
}

export interface FriendChallenge {
  code: string;
  mode: GameMode;
  seed: number;
  pool_date: string;
  creator_id: string;
  creator_name: string | null;
  creator_score: number;
  created_at: string;
  results: ChallengeResultRow[];
}

/** What a friend challenge host plays: answering a code, or a fresh grid to send. */
export type ChallengeIntent =
  { kind: 'answer'; code: string } | { kind: 'create'; mode: GameMode; seed: number; date: string };

// ── Pure helpers (tested) ─────────────────────────────────────────────────────

/** Modes a challenge can be played in: the daily ones (same seeded screens). */
export function isChallengeMode(mode: string): mode is GameMode {
  return (DAILY_MODES as string[]).includes(mode);
}

/** Codes are 8 hex chars; accept 6–12 alphanumerics to stay forgiving. */
export function normalizeChallengeCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const c = raw.trim().toUpperCase();
  return /^[A-Z0-9]{6,12}$/.test(c) ? c : null;
}

/** Link that opens a challenge, in the app (universal link) or the browser. */
export function challengeLink(code: string): string {
  return `${SITE_URL}/play?defi=${encodeURIComponent(code)}`;
}

/** Extract a challenge code from an opening URL (`?defi=`), or null. */
export function parseChallengeCode(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/[?&]defi=([A-Za-z0-9]{6,12})/i);
  return m ? m[1].toUpperCase() : null;
}

/** A fresh 31-bit seed for a new grid (never 0, which some modes treat as « no seed »). */
export function randomSeed(rand: () => number = Math.random): number {
  return 1 + Math.floor(rand() * 0x7ffffffe);
}

export type Verdict = 'win' | 'tie' | 'loss';

/** Every daily mode scores « higher is better ». */
export function verdict(mine: number, theirs: number): Verdict {
  if (mine > theirs) return 'win';
  if (mine === theirs) return 'tie';
  return 'loss';
}

/** Score as the daily end screen shows it. */
export function formatChallengeScore(mode: GameMode, score: number, language: Language): string {
  switch (mode) {
    case 'classic':
      return `${score}%`;
    case 'streak':
      return tr(language, 'Série de {0}', 'Streak of {0}', [score]);
    default:
      return `${score}`;
  }
}

/** Message shared with the link. */
export function buildChallengeMessage(
  mode: GameMode,
  score: number,
  code: string,
  language: Language,
): string {
  return [
    tr(language, '⚔️ Défi GeoG — {0}', '⚔️ GeoG challenge — {0}', [dailyModeLabel(mode, language)]),
    tr(
      language,
      'Mon score : {0}. Même grille pour toi, tu fais mieux ?',
      'My score: {0}. Same grid for you — can you beat it?',
      [formatChallengeScore(mode, score, language)],
    ),
    challengeLink(code),
  ].join('\n');
}

// ── Network ───────────────────────────────────────────────────────────────────

export async function createFriendChallenge(input: {
  mode: GameMode;
  seed: number;
  date: string;
  score: number;
}): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_friend_challenge', {
    p_mode: input.mode,
    p_seed: input.seed,
    p_pool_date: input.date,
    p_score: Math.round(input.score),
  });
  if (error) {
    log.warn('create_friend_challenge failed', error.message);
    return null;
  }
  const code = (data as { code?: string } | null)?.code ?? null;
  if (code) track('friend_challenge_created', { mode: input.mode });
  return code;
}

export async function fetchFriendChallenge(code: string): Promise<FriendChallenge | null> {
  const { data, error } = await supabase.rpc('get_friend_challenge', { p_code: code });
  if (error || !data) return null;
  const c = data as unknown as FriendChallenge;
  if (!isChallengeMode(c.mode)) return null;
  return { ...c, seed: Number(c.seed) };
}

export interface SubmitOutcome {
  recorded: boolean;
  befriended: boolean;
}

/** Record my score on someone's challenge, then ping its creator (best effort). */
export async function submitFriendChallenge(
  code: string,
  score: number,
): Promise<SubmitOutcome | null> {
  const { data, error } = await supabase.rpc('submit_friend_challenge', {
    p_code: code,
    p_score: Math.round(score),
  });
  if (error) {
    log.warn('submit_friend_challenge failed', error.message);
    return null;
  }
  const out = data as { recorded?: boolean; befriended?: boolean; reason?: string };
  if (out?.recorded) {
    track('friend_challenge_answered', { befriended: Boolean(out.befriended) });
    supabase.functions.invoke('notify-challenge-result', { body: { code } }).catch(() => {});
  }
  return { recorded: Boolean(out?.recorded), befriended: Boolean(out?.befriended) };
}

export interface MyChallenge {
  code: string;
  mode: GameMode;
  creator_score: number;
  created_at: string;
  results: ChallengeResultRow[];
}

export async function fetchMyChallenges(limit = 10): Promise<MyChallenge[]> {
  const { data, error } = await supabase.rpc('my_friend_challenges', { p_limit: limit });
  if (error || !Array.isArray(data)) return [];
  return (data as unknown as MyChallenge[]).filter((c) => isChallengeMode(c.mode));
}

/**
 * Open the share sheet. Call straight from the tap handler with the code
 * already known (no await before), or the mobile web refuses the sheet.
 */
export function shareChallenge(
  mode: GameMode,
  score: number,
  code: string,
  language: Language,
  onCopied?: () => void,
): Promise<'shared' | 'copied' | 'failed'> {
  const message = buildChallengeMessage(mode, score, code, language);
  return Share.share({ message })
    .then(() => {
      track('friend_challenge_shared', { mode, via: 'sheet' });
      return 'shared' as const;
    })
    .catch(async () => {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(message);
          track('friend_challenge_shared', { mode, via: 'clipboard' });
          onCopied?.();
          return 'copied' as const;
        } catch {
          /* fall through */
        }
      }
      return 'failed' as const;
    });
}

// ── Pending: a guest's score, submitted once they sign in ─────────────────────

const PENDING_KEY = 'friend_challenge:pending_v1';

export async function storePendingChallengeScore(code: string, score: number): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({ code, score }));
  } catch {
    /* best effort */
  }
}

export async function submitPendingChallengeScore(): Promise<SubmitOutcome | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(PENDING_KEY);
    const { code, score } = JSON.parse(raw) as { code: string; score: number };
    return await submitFriendChallenge(code, score);
  } catch {
    return null;
  }
}

// ── Opening a challenge from anywhere (link, daily end, Duel tab) ─────────────

type Listener = (intent: ChallengeIntent) => void;
let pendingIntent: ChallengeIntent | null = null;
const listeners = new Set<Listener>();

function emit(intent: ChallengeIntent): void {
  if (listeners.size === 0) {
    pendingIntent = intent;
    return;
  }
  listeners.forEach((l) => l(intent));
}

/** A `?defi=` link opened the app (cold start or while running). */
export function requestOpenChallenge(code: string): void {
  emit({ kind: 'answer', code });
}

/** Play a grid to send to a friend. `seed`/`date` default to a fresh grid today. */
export function requestCreateChallenge(mode: GameMode, seed?: number, date?: string): void {
  emit({
    kind: 'create',
    mode,
    seed: seed ?? randomSeed(),
    date: date ?? new Date().toISOString().slice(0, 10),
  });
}

/** The router subscribes; an intent raised before it mounted is delivered at once. */
export function onChallengeIntent(listener: Listener): () => void {
  listeners.add(listener);
  if (pendingIntent) {
    const i = pendingIntent;
    pendingIntent = null;
    listener(i);
  }
  return () => {
    listeners.delete(listener);
  };
}
