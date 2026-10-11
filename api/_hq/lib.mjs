/**
 * Socle du tableau de bord /hq : variables d'environnement, garde admin,
 * jetons Google (compte utilisateur OAuth ou compte de service) et Apple.
 * Aucun secret ne part au navigateur : chaque source est interrogée ici,
 * côté serveur, et seule la donnée agrégée est renvoyée.
 */
import crypto from 'node:crypto';

export const env = (k, fallback) => process.env[k] ?? fallback;

export const SUPABASE_URL = () => env('SUPABASE_URL', env('EXPO_PUBLIC_SUPABASE_URL'));
export const SUPABASE_ANON = () => env('SUPABASE_ANON_KEY', env('EXPO_PUBLIC_SUPABASE_ANON_KEY'));

/** Erreur « source pas encore branchée » : l'UI affiche la carte de configuration. */
export class NotConfigured extends Error {
  constructor(missing, help) {
    super(`Variables manquantes : ${missing.join(', ')}`);
    this.missing = missing;
    this.help = help;
  }
}

export function need(keys, help) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) throw new NotConfigured(missing, help);
}

export async function http(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(opts.timeout ?? 20000) });
  if (opts.binary && res.ok) return Buffer.from(await res.arrayBuffer());
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text);
      msg = j.error?.message ?? j.error_description ?? j.detail ?? j.message ?? (typeof j.error === 'string' ? j.error : msg);
    } catch {}
    throw new Error(`${res.status} ${new URL(url).host} — ${msg}`);
  }
  return opts.raw ? { res, text } : text ? JSON.parse(text) : null;
}

/** Exécute plusieurs sous-requêtes ; une erreur n'efface pas les autres. */
export async function settle(obj) {
  const keys = Object.keys(obj);
  const out = await Promise.allSettled(keys.map((k) => obj[k]()));
  const data = {};
  const errors = {};
  const missing = new Set();
  out.forEach((r, i) => {
    if (r.status === 'fulfilled') data[keys[i]] = r.value;
    else if (r.reason instanceof NotConfigured) r.reason.missing.forEach((m) => missing.add(m));
    else errors[keys[i]] = r.reason?.message ?? String(r.reason);
  });
  if (Object.keys(errors).length) data._errors = errors;
  if (missing.size) data._missing = [...missing];
  return data;
}

export const isoDay = (d) => d.toISOString().slice(0, 10);
export const daysAgo = (n) => new Date(Date.now() - n * 86400000);

/**
 * Période « 24 h » (days = 1) : les séries passent à l'heure. Clés de seau :
 * 'YYYY-MM-DD' par jour, 'YYYY-MM-DDTHH' (UTC) par heure.
 */
export const hourly = (days) => days === 1;
export const bucketOf = (iso, days) => String(iso).slice(0, hourly(days) ? 13 : 10);
export function buckets(days) {
  if (!hourly(days)) return dayRange(days);
  const now = Math.floor(Date.now() / 3600000) * 3600000;
  return Array.from({ length: 24 }, (_, i) => new Date(now - (23 - i) * 3600000).toISOString().slice(0, 13));
}

/** Liste des jours [from..to] (ISO) pour remplir les trous des séries. */
export function dayRange(n, endOffset = 0) {
  return Array.from({ length: n }, (_, i) => isoDay(daysAgo(n - 1 - i + endOffset)));
}

const addDays = (iso, k) => isoDay(new Date(Date.parse(`${iso}T00:00:00Z`) + k * 86400000));

/** Le pays (ISO2) passe-t-il le filtre ? */
export const countryOk = (c, { countries, exclude } = {}) =>
  !countries?.length || (exclude ? !countries.includes(c) : countries.includes(c));

/**
 * Fenêtre d'analyse : les N derniers jours (ou 24 h), ou des dates perso
 * [from..to] incluses. Donne les prédicats HogQL de la période et de la
 * période précédente de même durée, et les seaux alignés des deux.
 */
export function windowOf({ days, from, to }) {
  if (from && to) {
    const n = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
    const ts = (iso) => `toDateTime('${iso} 00:00:00', 'UTC')`;
    return {
      n, hourly: false, custom: true,
      first: from, last: to, prevFirst: addDays(from, -n), prevLast: addDays(from, -1),
      start: ts(from), end: ts(addDays(to, 1)),
      cur: `timestamp >= ${ts(from)} and timestamp < ${ts(addDays(to, 1))}`,
      prev: `timestamp >= ${ts(addDays(from, -n))} and timestamp < ${ts(from)}`,
      bucket: 'toString(toDate(timestamp))',
      buckets: Array.from({ length: n }, (_, i) => addDays(from, i)),
      prevBuckets: Array.from({ length: n }, (_, i) => addDays(from, i - n)),
    };
  }
  const h = hourly(days);
  const list = buckets(days);
  return {
    n: list.length, hourly: h, custom: false,
    first: isoDay(daysAgo(h ? 0 : days - 1)), last: isoDay(new Date()),
    prevFirst: isoDay(daysAgo(h ? 1 : days * 2 - 1)), prevLast: isoDay(daysAgo(h ? 1 : days)),
    start: `now() - interval ${days} day`, end: 'now()',
    cur: `timestamp > now() - interval ${days} day`,
    prev: `timestamp > now() - interval ${days * 2} day and timestamp <= now() - interval ${days} day`,
    bucket: h ? `formatDateTime(toStartOfHour(toTimeZone(timestamp, 'UTC')), '%Y-%m-%dT%H')` : 'toString(toDate(timestamp))',
    buckets: list,
    prevBuckets: h
      ? list.map((k) => new Date(Date.parse(`${k}:00:00Z`) - 86400000).toISOString().slice(0, 13))
      : dayRange(days, days),
  };
}

// ─── PostHog ─────────────────────────────────────────────────────────────────

/** App native = lib posthog-react-native ; tout le reste = web (site + /play). */
export const PLATFORM = `multiIf(properties.$lib = 'posthog-react-native', if(properties.$os = 'Android', 'Android', 'iOS'), 'Web')`;
const PLATFORM_NAMES = { ios: 'iOS', android: 'Android', web: 'Web' };

/** Filtres pays (ISO2, déjà validés ; `exclude` = tous sauf eux) et plateforme, à ajouter après un WHERE. */
export function hogFilter({ countries, exclude, platform } = {}) {
  let f = '';
  if (countries?.length) {
    const list = countries.map((c) => `'${c}'`).join(',');
    f += exclude
      ? ` and coalesce(properties.$geoip_country_code, '') not in (${list})`
      : ` and properties.$geoip_country_code in (${list})`;
  }
  if (PLATFORM_NAMES[platform]) f += ` and ${PLATFORM} = '${PLATFORM_NAMES[platform]}'`;
  return f;
}

export async function hogql(query) {
  need(['POSTHOG_PERSONAL_API_KEY'], 'Clé perso PostHog (déjà dans .env.secrets)');
  const host = env('POSTHOG_HOST_API', 'https://eu.posthog.com');
  const r = await http(`${host}/api/projects/@current/query/`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env('POSTHOG_PERSONAL_API_KEY')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
    timeout: 30000,
  });
  return r.results;
}

// ─── Garde admin ─────────────────────────────────────────────────────────────

const verified = new Map(); // jeton → expiration (ms)

export async function requireAdmin(request) {
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  if ((verified.get(token) ?? 0) > Date.now()) return true;
  const url = SUPABASE_URL();
  const service = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !service) throw new Error('SUPABASE_SERVICE_ROLE_KEY absent côté Vercel');
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON() ?? service, authorization: `Bearer ${token}` },
  });
  if (!res.ok) return false;
  const user = await res.json();
  const rows = await http(`${url}/rest/v1/profiles?id=eq.${user.id}&select=is_admin`, {
    headers: { apikey: service, authorization: `Bearer ${service}` },
  });
  const ok = rows?.[0]?.is_admin === true;
  if (ok) verified.set(token, Date.now() + 5 * 60000);
  return ok;
}

// ─── Google ──────────────────────────────────────────────────────────────────

const tokenCache = new Map();

function serviceAccount() {
  const raw = env('GOOGLE_SA_JSON');
  if (!raw) return null;
  const txt = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(txt);
}

export const hasGoogleUser = () =>
  !!(env('GOOGLE_OAUTH_CLIENT_ID') && env('GOOGLE_OAUTH_CLIENT_SECRET') && env('GOOGLE_OAUTH_REFRESH_TOKEN'));

/**
 * Jeton d'accès Google. `mode` :
 *  - 'user'    : compte Google de Paul (OAuth, jeton de rafraîchissement) — seul
 *                possible pour AdMob / AdSense ;
 *  - 'auto'    : compte utilisateur s'il est configuré, sinon compte de service ;
 *  - 'service' : compte de service uniquement (rapports Play dans Cloud Storage).
 */
export async function googleToken(scopes, mode = 'auto') {
  const useUser = mode !== 'service' && hasGoogleUser();
  const key = `${useUser ? 'u' : 's'}:${scopes.join(' ')}`;
  const hit = tokenCache.get(key);
  if (hit && hit.exp > Date.now() + 60000) return hit.token;

  let tok;
  if (useUser) {
    tok = await http('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: env('GOOGLE_OAUTH_CLIENT_ID'),
        client_secret: env('GOOGLE_OAUTH_CLIENT_SECRET'),
        refresh_token: env('GOOGLE_OAUTH_REFRESH_TOKEN'),
      }),
    });
  } else {
    if (mode === 'user') {
      throw new NotConfigured(
        ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REFRESH_TOKEN'],
        'Lancer node scripts/hq_google_oauth.mjs (voir HQ_SETUP.md)',
      );
    }
    const sa = serviceAccount();
    if (!sa) {
      throw new NotConfigured(
        ['GOOGLE_OAUTH_REFRESH_TOKEN ou GOOGLE_SA_JSON'],
        'Lancer node scripts/hq_google_oauth.mjs (voir HQ_SETUP.md)',
      );
    }
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
      iss: sa.client_email,
      scope: scopes.join(' '),
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })}`;
    const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), sa.private_key).toString('base64url');
    tok = await http('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${sig}`,
      }),
    });
  }
  tokenCache.set(key, { token: tok.access_token, exp: Date.now() + tok.expires_in * 1000 });
  return tok.access_token;
}

// ─── App Store Connect ───────────────────────────────────────────────────────

export function appleJwt() {
  need(['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_PRIVATE_KEY'], 'Clé API App Store Connect (voir HQ_SETUP.md)');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'ES256', kid: env('ASC_KEY_ID'), typ: 'JWT' })}.${b64({
    iss: env('ASC_ISSUER_ID'),
    iat: now,
    exp: now + 15 * 60,
    aud: 'appstoreconnect-v1',
  })}`;
  const pem = env('ASC_PRIVATE_KEY').replace(/\\n/g, '\n');
  const sig = crypto
    .sign('SHA256', Buffer.from(unsigned), { key: pem, dsaEncoding: 'ieee-p1363' })
    .toString('base64url');
  return `${unsigned}.${sig}`;
}
