import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { runBroadcast, type Segment } from '../_shared/broadcast.ts';

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
}

/** Is this campaign due to fire on this hourly tick? */
function isDue(c: Campaign, now: Date): boolean {
  if (c.hour !== now.getUTCHours()) return false;
  if (c.schedule === 'weekly' && c.weekday !== now.getUTCDay()) return false;

  if (c.last_run_at) {
    const since = now.getTime() - new Date(c.last_run_at).getTime();
    // Don't re-fire within the same cadence window (guards retries / clock drift).
    const minGap = c.schedule === 'weekly' ? 6 * DAY_MS : 23 * HOUR_MS;
    if (since < minGap) return false;
  }
  return true;
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

    const { data: campaigns } = await admin
      .from('notification_campaigns')
      .select('id, title, body, segment, schedule, hour, weekday, last_run_at')
      .eq('enabled', true);

    const due = (campaigns ?? []).filter((c: Campaign) => isDue(c, now));
    const results: Array<{ id: string; recipients: number; sent: number }> = [];

    for (const c of due) {
      const r = await runBroadcast(admin, {
        title: c.title,
        body: c.body,
        segment: c.segment,
        source: 'campaign',
        campaignId: c.id,
      });
      await admin
        .from('notification_campaigns')
        .update({ last_run_at: now.toISOString() })
        .eq('id', c.id);
      results.push({ id: c.id, recipients: r.recipients, sent: r.sent });
    }

    return new Response(JSON.stringify({ ran: results.length, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
