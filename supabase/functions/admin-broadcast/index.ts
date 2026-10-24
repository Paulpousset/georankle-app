import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { runBroadcast, type CampaignI18n, type Segment } from '../_shared/broadcast.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/** Version par langue envoyée par l'écran admin : codes à 2 lettres, textes courts, le reste ignoré. */
function cleanI18n(raw: unknown): CampaignI18n | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: CampaignI18n = {};
  for (const [lang, v] of Object.entries(raw as Record<string, unknown>).slice(0, 32)) {
    if (!/^[a-z]{2}$/.test(lang) || !v || typeof v !== 'object') continue;
    const { title: t, body: b } = v as { title?: unknown; body?: unknown };
    if (typeof t !== 'string' || typeof b !== 'string' || !t.trim() || !b.trim()) continue;
    out[lang] = { title: t.trim().slice(0, 80), body: b.trim().slice(0, 240) };
  }
  return Object.keys(out).length ? out : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';

    // Identify the caller from their JWT.
    const asUser = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await asUser.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Only admins may broadcast.
    const { data: profile } = await admin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();
    if (!profile?.is_admin) return json({ error: 'forbidden' }, 403);

    const { title, body, segment, dryRun, i18n } = (await req.json()) as {
      title?: string;
      body?: string;
      segment?: Segment;
      dryRun?: boolean;
      i18n?: unknown;
    };

    if (!segment) return json({ error: 'segment required' }, 400);
    // Title/body only required for a real send — dry runs just count recipients.
    if (!dryRun && (!title?.trim() || !body?.trim())) {
      return json({ error: 'title and body required' }, 400);
    }

    const result = await runBroadcast(admin, {
      title: title ?? '',
      body: body ?? '',
      segment,
      i18n: cleanI18n(i18n),
      source: 'manual',
      sentBy: user.id,
      dryRun,
    });

    return json(result);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
