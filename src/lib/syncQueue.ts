/**
 * Offline sync queue — durable retry for the handful of writes whose silent
 * failure used to leave a player thinking their progress was saved when it
 * wasn't (coins, daily completions).
 *
 * Design:
 *  - Operations are appended to an AsyncStorage-backed list. Both supported ops
 *    are *idempotent server-side* (`complete_daily` is keyed by (user,date,mode);
 *    `award_solo_coins` is daily-capped), so replaying one is always safe.
 *  - `flushQueue()` replays pending ops oldest-first and drops each on success.
 *    It's called when connectivity returns (NetworkProvider) and on app
 *    foreground, so a failed write reconciles automatically.
 *  - A tiny pub/sub lets the UI show a "not synced / syncing" indicator.
 *
 * The queue requires an authenticated session to flush (both RPCs are
 * auth-scoped); while logged out, ops simply wait.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { log } from './log';
import { supabase } from './supabase';

export type PendingOp =
  | { id: string; type: 'coins'; gameMode: string; ts: number }
  | {
      id: string;
      type: 'daily';
      date: string;
      mode: string;
      score: number;
      grid: string | null;
      ts: number;
    };

/** Op shape as enqueued by callers (id/ts are filled in here). */
export type NewOp =
  | { type: 'coins'; gameMode: string }
  | { type: 'daily'; date: string; mode: string; score: number; grid: string | null };

const STORAGE_KEY = 'sync:queue';

let memo: PendingOp[] | null = null;
const listeners = new Set<(count: number) => void>();

async function read(): Promise<PendingOp[]> {
  if (memo) return memo;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    memo = raw ? (JSON.parse(raw) as PendingOp[]) : [];
  } catch {
    memo = [];
  }
  return memo;
}

async function write(ops: PendingOp[]): Promise<void> {
  memo = ops;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ops));
  } catch {
    // Best-effort; an in-memory copy still drives this session's retries.
  }
  for (const l of listeners) l(ops.length);
}

/** Subscribe to the pending-count; fires immediately with the current value. */
export function subscribePending(cb: (count: number) => void): () => void {
  listeners.add(cb);
  void read().then((ops) => cb(ops.length));
  return () => {
    listeners.delete(cb);
  };
}

export async function getPendingCount(): Promise<number> {
  return (await read()).length;
}

/**
 * Collapse redundant ops so the queue can't grow unbounded:
 *  - at most one `coins` op per game mode (replays are capped anyway),
 *  - at most one `daily` op per (date, mode), keeping the higher score.
 */
function dedupe(ops: PendingOp[]): PendingOp[] {
  const out: PendingOp[] = [];
  for (const op of ops) {
    if (op.type === 'coins') {
      const existing = out.find((o) => o.type === 'coins' && o.gameMode === op.gameMode);
      if (!existing) out.push(op);
    } else {
      const existing = out.find(
        (o) => o.type === 'daily' && o.date === op.date && o.mode === op.mode,
      ) as Extract<PendingOp, { type: 'daily' }> | undefined;
      if (!existing) out.push(op);
      else if (op.score > existing.score) {
        existing.score = op.score;
        existing.grid = op.grid;
      }
    }
  }
  return out;
}

export async function enqueue(op: NewOp): Promise<void> {
  const ops = await read();
  const full: PendingOp = { ...op, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, ts: Date.now() };
  await write(dedupe([...ops, full]));
}

/**
 * A Postgres business rejection (RAISE EXCEPTION → P0001, data/constraint
 * violations → 22xxx/23xxx) will fail identically on every replay. Such an op
 * must be dropped, otherwise it blocks the head of the queue forever and the
 * player's coins/daily writes never sync again (seen in prod: stale clients
 * retrying `bad game mode` in a loop).
 */
function isPermanentRpcError(error: { code?: string } | null): boolean {
  const code = error?.code ?? '';
  return code === 'P0001' || code.startsWith('22') || code.startsWith('23');
}

type ReplayOutcome = 'ok' | 'retry' | 'drop';

/** Replay one op against its RPC. */
async function replay(op: PendingOp): Promise<ReplayOutcome> {
  try {
    const { error } =
      op.type === 'coins'
        ? await supabase.rpc('award_solo_coins', { p_game_mode: op.gameMode })
        : await supabase.rpc('complete_daily', {
            p_date: op.date,
            p_mode: op.mode,
            p_score: op.score,
            p_grid: op.grid ?? '',
          });
    if (!error) return 'ok';
    if (isPermanentRpcError(error)) {
      log.error('syncQueue: dropping permanently rejected op', error, op);
      return 'drop';
    }
    return 'retry';
  } catch {
    return 'retry';
  }
}

let flushing = false;

/**
 * Replay every pending op oldest-first, dropping each one that succeeds. Stops
 * at the first failure (likely still offline / mid-outage) and leaves the rest
 * queued for the next attempt. No-op when logged out or already running.
 */
export async function flushQueue(): Promise<void> {
  if (flushing) return;
  const ops = await read();
  if (ops.length === 0) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return; // both RPCs need an authenticated user

  flushing = true;
  try {
    const remaining = [...ops];
    while (remaining.length > 0) {
      const outcome = await replay(remaining[0]);
      if (outcome === 'retry') break; // likely still offline — try again later
      remaining.shift(); // 'ok' and 'drop' both consume the op
    }
    if (remaining.length !== ops.length) await write(remaining);
  } finally {
    flushing = false;
  }
}

/** Test/debug helper — clears the in-memory cache so the next read hits storage. */
export function _resetMemo(): void {
  memo = null;
}
