/**
 * Admin push-notification helpers.
 *
 * The actual sending happens server-side (the `admin-broadcast` edge function,
 * which re-checks the caller's `is_admin` flag with the service role). The app
 * only ever asks the function to send or to count recipients (`dryRun`), and
 * does campaign CRUD directly against `notification_campaigns` (RLS-gated to
 * admins). Keep `Segment` in sync with supabase/functions/_shared/broadcast.ts.
 */
import { supabase } from './supabase';

/** Who a broadcast targets. Mirrors the edge function's Segment union. */
export type Segment =
  | { type: 'everyone' }
  | { type: 'inactive'; days: number }
  | { type: 'users'; ids: string[] }
  | { type: 'activity'; filter: 'played_mode'; mode: string }
  | { type: 'activity'; filter: 'never_online' };

export interface Campaign {
  id: string;
  title: string;
  body: string;
  segment: Segment;
  schedule: 'daily' | 'weekly';
  hour: number;
  weekday: number | null;
  enabled: boolean;
  last_run_at: string | null;
  created_at: string;
}

export interface LogEntry {
  id: string;
  title: string;
  body: string;
  segment: Segment;
  recipients: number;
  sent: number;
  source: 'manual' | 'campaign';
  created_at: string;
}

/** True if the given user has the admin flag set. */
export async function fetchIsAdmin(userId: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
  return data?.is_admin === true;
}

interface BroadcastResponse {
  recipients: number;
  sent: number;
  dryRun?: boolean;
  error?: string;
}

/** Count how many devices a segment currently targets (no send). */
export async function previewRecipients(segment: Segment): Promise<number> {
  const { data, error } = await supabase.functions.invoke<BroadcastResponse>('admin-broadcast', {
    body: { segment, dryRun: true },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.recipients ?? 0;
}

/** Send a notification now to everyone the segment matches. */
export async function sendBroadcast(
  title: string,
  body: string,
  segment: Segment,
): Promise<{ recipients: number; sent: number }> {
  const { data, error } = await supabase.functions.invoke<BroadcastResponse>('admin-broadcast', {
    body: { title, body, segment },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return { recipients: data?.recipients ?? 0, sent: data?.sent ?? 0 };
}

/** Search players by username (for the "specific people" segment). */
export async function searchUsers(
  query: string,
): Promise<Array<{ id: string; username: string }>> {
  const q = query.trim();
  if (!q) return [];
  const { data } = await supabase
    .from('profiles')
    .select('id, username')
    .ilike('username', `%${q}%`)
    .not('username', 'is', null)
    .limit(20);
  return (data ?? []) as Array<{ id: string; username: string }>;
}

// ── Scheduled campaigns ───────────────────────────────────────────────────────

export async function listCampaigns(): Promise<Campaign[]> {
  const { data } = await supabase
    .from('notification_campaigns')
    .select('*')
    .order('created_at', { ascending: false });
  return (data ?? []) as Campaign[];
}

export async function saveCampaign(
  c: Omit<Campaign, 'id' | 'last_run_at' | 'created_at'> & { id?: string },
  userId: string,
): Promise<void> {
  const row = {
    title: c.title,
    body: c.body,
    segment: c.segment,
    schedule: c.schedule,
    hour: c.hour,
    weekday: c.weekday,
    enabled: c.enabled,
    created_by: userId,
  };
  const { error } = c.id
    ? await supabase.from('notification_campaigns').update(row).eq('id', c.id)
    : await supabase.from('notification_campaigns').insert(row);
  if (error) throw error;
}

export async function setCampaignEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('notification_campaigns')
    .update({ enabled })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteCampaign(id: string): Promise<void> {
  const { error } = await supabase.from('notification_campaigns').delete().eq('id', id);
  if (error) throw error;
}

export async function listLog(limit = 20): Promise<LogEntry[]> {
  const { data } = await supabase
    .from('notification_log')
    .select('id, title, body, segment, recipients, sent, source, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as LogEntry[];
}
