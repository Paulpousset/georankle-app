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
  | { type: 'activity'; filter: 'never_online' }
  // Players who have NOT yet played today's daily challenge (UTC day). The
  // evening reminder targets exactly them: nudging someone who already played
  // is noise, and noise is how people turn notifications off.
  | { type: 'daily_pending' };

/**
 * Per-language copy. `{streak}` in any string is replaced by the recipient's
 * current daily streak; `body_streak` (optional) is used instead of `body`
 * when that streak is > 0, so the loss-aversion line only goes to people who
 * actually have something to lose.
 */
export interface LocalizedCopy {
  title?: string;
  body?: string;
  body_streak?: string;
}
export type CampaignI18n = Record<string, LocalizedCopy>;

type Recipient = {
  id: string;
  push_token: string;
  push_lang?: string | null;
  daily_streak?: number | null;
};

const RECIPIENT_COLS = 'id, push_token, push_lang, daily_streak';
const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const DAY_MS = 86_400_000;

/**
 * PostgREST caps every response at the project's "Max rows" (1000 by default)
 * WITHOUT an error, so a single `select` silently drops everyone past the cap.
 * Every recipient query goes through this: it pages with `range()` on a stable
 * `id` order until a short page comes back.
 */
const PAGE = 1000;
// deno-lint-ignore no-explicit-any
async function fetchAllPages(build: () => any): Promise<Recipient[]> {
  const out: Recipient[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(`recipient query failed: ${error.message}`);
    const rows = (data ?? []) as Recipient[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** Fetch recipients for a set of user ids, chunked to keep the `in()` small. */
async function tokensForIds(admin: Admin, ids: string[]): Promise<Recipient[]> {
  const out: Recipient[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300);
    const { data } = await admin
      .from('profiles')
      .select(RECIPIENT_COLS)
      .in('id', chunk)
      .not('push_token', 'is', null);
    if (data) out.push(...data);
  }
  return out;
}

/** Resolve a segment to the list of profiles (with push tokens) it targets. */
export async function resolveRecipients(admin: Admin, segment: Segment): Promise<Recipient[]> {
  const withToken = () => admin.from('profiles').select(RECIPIENT_COLS).not('push_token', 'is', null);

  switch (segment.type) {
    case 'everyone':
      return fetchAllPages(withToken);

    case 'inactive': {
      const days = Math.max(1, segment.days || 7);
      const cutoff = new Date(Date.now() - days * DAY_MS).toISOString();
      // Never-seen users (last_seen NULL) count as inactive too.
      return fetchAllPages(() => withToken().or(`last_seen.lt.${cutoff},last_seen.is.null`));
    }

    case 'daily_pending': {
      // Same day boundary as the daily puzzle itself (src/lib/daily.ts): UTC.
      const today = new Date().toISOString().slice(0, 10);
      return fetchAllPages(() => withToken().or(`daily_last_date.lt.${today},daily_last_date.is.null`));
    }

    case 'users':
      return tokensForIds(admin, segment.ids ?? []);

    case 'activity': {
      // Both segments are resolved in SQL (scale_hardening migration): reading
      // whole `matches` / `scores` tables here was capped at 1000 rows.
      if (segment.filter === 'never_online') {
        return fetchAllPages(() => admin.rpc('broadcast_recipients_never_online'));
      }
      const mode = segment.mode;
      return fetchAllPages(() => admin.rpc('broadcast_recipients_played_mode', { p_mode: mode }));
    }
  }
  return [];
}

/** Pick the copy for one recipient: their language, else en, else fr, else the plain title/body. */
export function copyFor(
  r: Pick<Recipient, 'push_lang' | 'daily_streak'>,
  title: string,
  body: string,
  i18n?: CampaignI18n | null,
): { title: string; body: string } {
  const lang = (r.push_lang ?? '').toLowerCase().slice(0, 2);
  const loc = i18n ? (i18n[lang] ?? i18n.en ?? i18n.fr) : undefined;
  const streak = Math.max(0, Number(r.daily_streak ?? 0));
  const t = loc?.title ?? title;
  const b = (streak > 0 && loc?.body_streak) || loc?.body || body;
  const fill = (s: string) => s.replaceAll('{streak}', String(streak));
  return { title: fill(t), body: fill(b) };
}

type SendResult = { tokens: number; sent: number; invalid: string[] };

/** Push to every recipient via the Expo Push API, in batches of 100. */
async function sendExpo(
  recipients: Recipient[],
  title: string,
  body: string,
  i18n?: CampaignI18n | null,
  data?: Record<string, unknown>,
): Promise<SendResult> {
  // One message per token; a token shared by two profiles gets the first one's copy.
  const seen = new Set<string>();
  const unique = recipients.filter((r) => {
    if (!r.push_token || seen.has(r.push_token)) return false;
    seen.add(r.push_token);
    return true;
  });
  let sent = 0;
  const invalid: string[] = [];

  const sendChunk = async (chunk: Recipient[]) => {
    const messages = chunk.map((r) => ({
      to: r.push_token,
      ...copyFor(r, title, body, i18n),
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
      // deno-lint-ignore no-explicit-any
      const tickets: any[] = json?.data ?? [];
      tickets.forEach((t, idx) => {
        if (t?.status === 'ok') sent++;
        else if (t?.details?.error === 'DeviceNotRegistered') invalid.push(chunk[idx].push_token);
      });
    } catch (_e) {
      // A failed chunk is logged via the returned counts (sent stays lower); we
      // don't abort the whole broadcast for one bad batch.
    }
  };

  // Batches of 100 (Expo's max per request), a few in flight at once: sending
  // them one by one would run tens of thousands of tokens past the edge
  // function's wall-clock limit. 4 × 100 stays under Expo's 600/s guidance.
  const chunks: Recipient[][] = [];
  for (let i = 0; i < unique.length; i += 100) chunks.push(unique.slice(i, i + 100));
  const CONCURRENCY = 4;
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) await sendChunk(chunks[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker));

  return { tokens: unique.length, sent, invalid };
}

/** Null out tokens Expo reported as DeviceNotRegistered so we stop hitting them. */
async function clearInvalidTokens(admin: Admin, tokens: string[]): Promise<void> {
  // Chunked like tokensForIds: a large campaign can return hundreds of dead
  // tokens, and one giant `in()` would overflow the request URL.
  for (let i = 0; i < tokens.length; i += 200) {
    await admin.from('profiles').update({ push_token: null }).in('push_token', tokens.slice(i, i + 200));
  }
}

export interface BroadcastOpts {
  title: string;
  body: string;
  segment: Segment;
  source: 'manual' | 'campaign';
  campaignId?: string | null;
  sentBy?: string | null;
  dryRun?: boolean;
  /** Optional per-language copy (see LocalizedCopy). Falls back to title/body. */
  i18n?: CampaignI18n | null;
  /** Extra payload for the app (e.g. { screen: 'daily' }). */
  data?: Record<string, unknown>;
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

  const { tokens, sent, invalid } = await sendExpo(recipients, opts.title, opts.body, opts.i18n, {
    type: 'broadcast',
    ...(opts.data ?? {}),
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
