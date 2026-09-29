/**
 * GET /api/hq?source=<nom>&days=<7|28|90>
 * Tableau de bord privé (page /hq). Réservé aux profils is_admin : la page
 * envoie le jeton de session Supabase, on le vérifie avant toute requête.
 */
import { requireAdmin, NotConfigured, SUPABASE_URL, SUPABASE_ANON } from './_hq/lib.mjs';
import { supabase } from './_hq/supabase.mjs';
import { posthog } from './_hq/posthog.mjs';
import { sentry } from './_hq/sentry.mjs';
import { deploys } from './_hq/deploys.mjs';
import { searchconsole, play, admob, adsense } from './_hq/google.mjs';
import { appstore } from './_hq/appstore.mjs';

const SOURCES = { supabase, posthog, sentry, deploys, searchconsole, play, admob, adsense, appstore };

const cache = new Map(); // `${source}:${days}` → { at, body }
const TTL = 5 * 60000;

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
      ...extra,
    },
  });

export async function GET(request) {
  const url = new URL(request.url);
  const source = url.searchParams.get('source');
  const days = [7, 28, 90].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 28;

  // Config publique de connexion (la clé anon est déjà dans le bundle de l'app).
  if (source === 'config') return json({ supabaseUrl: SUPABASE_URL(), anonKey: SUPABASE_ANON() });

  try {
    if (!(await requireAdmin(request))) return json({ error: 'forbidden' }, 403);
  } catch (e) {
    return json({ error: e.message }, 500);
  }

  if (source === 'list') return json({ sources: Object.keys(SOURCES) });
  const fn = SOURCES[source];
  if (!fn) return json({ error: `source inconnue : ${source}` }, 400);

  const key = `${source}:${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL && url.searchParams.get('fresh') !== '1') {
    return json({ ...hit.body, cached: true });
  }

  const t0 = Date.now();
  try {
    const data = await fn({ days });
    const body = { source, days, fetchedAt: new Date().toISOString(), ms: Date.now() - t0, data };
    cache.set(key, { at: Date.now(), body });
    return json(body);
  } catch (e) {
    if (e instanceof NotConfigured) {
      return json({ source, notConfigured: true, missing: e.missing, help: e.help ?? null });
    }
    return json({ source, error: e.message, ms: Date.now() - t0 }, 200);
  }
}
