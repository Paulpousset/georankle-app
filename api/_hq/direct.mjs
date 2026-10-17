// Comptes Instagram et TikTok branchés en direct sur les API officielles,
// sans Zernio ni Upload-Post : gratuit, sans limite de comptes (demande de
// Paul le 17/10, offres gratuites des deux services pleines).
//
// - Instagram : appli Meta « Instagram API with Instagram Login ». En mode
//   développement, elle publie sur les comptes ajoutés comme testeurs de
//   l'appli, sans validation de Meta. Comptes pro (Créateur ou Entreprise).
// - TikTok : appli TikTok for Developers (Login Kit + Content Posting API).
//   Tant que TikTok n'a pas audité l'appli, une publication directe reste
//   privée : on envoie donc la vidéo dans la boîte de réception TikTok du
//   compte (notification, il reste à appuyer sur Publier). Une fois l'appli
//   auditée, TIKTOK_AUDITED=true publie directement en public.
//
// Les jetons sont rangés chiffrés (AES-256-GCM, clé SOCIAL_ACCOUNTS_KEY) dans
// accounts.enc, release shorts-state : le dépôt est public. Partagé par la
// page /hq (branchement d'un compte, api/oauth.mjs) et le script de
// publication (social-video/publish/post.mjs, qui renouvelle les jetons).
import crypto from 'node:crypto';

export const ACCOUNTS_FILE = 'accounts.enc';
const IG = 'https://graph.instagram.com/v23.0';
const TT = 'https://open.tiktokapis.com/v2';
const DAY = 86400e3;

// ─── Coffre chiffré ──────────────────────────────────────────────────────────

const keyOf = (secret) => crypto.createHash('sha256').update(`georankle-accounts:${secret}`).digest();

export function seal(accounts, secret) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const data = Buffer.concat([c.update(JSON.stringify({ accounts, at: new Date().toISOString() })), c.final()]);
  return `v1.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${data.toString('base64url')}\n`;
}

export function open(text, secret) {
  if (!text?.trim()) return [];
  const [v, iv, tag, data] = text.trim().split('.');
  if (v !== 'v1') throw new Error(`${ACCOUNTS_FILE} : format inconnu`);
  const d = crypto.createDecipheriv('aes-256-gcm', keyOf(secret), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8')).accounts ?? [];
}

/** Ajoute ou remplace un compte (même réseau, même identifiant). */
export const upsert = (accounts, acc) => [...accounts.filter((a) => !(a.platform === acc.platform && a.id === acc.id)), acc];

/** Ce qu'on peut montrer sans les jetons. */
export const publicView = (accounts) => accounts.map((a) => ({ platform: a.platform, name: a.name, lang: langOf(a), expires: a.expires ?? null }));

// Langue des vidéos que reçoit le compte (choisie au branchement).
export const LANGS = ['fr', 'en'];
export const langOf = (a) => (LANGS.includes(a.lang) ? a.lang : 'fr');

// ─── Petits outils HTTP ──────────────────────────────────────────────────────

async function call(url, init = {}, what = url) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeout ?? 60000) });
  const text = await res.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { text: text.slice(0, 300) }; }
  // TikTok répond 200 avec error.code ≠ ok en cas d'échec.
  if (!res.ok || (body?.error && body.error.code !== 'ok') || body?.error_type) {
    throw new Error(`${what} ${res.status} : ${JSON.stringify(body.error ?? body).slice(0, 400)}`);
  }
  return body;
}
const form = (o) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Branchement (OAuth) ─────────────────────────────────────────────────────

export const PLATFORMS = ['instagram', 'tiktok'];

/** Identifiants d'appli attendus côté Vercel pour brancher un compte. */
export const APP_KEYS = {
  instagram: ['IG_APP_ID', 'IG_APP_SECRET'],
  tiktok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
};

export function authorizeUrl(platform, { env, redirect, state }) {
  if (platform === 'instagram') {
    return `https://www.instagram.com/oauth/authorize?${new URLSearchParams({
      enable_fb_login: '0', force_authentication: '1', client_id: env.IG_APP_ID, redirect_uri: redirect,
      response_type: 'code', scope: 'instagram_business_basic,instagram_business_content_publish', state,
    })}`;
  }
  return `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY, scope: 'user.info.basic,video.upload,video.publish',
    response_type: 'code', redirect_uri: redirect, state, disable_auto_auth: '1',
  })}`;
}

/** Code reçu au retour → compte prêt à publier { platform, id, name, token, … }. */
export async function exchange(platform, code, { env, redirect }) {
  if (platform === 'instagram') {
    const short = await call('https://api.instagram.com/oauth/access_token', form({
      client_id: env.IG_APP_ID, client_secret: env.IG_APP_SECRET, grant_type: 'authorization_code',
      redirect_uri: redirect, code: code.replace(/#_$/, ''),
    }), 'Instagram (code)');
    const s = short.data?.[0] ?? short;
    const long = await call(`https://graph.instagram.com/access_token?${new URLSearchParams({
      grant_type: 'ig_exchange_token', client_secret: env.IG_APP_SECRET, access_token: s.access_token,
    })}`, {}, 'Instagram (jeton long)');
    const me = await call(`${IG}/me?fields=user_id,username&access_token=${encodeURIComponent(long.access_token)}`, {}, 'Instagram (profil)');
    return {
      platform, id: String(me.user_id ?? s.user_id), name: `@${me.username}`, token: long.access_token,
      expires: new Date(Date.now() + (long.expires_in ?? 60 * 86400) * 1000).toISOString(), refreshed: new Date().toISOString(),
    };
  }
  const t = await call(`${TT}/oauth/token/`, form({
    client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, code: decodeURIComponent(code),
    grant_type: 'authorization_code', redirect_uri: redirect,
  }), 'TikTok (code)');
  const me = await call(`${TT}/user/info/?fields=open_id,display_name`, { headers: { authorization: `Bearer ${t.access_token}` } }, 'TikTok (profil)');
  return { platform, id: t.open_id, name: me.data?.user?.display_name ?? t.open_id, ...tiktokTokens(t) };
}

const tiktokTokens = (t) => ({
  token: t.access_token,
  expires: new Date(Date.now() + t.expires_in * 1000).toISOString(),
  refresh: t.refresh_token,
  refreshExpires: new Date(Date.now() + t.refresh_expires_in * 1000).toISOString(),
});

/**
 * Renouvelle le jeton s'il le faut. Instagram : 60 jours, renouvelé une fois
 * par semaine. TikTok : 24 h, renouvelé à chaque passage (jeton de
 * renouvellement valable un an, prolongé à chaque fois).
 * Renvoie le compte mis à jour, ou le même s'il n'y avait rien à faire.
 */
export async function refresh(acc, env) {
  if (acc.platform === 'instagram') {
    if (Date.now() - Date.parse(acc.refreshed ?? 0) < 7 * DAY) return acc;
    const r = await call(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(acc.token)}`, {}, `Instagram ${acc.name} (renouvellement)`);
    return { ...acc, token: r.access_token, expires: new Date(Date.now() + r.expires_in * 1000).toISOString(), refreshed: new Date().toISOString() };
  }
  if (Date.parse(acc.expires) - Date.now() > 2 * 3600e3) return acc;
  const t = await call(`${TT}/oauth/token/`, form({
    client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: acc.refresh,
  }), `TikTok ${acc.name} (renouvellement)`);
  return { ...acc, ...tiktokTokens(t) };
}

// ─── Publication ─────────────────────────────────────────────────────────────

/** Reel Instagram : envoi direct du fichier (pas besoin d'URL publique). */
export async function publishInstagram(acc, video, caption) {
  const auth = `access_token=${encodeURIComponent(acc.token)}`;
  const box = await call(`${IG}/${acc.id}/media?${auth}`, form({
    media_type: 'REELS', upload_type: 'resumable', caption, share_to_feed: 'true',
  }), `Instagram ${acc.name} (conteneur)`);
  await call(box.uri ?? `https://rupload.facebook.com/ig-api-upload/v23.0/${box.id}`, {
    method: 'POST', headers: { authorization: `OAuth ${acc.token}`, offset: '0', file_size: String(video.length) }, body: video, timeout: 300000,
  }, `Instagram ${acc.name} (envoi)`);
  for (let i = 0; i < 60; i++) {
    const s = await call(`${IG}/${box.id}?fields=status_code,status&${auth}`, {}, `Instagram ${acc.name} (traitement)`);
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram ${acc.name} : ${s.status}`);
    if (i === 59) throw new Error(`Instagram ${acc.name} : vidéo toujours en traitement après 10 min`);
    await sleep(10000);
  }
  const done = await call(`${IG}/${acc.id}/media_publish?${auth}`, form({ creation_id: box.id }), `Instagram ${acc.name} (publication)`);
  return done.id;
}

/**
 * TikTok : publication directe si l'appli est auditée (audited), sinon envoi
 * dans la boîte de réception du compte (brouillon à valider dans l'app).
 * Morceaux de 10 Mo, le dernier prend le reste (règle de TikTok).
 */
export async function publishTikTok(acc, video, caption, { audited }) {
  const headers = { authorization: `Bearer ${acc.token}`, 'content-type': 'application/json; charset=UTF-8' };
  const size = video.length;
  const CH = 10 * 1024 * 1024;
  const count = size <= 64 * 1024 * 1024 ? 1 : Math.floor(size / CH);
  const chunk = count === 1 ? size : CH;
  const source_info = { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunk, total_chunk_count: count };
  let init;
  if (audited) {
    const info = await call(`${TT}/post/publish/creator_info/query/`, { method: 'POST', headers }, `TikTok ${acc.name} (créateur)`);
    const options = info.data?.privacy_level_options ?? [];
    const privacy_level = options.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : options[0] ?? 'SELF_ONLY';
    init = await call(`${TT}/post/publish/video/init/`, {
      method: 'POST', headers,
      body: JSON.stringify({
        post_info: { title: caption.slice(0, 2200), privacy_level, disable_comment: false, disable_duet: false, disable_stitch: false },
        source_info,
      }),
    }, `TikTok ${acc.name} (début)`);
  } else {
    init = await call(`${TT}/post/publish/inbox/video/init/`, { method: 'POST', headers, body: JSON.stringify({ source_info }) }, `TikTok ${acc.name} (début)`);
  }
  const { publish_id, upload_url } = init.data;
  for (let i = 0; i < count; i++) {
    const start = i * chunk;
    const end = i === count - 1 ? size : start + chunk;
    const res = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'content-type': 'video/mp4', 'content-length': String(end - start), 'content-range': `bytes ${start}-${end - 1}/${size}` },
      body: video.subarray(start, end),
      signal: AbortSignal.timeout(300000),
    });
    if (!res.ok) throw new Error(`TikTok ${acc.name} (envoi ${i + 1}/${count}) ${res.status} : ${(await res.text()).slice(0, 300)}`);
  }
  for (let i = 0; i < 60; i++) {
    const s = await call(`${TT}/post/publish/status/fetch/`, { method: 'POST', headers, body: JSON.stringify({ publish_id }) }, `TikTok ${acc.name} (suivi)`);
    const st = s.data?.status;
    if (st === 'PUBLISH_COMPLETE' || st === 'SEND_TO_USER_INBOX') return { publish_id, status: st };
    if (st === 'FAILED') throw new Error(`TikTok ${acc.name} : ${s.data?.fail_reason ?? 'échec'}`);
    await sleep(10000);
  }
  return { publish_id, status: 'PROCESSING' };
}
