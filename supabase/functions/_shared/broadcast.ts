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
  switch (segment.type) {
    case 'everyone': {
      const { data } = await admin
        .from('profiles')
        .select(RECIPIENT_COLS)
        .not('push_token', 'is', null);
      return data ?? [];
    }

    case 'inactive': {
      const days = Math.max(1, segment.days || 7);
      const cutoff = new Date(Date.now() - days * DAY_MS).toISOString();
      // Never-seen users (last_seen NULL) count as inactive too.
      const { data } = await admin
        .from('profiles')
        .select(RECIPIENT_COLS)
        .not('push_token', 'is', null)
        .or(`last_seen.lt.${cutoff},last_seen.is.null`);
      return data ?? [];
    }

    case 'daily_pending': {
      // Same day boundary as the daily puzzle itself (src/lib/daily.ts): UTC.
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await admin
        .from('profiles')
        .select(RECIPIENT_COLS)
        .not('push_token', 'is', null)
        .or(`daily_last_date.lt.${today},daily_last_date.is.null`);
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
          .select(RECIPIENT_COLS)
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

type SendResult = { tokens: number; sent: number; invalid: string[]; errors: string[] };

// deno-lint-ignore no-explicit-any
type ExpoMessage = Record<string, any>;
// deno-lint-ignore no-explicit-any
type Ticket = any;

/** Retries for one Expo request, and the pause before each retry. */
const RETRY_DELAYS_MS = [1_000, 4_000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST one batch to Expo. Returns the tickets (one per message, same order)
 * or an error string. A whole-request failure (network error, 5xx, 429, a body
 * without `data`) used to be swallowed, which is how the daily reminder went
 * out to nobody on 7 of 21 days with no trace: now it is retried, then logged.
 */
async function postExpo(messages: ExpoMessage[]): Promise<{ tickets: Ticket[] } | { error: string; status?: number; body?: unknown }> {
  let last: { error: string; status?: number; body?: unknown } = { error: 'not sent' };
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    try {
      const res = await fetch(EXPO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* non-JSON body (gateway error page) */
      }
      // deno-lint-ignore no-explicit-any
      const data = (json as any)?.data;
      if (res.ok && Array.isArray(data)) return { tickets: data };
      last = { error: `expo http ${res.status}`, status: res.status, body: json ?? text.slice(0, 500) };
      // A 4xx other than 429 is a request we built wrong: retrying the same bytes won't help.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
    } catch (e) {
      last = { error: `expo fetch failed: ${String(e)}` };
    }
  }
  console.error('[broadcast] expo request failed', JSON.stringify(last));
  return last;
}

/**
 * Expo refuses a whole request mixing tokens from several Expo projects
 * (PUSH_TOO_MANY_EXPERIENCE_IDS) and lists the tokens of each project in
 * `details`. Returns those groups, or null for any other error.
 */
export function experienceGroups(body: unknown): string[][] | null {
  // deno-lint-ignore no-explicit-any
  const errs: any[] = (body as any)?.errors ?? [];
  const e = errs.find((x) => x?.code === 'PUSH_TOO_MANY_EXPERIENCE_IDS');
  if (!e?.details || typeof e.details !== 'object') return null;
  const groups = Object.values(e.details).filter((g): g is string[] => Array.isArray(g) && g.length > 0);
  return groups.length ? groups : null;
}

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
  const errors: string[] = [];

  const tally = (msgs: ExpoMessage[], tickets: Ticket[]) => {
    tickets.forEach((t, idx) => {
      if (t?.status === 'ok') sent++;
      else if (t?.details?.error === 'DeviceNotRegistered') invalid.push(msgs[idx].to);
    });
  };

  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const messages: ExpoMessage[] = chunk.map((r) => ({
      to: r.push_token,
      ...copyFor(r, title, body, i18n),
      sound: 'default',
      ...(data ? { data } : {}),
    }));

    const res = await postExpo(messages);
    if ('tickets' in res) {
      tally(messages, res.tickets);
      continue;
    }

    // Mixed Expo projects: resend each project's tokens on its own.
    const groups = experienceGroups(res.body);
    if (groups) {
      for (const g of groups) {
        const set = new Set(g);
        const sub = messages.filter((m) => set.has(m.to));
        const r2 = await postExpo(sub);
        if ('tickets' in r2) tally(sub, r2.tickets);
        else errors.push(r2.error);
      }
      continue;
    }
    errors.push(res.status ? `${res.error}: ${JSON.stringify(res.body).slice(0, 300)}` : res.error);
  }

  return { tokens: unique.length, sent, invalid, errors };
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
  /** Optional per-language copy (see LocalizedCopy). Falls back to title/body. */
  i18n?: CampaignI18n | null;
  /** Extra payload for the app (e.g. { screen: 'daily' }). */
  data?: Record<string, unknown>;
}

export interface BroadcastResult {
  recipients: number;
  sent: number;
  dryRun?: boolean;
  /** Whole-request Expo failures that survived the retries (empty when all went through). */
  errors?: string[];
}

/** Resolve → (optionally) send → clean up → log, in one call. */
export async function runBroadcast(admin: Admin, opts: BroadcastOpts): Promise<BroadcastResult> {
  const recipients = await resolveRecipients(admin, opts.segment);

  if (opts.dryRun) {
    const unique = new Set(recipients.map((r) => r.push_token).filter(Boolean));
    return { recipients: unique.size, sent: 0, dryRun: true };
  }

  const { tokens, sent, invalid, errors } = await sendExpo(recipients, opts.title, opts.body, opts.i18n, {
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
    error: errors.length ? errors.join(' | ').slice(0, 1000) : null,
  });

  return { recipients: tokens, sent, errors };
}
