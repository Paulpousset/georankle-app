/**
 * Story mode client state — local-first, server-authoritative when signed in.
 *
 * Mirrors the daily.ts pattern:
 *  - Progress (max level reached, best stars/score per level) is cached in
 *    AsyncStorage so the map works instantly and offline, and reconciled with
 *    the server (`get_story_state` + the `story_progress` table) on read.
 *  - Level completions go through `complete_story_level` with a timeout, and are
 *    queued (syncQueue) on failure — idempotent per (user, level), so replays are
 *    safe and never double-award coins.
 *  - Lives regenerate over time. The regeneration math is duplicated here (as in
 *    computeStreak) for instant UI; the server value is adopted as authoritative
 *    when available.
 */
import type { User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';
import { enqueue } from './syncQueue';
import { log } from './log';

export const MAX_LIVES = 5;
export const REGEN_MS = 20 * 60 * 1000; // one life every 20 minutes
const RPC_TIMEOUT_MS = 8000;

const PROGRESS_KEY = 'story:progress';
const LIVES_KEY = 'story:lives';

// ── Stored shapes ──────────────────────────────────────────────────────────────

interface LevelEntry {
  stars: number;
  score: number;
}
interface StoredProgress {
  maxLevel: number;
  levels: Record<string, LevelEntry>;
}
interface StoredLives {
  lives: number;
  /** Epoch ms of the last life mutation — the regen clock anchor. */
  updatedAt: number;
  adRefills: number;
  adRefillDay: string;
}

const EMPTY_PROGRESS: StoredProgress = { maxLevel: 0, levels: {} };

// ── Public snapshot (what the map renders) ─────────────────────────────────────

export interface StorySnapshot {
  maxLevel: number;
  /** Best stars per level (1-based level → 0..3). */
  stars: Record<number, number>;
  /** Best normalized score per level. */
  scores: Record<number, number>;
  lives: number;
  maxLives: number;
  /** Ms until the next life regenerates (0 when full). */
  nextRegenMs: number;
}

// ── Local persistence ──────────────────────────────────────────────────────────

async function readProgress(): Promise<StoredProgress> {
  try {
    const raw = await AsyncStorage.getItem(PROGRESS_KEY);
    if (!raw) return { ...EMPTY_PROGRESS };
    return { ...EMPTY_PROGRESS, ...(JSON.parse(raw) as StoredProgress) };
  } catch {
    return { ...EMPTY_PROGRESS };
  }
}

async function writeProgress(p: StoredProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    // Best-effort; server remains the source of truth when signed in.
  }
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readLives(): Promise<StoredLives> {
  try {
    const raw = await AsyncStorage.getItem(LIVES_KEY);
    if (!raw) return { lives: MAX_LIVES, updatedAt: Date.now(), adRefills: 0, adRefillDay: todayUTC() };
    return JSON.parse(raw) as StoredLives;
  } catch {
    return { lives: MAX_LIVES, updatedAt: Date.now(), adRefills: 0, adRefillDay: todayUTC() };
  }
}

async function writeLives(l: StoredLives): Promise<void> {
  try {
    await AsyncStorage.setItem(LIVES_KEY, JSON.stringify(l));
  } catch {
    // ignore
  }
}

/** Settle regenerated lives into the stored value (pure w.r.t. a "now"). */
function settleLives(l: StoredLives, now = Date.now()): StoredLives {
  if (l.lives >= MAX_LIVES) return { ...l, lives: MAX_LIVES, updatedAt: now };
  const gained = Math.floor((now - l.updatedAt) / REGEN_MS);
  if (gained <= 0) return l;
  const lives = Math.min(MAX_LIVES, l.lives + gained);
  const updatedAt = lives >= MAX_LIVES ? now : l.updatedAt + gained * REGEN_MS;
  return { ...l, lives, updatedAt };
}

function nextRegenMs(l: StoredLives, now = Date.now()): number {
  if (l.lives >= MAX_LIVES) return 0;
  return Math.max(0, REGEN_MS - (now - l.updatedAt));
}

// ── Server helpers (best-effort, never throw) ──────────────────────────────────

const TIMEOUT = Symbol('timeout');
function withTimeout<T>(p: PromiseLike<T>): Promise<T | typeof TIMEOUT> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<typeof TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), RPC_TIMEOUT_MS);
  });
  return Promise.race([Promise.resolve(p), timeout]).finally(() => clearTimeout(timer));
}

/** Merge the user's own server rows + lives into the local cache. */
async function reconcileFromServer(progress: StoredProgress, lives: StoredLives): Promise<{
  progress: StoredProgress;
  lives: StoredLives;
}> {
  try {
    const [state, rows] = await Promise.all([
      withTimeout(supabase.rpc('get_story_state')),
      withTimeout(
        supabase.from('story_progress').select('level, stars, score'),
      ),
    ]);

    // Adopt server per-level stars/score (keeping the best of both).
    if (rows !== TIMEOUT && !(rows as any).error) {
      const data = (rows as any).data as { level: number; stars: number; score: number }[] | null;
      for (const r of data ?? []) {
        const key = String(r.level);
        const cur = progress.levels[key];
        progress.levels[key] = {
          stars: Math.max(cur?.stars ?? 0, r.stars),
          score: Math.max(cur?.score ?? 0, r.score),
        };
      }
    }

    if (state !== TIMEOUT && !(state as any).error) {
      const s = (state as any).data as {
        lives?: number;
        max_level?: number;
      } | null;
      if (s) {
        progress.maxLevel = Math.max(progress.maxLevel, s.max_level ?? 0);
        // Server lives are authoritative (they enforce the regen + ad cap).
        if (typeof s.lives === 'number') {
          lives = { ...lives, lives: s.lives, updatedAt: Date.now() };
        }
      }
    }
  } catch (e) {
    log.warn('story: server reconcile failed', e);
  }
  return { progress, lives };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Current story snapshot — reconciles with the server when signed in. */
export async function getStorySnapshot(user: User | null): Promise<StorySnapshot> {
  let progress = await readProgress();
  let lives = settleLives(await readLives());

  if (user) {
    const merged = await reconcileFromServer(progress, lives);
    progress = merged.progress;
    lives = settleLives(merged.lives);
    await writeProgress(progress);
    await writeLives(lives);
  } else {
    await writeLives(lives); // persist the regenerated value
  }

  const stars: Record<number, number> = {};
  const scores: Record<number, number> = {};
  for (const [k, v] of Object.entries(progress.levels)) {
    stars[Number(k)] = v.stars;
    scores[Number(k)] = v.score;
  }
  return {
    maxLevel: progress.maxLevel,
    stars,
    scores,
    lives: lives.lives,
    maxLives: MAX_LIVES,
    nextRegenMs: nextRegenMs(lives),
  };
}

/**
 * Spend one life to start a level. Optimistically decrements the local cache;
 * when signed in, the server RPC is authoritative and its value is adopted.
 * Returns whether a life was available.
 */
export async function consumeLife(user: User | null): Promise<{ ok: boolean; lives: number }> {
  let lives = settleLives(await readLives());
  if (lives.lives <= 0) {
    await writeLives(lives);
    return { ok: false, lives: 0 };
  }
  // Optimistic local decrement (anchor the regen clock when leaving full).
  const wasFull = lives.lives >= MAX_LIVES;
  lives = { ...lives, lives: lives.lives - 1, updatedAt: wasFull ? Date.now() : lives.updatedAt };
  await writeLives(lives);

  if (user) {
    try {
      const res = await withTimeout(supabase.rpc('consume_story_life'));
      if (res !== TIMEOUT && !(res as any).error) {
        const d = (res as any).data as { spent?: boolean; lives?: number } | null;
        if (d && typeof d.lives === 'number') {
          lives = { ...lives, lives: d.lives, updatedAt: Date.now() };
          await writeLives(lives);
          return { ok: d.spent !== false, lives: d.lives };
        }
      }
    } catch (e) {
      log.warn('story: consume life RPC failed', e);
    }
  }
  return { ok: true, lives: lives.lives };
}

/** Grant +1 life after a watched rewarded ad (server-capped). Returns new count. */
export async function claimLifeFromAd(user: User | null): Promise<{ granted: boolean; lives: number }> {
  let lives = settleLives(await readLives());
  if (!user) {
    // Logged-out fallback: local grant (no ad cap enforceable offline).
    if (lives.lives < MAX_LIVES) lives = { ...lives, lives: lives.lives + 1 };
    await writeLives(lives);
    return { granted: true, lives: lives.lives };
  }
  try {
    const res = await withTimeout(supabase.rpc('claim_story_life'));
    if (res !== TIMEOUT && !(res as any).error) {
      const d = (res as any).data as { granted?: boolean; lives?: number } | null;
      if (d && typeof d.lives === 'number') {
        lives = { ...lives, lives: d.lives, updatedAt: Date.now() };
        await writeLives(lives);
        return { granted: !!d.granted, lives: d.lives };
      }
    }
  } catch (e) {
    log.warn('story: claim life RPC failed', e);
  }
  return { granted: false, lives: lives.lives };
}

/**
 * Record a level completion (keeping the best stars/score). Always updates the
 * local cache; when signed in, calls the server RPC and queues it on failure.
 * Returns the first-clear flag + coins granted (for the results toast).
 */
export interface RecordLevelResult {
  firstClear: boolean;
  coins: number;
  synced: boolean;
  /** Cosmetic id just unlocked (caller resolves the localized name). */
  unlockedItemId?: string;
}

export async function recordLevel(
  user: User | null,
  level: number,
  score: number,
  stars: number,
): Promise<RecordLevelResult> {
  const progress = await readProgress();
  const key = String(level);
  const existing = progress.levels[key];
  const firstClearLocal = (existing?.stars ?? 0) === 0 && stars >= 1;
  progress.levels[key] = {
    stars: Math.max(existing?.stars ?? 0, stars),
    score: Math.max(existing?.score ?? 0, score),
  };
  if (stars >= 1) progress.maxLevel = Math.max(progress.maxLevel, level);
  await writeProgress(progress);

  if (!user) return { firstClear: firstClearLocal, coins: 0, synced: true };

  try {
    const res = await withTimeout(
      supabase.rpc('complete_story_level', { p_level: level, p_score: score, p_stars: stars }),
    );
    if (res === TIMEOUT || (res as any).error) {
      await enqueue({ type: 'story-level', level, score, stars });
      return { firstClear: firstClearLocal, coins: 0, synced: false };
    }
    const d = (res as any).data as {
      first_clear?: boolean;
      coins?: number;
      max_level?: number;
      unlocked?: string | null;
    } | null;
    if (d?.max_level != null) {
      progress.maxLevel = Math.max(progress.maxLevel, d.max_level);
      await writeProgress(progress);
    }
    return {
      firstClear: !!d?.first_clear,
      coins: d?.coins ?? 0,
      synced: true,
      unlockedItemId: d?.unlocked ?? undefined,
    };
  } catch {
    await enqueue({ type: 'story-level', level, score, stars });
    return { firstClear: firstClearLocal, coins: 0, synced: false };
  }
}

/** Read friends' campaign position for the map (public read on story_progress). */
export interface FriendPosition {
  userId: string;
  username: string | null;
  avatarConfig: unknown;
  maxLevel: number;
}

export async function getFriendsPositions(user: User | null): Promise<FriendPosition[]> {
  if (!user) return [];
  try {
    // Friend ids from the accepted friends rows (either side of the pair).
    const { data: rows, error } = await supabase
      .from('friends')
      .select('user_id1, user_id2')
      .eq('status', 'accepted')
      .or(`user_id1.eq.${user.id},user_id2.eq.${user.id}`);
    if (error || !rows) return [];
    const friendIds = rows
      .map((r: any) => (r.user_id1 === user.id ? r.user_id2 : r.user_id1))
      .filter((id: string) => id && id !== user.id);
    if (friendIds.length === 0) return [];

    const { data: profs } = await supabase
      .from('profiles')
      .select('id, username, avatar_config, story_max_level')
      .in('id', friendIds);
    return (profs ?? []).map((p: any) => ({
      userId: p.id,
      username: p.username ?? null,
      avatarConfig: p.avatar_config,
      maxLevel: p.story_max_level ?? 0,
    }));
  } catch (e) {
    log.warn('story: friends positions failed', e);
    return [];
  }
}

// ── Test hooks ─────────────────────────────────────────────────────────────────
export const _internal = { settleLives, nextRegenMs };
