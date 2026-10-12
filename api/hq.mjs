/**
 * GET /api/hq?source=<nom>&days=<1|7|28|90>  (1 = 24 h, séries à l'heure)
 *   Filtres optionnels (sources posthog et growth) : countries=FR,BE [exclude=1 : tous sauf eux]
 *   platform=ios|android|web
 *   from=YYYY-MM-DD&to=YYYY-MM-DD (dates perso, à la place de days).
 * POST /api/hq?source=markers  { day, kind, label }  → ajoute un repère manuel
 * DELETE /api/hq?source=markers&id=<id>              → le retire
 * GET /api/hq?source=social&preview=<assetId>        → lien temporaire de la vidéo (aperçu)
 * Tableau de bord privé (page /hq). Réservé aux profils is_admin : la page
 * envoie le jeton de session Supabase, on le vérifie avant toute requête.
 */
import { requireAdmin, NotConfigured, SUPABASE_URL, SUPABASE_ANON, env, http, isoDay } from './_hq/lib.mjs';
import { supabase } from './_hq/supabase.mjs';
import { posthog } from './_hq/posthog.mjs';
import { sentry } from './_hq/sentry.mjs';
import { deploys } from './_hq/deploys.mjs';
import { searchconsole, play, admob, adsense } from './_hq/google.mjs';
import { appstore } from './_hq/appstore.mjs';
import { growth } from './_hq/growth.mjs';
import { social, socialPreview } from './_hq/social.mjs';

const SOURCES = { supabase, posthog, sentry, deploys, searchconsole, play, admob, adsense, appstore, growth, social };

const cache = new Map(); // `${source}:${days}:${filtres}` → { at, body }
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

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Filtres validés : rien de ce qui arrive ici n'entre tel quel dans une requête. */
function filtersOf(url) {
  const p = url.searchParams;
  const countries = [...new Set((p.get('countries') ?? '').toUpperCase().split(',').filter((c) => /^[A-Z]{2}$/.test(c)))]
    .sort()
    .slice(0, 80);
  const platform = ['ios', 'android', 'web'].includes(p.get('platform')) ? p.get('platform') : null;
  let from = p.get('from');
  let to = p.get('to');
  const today = isoDay(new Date());
  if (!(DAY.test(from ?? '') && DAY.test(to ?? '') && from <= to && to <= today && Date.parse(to) - Date.parse(from) <= 365 * 86400000)) {
    from = null;
    to = null;
  }
  const exclude = countries.length > 0 && p.get('exclude') === '1';
  return { countries, exclude, platform, from, to };
}

export async function GET(request) {
  const url = new URL(request.url);
  const source = url.searchParams.get('source');
  const days = [1, 7, 28, 90].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 28;

  // Config publique de connexion (la clé anon est déjà dans le bundle de l'app).
  if (source === 'config') return json({ supabaseUrl: SUPABASE_URL(), anonKey: SUPABASE_ANON() });

  try {
    if (!(await requireAdmin(request))) return json({ error: 'forbidden' }, 403);
  } catch (e) {
    return json({ error: e.message }, 500);
  }

  if (source === 'list') return json({ sources: Object.keys(SOURCES) });
  if (source === 'social' && url.searchParams.has('preview')) {
    try {
      return json({ url: await socialPreview(url.searchParams.get('preview')) });
    } catch (e) {
      return json({ error: e.message }, 400);
    }
  }
  const fn = SOURCES[source];
  if (!fn) return json({ error: `source inconnue : ${source}` }, 400);

  const filters = filtersOf(url);
  const key = `${source}:${days}:${filters.exclude ? '!' : ''}${filters.countries.join(',')}:${filters.platform}:${filters.from}:${filters.to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL && url.searchParams.get('fresh') !== '1') {
    return json({ ...hit.body, cached: true });
  }

  const t0 = Date.now();
  try {
    const data = await fn({ days, ...filters });
    const body = { source, days, filters, fetchedAt: new Date().toISOString(), ms: Date.now() - t0, data };
    cache.set(key, { at: Date.now(), body });
    return json(body);
  } catch (e) {
    if (e instanceof NotConfigured) {
      return json({ source, notConfigured: true, missing: e.missing, help: e.help ?? null });
    }
    return json({ source, error: e.message, ms: Date.now() - t0 }, 200);
  }
}

// ─── Repères manuels (table hq_markers, service role uniquement) ─────────────

async function markersWrite(request, method) {
  try {
    if (!(await requireAdmin(request))) return json({ error: 'forbidden' }, 403);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
  const url = new URL(request.url);
  if (url.searchParams.get('source') !== 'markers') return json({ error: 'source inconnue' }, 400);
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const headers = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation' };
  try {
    let row;
    if (method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const label = String(b.label ?? '').trim().slice(0, 120);
      const kind = ['campagne', 'version', 'push', 'autre'].includes(b.kind) ? b.kind : 'campagne';
      if (!DAY.test(b.day ?? '') || !label) return json({ error: 'date ou libellé manquant' }, 400);
      [row] = await http(`${SUPABASE_URL()}/rest/v1/hq_markers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ day: b.day, kind, label }),
      });
    } else {
      const id = Number(url.searchParams.get('id'));
      if (!Number.isInteger(id) || id <= 0) return json({ error: 'id invalide' }, 400);
      await http(`${SUPABASE_URL()}/rest/v1/hq_markers?id=eq.${id}`, { method: 'DELETE', headers });
    }
    for (const k of cache.keys()) if (k.startsWith('growth:')) cache.delete(k);
    return json({ ok: true, row: row ?? null });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export const POST = (request) => markersWrite(request, 'POST');
export const DELETE = (request) => markersWrite(request, 'DELETE');
