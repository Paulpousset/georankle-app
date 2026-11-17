import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { runBroadcast, type CampaignI18n, type Segment } from '../_shared/broadcast.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

interface Campaign {
  id: string;
  title: string;
  body: string;
  segment: Segment;
  schedule: 'daily' | 'weekly';
  hour: number;
  weekday: number | null;
  last_run_at: string | null;
  i18n: CampaignI18n | null;
}

/**
 * Hours after its slot during which a campaign whose send failed (nobody
 * reached although there were recipients) is tried again on the next ticks.
 */
const CATCH_UP_HOURS = 2;

/** Is this campaign due to fire on this hourly tick? */
export function isDue(c: Campaign, now: Date): boolean {
  // Its slot is this hour, or one of the CATCH_UP_HOURS before it. A
  // successful run sets last_run_at, so the min-gap check below stops the
  // catch-up ticks from sending a second time; only a failed run (last_run_at
  // left untouched) gets retried.
  let inSlot = false;
  for (let k = 0; k <= CATCH_UP_HOURS && !inSlot; k++) {
    const t = new Date(now.getTime() - k * HOUR_MS);
    if (c.hour !== t.getUTCHours()) continue;
    if (c.schedule === 'weekly' && c.weekday !== t.getUTCDay()) continue;
    inSlot = true;
  }
  if (!inSlot) return false;

  if (c.last_run_at) {
    const since = now.getTime() - new Date(c.last_run_at).getTime();
    // Don't re-fire within the same cadence window (guards retries / clock drift).
    const minGap = c.schedule === 'weekly' ? 6 * DAY_MS : 20 * HOUR_MS;
    if (since < minGap) return false;
  }
  return true;
}

// deno-lint-ignore no-explicit-any
async function logRun(admin: any, status: string, detail: unknown): Promise<void> {
  // Best effort: feeds the "cron health" card of the admin screen.
  try {
    await admin.from('cron_run_log').insert({ job: 'run-campaigns', status, detail });
  } catch (e) {
    console.error('[run-campaigns] cron_run_log insert failed', String(e));
  }
}

Deno.serve(async (req) => {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // This endpoint is invoked by pg_cron, not by users (deployed with
    // verify_jwt=false). Gate on a shared secret stored in app_secrets, which
    // only the service role can read — pg_cron sends the same value in the
    // x-cron-secret header (see the cron.schedule job).
    const { data: secretRow } = await admin
      .from('app_secrets')
      .select('value')
      .eq('key', 'cron_secret')
      .maybeSingle();
    const expected = secretRow?.value ?? '';
    if (!expected || req.headers.get('x-cron-secret') !== expected) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    // `?dry=1` (same secret): count recipients of EVERY enabled campaign,
    // ignoring the schedule, without sending or touching last_run_at. Used to
    // check a campaign's targeting right after creating it.
    const dry = new URL(req.url).searchParams.get('dry') === '1';

    const { data: campaigns } = await admin
      .from('notification_campaigns')
      .select('id, title, body, segment, schedule, hour, weekday, last_run_at, i18n')
      .eq('enabled', true);

    const due = (campaigns ?? []).filter((c: Campaign) => dry || isDue(c, now));
    const results: Array<{ id: string; recipients: number; sent: number; errors?: string[] }> = [];

    for (const c of due) {
      const r = await runBroadcast(admin, {
        title: c.title,
        body: c.body,
        i18n: c.i18n,
        segment: c.segment,
        source: 'campaign',
        campaignId: c.id,
        dryRun: dry,
        // Tapping the reminder should land on the daily hub, not the menu.
        data: c.segment?.type === 'daily_pending' ? { screen: 'daily' } : undefined,
      });
      // Nobody reached although there were recipients: leave last_run_at alone
      // so the next tick (within CATCH_UP_HOURS) tries again.
      const failed = r.recipients > 0 && r.sent === 0;
      if (!dry && !failed) {
        await admin
          .from('notification_campaigns')
          .update({ last_run_at: now.toISOString() })
          .eq('id', c.id);
      }
      results.push({ id: c.id, recipients: r.recipients, sent: r.sent, errors: r.errors });
    }

    if (!dry) {
      const failures = results.filter((r) => r.recipients > 0 && r.sent === 0);
      await logRun(admin, failures.length ? 'send_failed' : 'ok', { ran: results.length, results });
    }

    return new Response(JSON.stringify({ ran: results.length, dry, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
