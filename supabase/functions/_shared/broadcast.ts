// Shared targeting + Expo-send logic used by both `admin-broadcast` (manual,
// on-demand) and `run-campaigns` (cron). The caller passes a service-role
// Supabase client (`admin`) that bypasses RLS so we can read every profile's
// push token and write the audit log.
//
// Segment is the single source of truth for "who gets this notification". The
// app builds the same shape in src/lib/admin.ts — keep the two in sync.

// deno-lint-ignore no-explicit-any
type Admin = any; // SupabaseClient (service role)

export type Segment =
  | { type: 'everyone' }
  | { type: 'inactive'; days: number }
  | { type: 'users'; ids: string[] }
  | { type: 'activity'; filter: 'played_mode'; mode: string }
  | { type: 'activity'; filter: 'never_online' };

type Recipient = { id: string; push_token: string };

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const DAY_MS = 86_400_000;

/** Fetch (id, push_token) for a set of user ids, chunked to keep the `in()` small. */
async function tokensForIds(admin: Admin, ids: string[]): Promise<Recipient[]> {
  const out: Recipient[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300);
    const { data } = await admin
      .from('profiles')
      .select('id, push_token')
      .in('id', chunk)
      .not('push_token', 'is', null);
    if (data) out.push(...data);
  }
  return out;
}

/** Resolve a segment to the list of profiles (with push tokens) it targets. */
export async function resolveRecipients(admin: Admin, segment: Segment): Promise<Recipient[]> {
  switch (segment.type) {
    case 'everyone': {
      const { data } = await admin
        .from('profiles')
        .select('id, push_token')
        .not('push_token', 'is', null);
      return data ?? [];
    }

    case 'inactive': {
      const days = Math.max(1, segment.days || 7);
      const cutoff = new Date(Date.now() - days * DAY_MS).toISOString();
      // Never-seen users (last_seen NULL) count as inactive too.
      const { data } = await admin
        .from('profiles')
        .select('id, push_token')
        .not('push_token', 'is', null)
        .or(`last_seen.lt.${cutoff},last_seen.is.null`);
      return data ?? [];
    }

    case 'users':
      return tokensForIds(admin, segment.ids ?? []);

    case 'activity': {
      if (segment.filter === 'never_online') {
        const { data: matchRows } = await admin.from('matches').select('player1_id, player2_id');
        const played = new Set<string>();
        for (const r of matchRows ?? []) {
          if (r.player1_id) played.add(r.player1_id);
          if (r.player2_id) played.add(r.player2_id);
        }
        const { data } = await admin
          .from('profiles')
          .select('id, push_token')
          .not('push_token', 'is', null);
        return (data ?? []).filter((p: Recipient) => !played.has(p.id));
      }

      // played a specific mode (solo scores, daily results, or multiplayer)
      const mode = segment.mode;
      const [scores, daily, matches] = await Promise.all([
        admin.from('scores').select('user_id').eq('game_mode', mode),
        admin.from('daily_results').select('user_id').eq('game_mode', mode),
        admin.from('matches').select('player1_id, player2_id').eq('game_mode', mode),
      ]);
      const ids = new Set<string>();
      for (const r of scores.data ?? []) ids.add(r.user_id);
      for (const r of daily.data ?? []) ids.add(r.user_id);
      for (const r of matches.data ?? []) {
        if (r.player1_id) ids.add(r.player1_id);
        if (r.player2_id) ids.add(r.player2_id);
      }
      return tokensForIds(admin, [...ids]);
    }
  }
  return [];
}

type SendResult = { tokens: number; sent: number; invalid: string[] };

/** Push to every recipient via the Expo Push API, in batches of 100. */
async function sendExpo(
  recipients: Recipient[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<SendResult> {
  const tokens = [...new Set(recipients.map((r) => r.push_token).filter(Boolean))];
  let sent = 0;
  const invalid: string[] = [];

  for (let i = 0; i < tokens.length; i += 100) {
    const chunk = tokens.slice(i, i + 100);
    const messages = chunk.map((to) => ({
      to,
      title,
      body,
      sound: 'default',
      ...(data ? { data } : {}),
    }));

    try {
      const res = await fetch(EXPO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      const json = await res.json().catch(() => null);
      const tickets: any[] = json?.data ?? [];
      tickets.forEach((t, idx) => {
        if (t?.status === 'ok') sent++;
        else if (t?.details?.error === 'DeviceNotRegistered') invalid.push(chunk[idx]);
      });
    } catch (_e) {
      // A failed chunk is logged via the returned counts (sent stays lower); we
      // don't abort the whole broadcast for one bad batch.
    }
  }

  return { tokens: tokens.length, sent, invalid };
}

/** Null out tokens Expo reported as DeviceNotRegistered so we stop hitting them. */
async function clearInvalidTokens(admin: Admin, tokens: string[]): Promise<void> {
  if (!tokens.length) return;
  await admin.from('profiles').update({ push_token: null }).in('push_token', tokens);
}

export interface BroadcastOpts {
  title: string;
  body: string;
  segment: Segment;
  source: 'manual' | 'campaign';
  campaignId?: string | null;
  sentBy?: string | null;
  dryRun?: boolean;
}

export interface BroadcastResult {
  recipients: number;
  sent: number;
  dryRun?: boolean;
}

/** Resolve → (optionally) send → clean up → log, in one call. */
export async function runBroadcast(admin: Admin, opts: BroadcastOpts): Promise<BroadcastResult> {
  const recipients = await resolveRecipients(admin, opts.segment);

  if (opts.dryRun) {
    const unique = new Set(recipients.map((r) => r.push_token).filter(Boolean));
    return { recipients: unique.size, sent: 0, dryRun: true };
  }

  const { tokens, sent, invalid } = await sendExpo(recipients, opts.title, opts.body, {
    type: 'broadcast',
  });
  if (invalid.length) await clearInvalidTokens(admin, invalid);

  await admin.from('notification_log').insert({
    title: opts.title,
    body: opts.body,
    segment: opts.segment,
    recipients: tokens,
    sent,
    source: opts.source,
    campaign_id: opts.campaignId ?? null,
    sent_by: opts.sentBy ?? null,
  });

  return { recipients: tokens, sent };
}
