/**
 * Source « Vidéos » : les prochaines publications automatiques (workflow
 * social-post.yml). On rejoue créneau par créneau le choix de
 * social-queue.mjs, le même que le script de publication, à
 * partir des releases GitHub et de posted.json : ce qui s'affiche ici est ce
 * qui partira, tant qu'aucun nouveau tournage n'arrive entre-temps.
 *
 * Dépôt public : la lecture marche sans jeton. GITHUB_TOKEN relève la limite
 * de l'API GitHub, donne accès aux variables du dépôt (SOCIAL_POST_ENABLED…)
 * et, avec Contents + Actions en écriture, permet de changer l'ordre
 * (order.json) et de publier une vidéo tout de suite (social-post.yml).
 */
import crypto from 'node:crypto';
import { env, http, NotConfigured } from './lib.mjs';
import {
  STATE_TAG, STATE_FILE, ORDER_FILE, NEXT_TAG, DEFAULT_MIN_RELEASE_APP, kindFor, parisHourOf, postedFor, upcoming,
} from './social-queue.mjs';

const REPO = () => env('GITHUB_REPOSITORY', 'Paulpousset/georankle-app');
const API = () => `https://api.github.com/repos/${REPO()}`;
const DAYS_AHEAD = 7;
const HISTORY = 15;

const ghHeaders = (accept = 'application/vnd.github+json') => {
  const token = env('GITHUB_TOKEN');
  return { accept, 'user-agent': 'georankle-hq', ...(token ? { authorization: `Bearer ${token}` } : {}) };
};

/** Fichier d'une release : par l'API avec jeton (dépôt privé possible), sinon lien public. */
async function assetText(asset) {
  if (env('GITHUB_TOKEN')) {
    const buf = await http(`${API()}/releases/assets/${asset.id}`, { headers: ghHeaders('application/octet-stream'), binary: true });
    return buf.toString('utf8');
  }
  const { text } = await http(asset.browser_download_url, { raw: true });
  return text;
}

/** Variables du dépôt lues par social-post.yml (jeton avec accès aux variables). */
async function repoVars() {
  if (!env('GITHUB_TOKEN')) return null;
  try {
    const r = await http(`${API()}/actions/variables?per_page=30`, { headers: ghHeaders() });
    return Object.fromEntries(r.variables.map((v) => [v.name, v.value.trim()]));
  } catch {
    return null;
  }
}

/** Zernio : comptes branchés (TikTok, Instagram…), si la clé est aussi dans Vercel. */
async function zernioPlatforms() {
  if (!env('ZERNIO_API_KEY')) return null;
  try {
    const r = await http('https://zernio.com/api/v1/accounts', { headers: { authorization: `Bearer ${env('ZERNIO_API_KEY')}` } });
    return (r.accounts ?? []).filter((a) => a.isActive !== false && a.enabled !== false).map((a) => a.platform);
  } catch {
    return null;
  }
}

/**
 * Créneaux des tâches planifiées de social-post.yml (heures UTC) :
 * social à 10:30 et 17:30, YouTube à 16:00 les 1, 4, 7… 28 du mois.
 */
function slots(now) {
  const out = [];
  const day0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let d = 0; d <= DAYS_AHEAD; d++) {
    const base = day0 + d * 86400000;
    out.push({ at: new Date(base + 10.5 * 3600000), target: 'social' });
    if ((new Date(base).getUTCDate() - 1) % 3 === 0 && new Date(base).getUTCDate() <= 28) {
      out.push({ at: new Date(base + 16 * 3600000), target: 'youtube' });
    }
    out.push({ at: new Date(base + 17.5 * 3600000), target: 'social' });
  }
  // Un créneau passé depuis moins d'une heure peut encore partir (retard GitHub).
  return out.filter((s) => s.at.getTime() + 3600000 > now.getTime() && s.at.getTime() < now.getTime() + DAYS_AHEAD * 86400000);
}

const FORMAT_NAMES = {
  plusmoins: 'Plus ou moins', 'quiz-capitals': 'Quiz capitales', 'quiz-flags': 'Quiz drapeaux', 'quiz-silhouette': 'Quiz silhouettes',
  capitals: 'App · capitales', flags: 'App · drapeaux', 'higher-lower': 'App · plus ou moins',
};
function formatOf(item) {
  if (item.tag === NEXT_TAG) return { kind: 'next', label: 'Prioritaire' };
  const game = item.group.replace(/-[a-z]{2}$/, '').replace(/\d+$/, '');
  if (game === 'globe') return { kind: 'globe', label: 'Globe' };
  if (/^(plusmoins|quiz-)/.test(item.group)) return { kind: 'jeu', label: FORMAT_NAMES[game] ?? game };
  return { kind: 'app', label: FORMAT_NAMES[game] ?? `App · ${game}` };
}

export async function social() {
  const now = new Date();
  const [list, vars, zernio] = await Promise.all([
    http(`${API()}/releases?per_page=100`, { headers: ghHeaders() }),
    repoVars(),
    zernioPlatforms(),
  ]);
  const byTag = Object.fromEntries(list.map((r) => [r.tag_name, r]));
  const releases = list.map((r) => ({ tagName: r.tag_name, createdAt: r.created_at, publishedAt: r.published_at }));
  const assetsOf = (tag) => (byTag[tag]?.assets ?? []).map((a) => a.name);
  const assetOf = (tag, name) => byTag[tag]?.assets.find((a) => a.name === name);

  const stateAsset = assetOf(STATE_TAG, STATE_FILE);
  const orderAsset = assetOf(STATE_TAG, ORDER_FILE);
  const [state, order, postRuns, videoRuns] = await Promise.all([
    stateAsset ? assetText(stateAsset).then(JSON.parse) : { posted: [] },
    orderAsset ? assetText(orderAsset).then(JSON.parse).catch(() => ({})) : {},
    workflowRuns('social-post.yml'),
    workflowRuns('social-video.yml'),
  ]);
  const pinned = Array.isArray(order.pinned) ? order.pinned : [];
  const skipped = Array.isArray(order.skipped) ? order.skipped : [];

  // Réglages de social-post.yml (valeurs par défaut si les variables ne sont pas lisibles).
  const langs = (vars?.SOCIAL_POST_LANGS || 'fr').split(/[\s,]+/).filter(Boolean);
  const minRelease = Number(vars?.SOCIAL_POST_MIN_RELEASE || 23);
  const enabled = vars ? vars.SOCIAL_POST_ENABLED !== 'false' : null;
  const socialPlatforms = zernio ?? ['tiktok', 'instagram'];
  const youtubePlatforms = (vars?.UPLOAD_POST_PLATFORMS || 'youtube').split(/[\s,]+/).filter(Boolean);

  // Simulation : chaque créneau prend la tête de file, puis compte comme publié.
  const sim = { posted: [...state.posted] };
  const out = [];
  for (const slot of slots(now)) {
    const { target } = slot;
    const kind = kindFor(target, 'auto', parisHourOf(slot.at));
    const last = sim.posted.filter((p) => postedFor(p, target)).map((p) => Date.parse(p.at)).filter(Boolean).sort().pop();
    // MIN_GAP_HOURS = 3 sur les tâches planifiées : créneau déjà rempli.
    if (last && slot.at - last < 3 * 3600000) {
      if (slot.at <= now) continue;
      out.push({ at: slot.at.toISOString(), target, kind, skipped: 'Publication manuelle récente : ce créneau ne publiera rien.' });
      continue;
    }
    const { todo, wanted } = upcoming({ state: sim, releases, assetsOf, target, kind, langs, minRelease, minReleaseApp: DEFAULT_MIN_RELEASE_APP, pinned, skipped });
    const item = todo[0];
    const row = { at: slot.at.toISOString(), target, kind, platforms: target === 'social' ? socialPlatforms : youtubePlatforms, left: todo.length };
    if (!item) {
      out.push({ ...row, skipped: 'File vide : rien ne partira.' });
      continue;
    }
    const video = assetOf(item.tag, item.name);
    row.item = {
      key: item.key, tag: item.tag, name: item.name, group: item.group, variant: item.variant,
      format: formatOf(item), hasCaption: item.hasCaption, assetId: video?.id ?? null, size: video?.size ?? null,
      releaseAt: byTag[item.tag]?.created_at ?? null,
      previewUrl: video ? previewUrl(video.id) : null,
      pinned: target === 'social' && pinned.includes(item.key),
    };
    row.fallback = item.tag !== NEXT_TAG && kind && !row.item.pinned && !wanted.includes(item) ? true : undefined;
    out.push(row);
    sim.posted.push({
      key: item.key, tag: item.tag, group: item.group, variant: item.variant, at: slot.at.toISOString(),
      ...(target === 'social' ? { zernio: socialPlatforms } : { 'upload-post': youtubePlatforms }),
    });
  }

  // Légendes : celles qui vont partir, et celles des dernières publications.
  const history = [...state.posted].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, HISTORY);
  const caption = async (tag, name) => {
    const a = assetOf(tag, name.replace(/\.mp4$/, '.txt'));
    return a ? (await assetText(a).catch(() => null))?.trim() ?? null : null;
  };
  await Promise.all([
    ...out.filter((r) => r.item?.hasCaption).map(async (r) => { r.item.caption = await caption(r.item.tag, r.item.name); }),
    ...history.map(async (p) => { p.caption = await caption(p.tag, p.key.split('/').pop()); }),
  ]);

  // Alertes : ce qui risque de faire un doublon ou une erreur. Deux rendus
  // d'une même partie ont presque la même taille (à 0,2 % près) ; deux parties
  // différentes, rarement. Les empreintes, elles, changent à chaque rendu.
  const sizeOf = (p) => assetOf(p.tag, p.key.split('/').pop())?.size;
  // Une même vidéo sur TikTok et sur YouTube n'est pas un doublon : on compare cible par cible.
  const seen = state.posted.map((p) => ({
    target: p.zernio ? 'social' : 'youtube', group: p.group, size: sizeOf(p), what: `publiée le ${String(p.at).slice(0, 10)} (${p.tag})`,
  }));
  for (const r of out) {
    if (!r.item) continue;
    const w = [];
    if (!r.item.hasCaption) w.push('Pas de légende (.txt absent) : la vidéo partira sans texte.');
    else if (!r.item.caption) w.push('Légende illisible.');
    const { size, group } = r.item;
    const twin = size && seen.find((x) => x.target === r.target && x.group === group && x.size && Math.abs(x.size - size) / size < 0.002);
    if (twin) w.push(`Sans doute la même partie que la vidéo ${twin.what} : taille quasi identique.`);
    seen.push({ target: r.target, group, size, what: `prévue le ${r.at.slice(0, 10)} (${r.item.tag})` });
    if (r.fallback) w.push(`File « ${r.kind} » vide : un autre format part à la place.`);
    r.warnings = w;
  }

  // Banque : toutes les vidéos des releases, avec ce qu'elles deviennent.
  const postedBy = new Map();
  for (const p of state.posted) postedBy.set(p.key, [...(postedBy.get(p.key) ?? []), p]);
  const planned = new Map();
  for (const r of out) if (r.item && !planned.has(r.item.key)) planned.set(r.item.key, r.at);
  const waiting = new Set(upcoming({ state, releases, assetsOf, target: 'social', kind: 'globe', langs, minRelease, pinned, skipped }).todo.map((i) => i.key));
  const removed = new Set(skipped);
  const bank = list
    .filter((r) => /^shorts-/.test(r.tag_name) && r.tag_name !== STATE_TAG)
    .sort((a, b) => (a.tag_name === NEXT_TAG ? -1 : b.tag_name === NEXT_TAG ? 1 : b.created_at.localeCompare(a.created_at)))
    .map((r) => ({
      tag: r.tag_name,
      at: r.created_at,
      videos: r.assets.filter((a) => a.name.endsWith('.mp4')).map((a) => {
        const key = `${r.tag_name}/${a.name}`;
        const posts = postedBy.get(key) ?? [];
        const status = posts.length ? 'posted' : removed.has(key) ? 'removed' : planned.has(key) ? 'planned' : waiting.has(key) ? 'waiting' : 'unused';
        return {
          key, name: a.name, size: a.size, status, previewUrl: previewUrl(a.id),
          format: formatOf({ tag: r.tag_name, group: a.name.replace(/-v\d+\.mp4$/, '') }),
          postedAt: posts[0]?.at ?? null,
          platforms: [...new Set(posts.flatMap((p) => [...(p.zernio ?? []), ...(p['upload-post'] ?? [])]))],
          plannedAt: planned.get(key) ?? null,
        };
      }),
    }))
    .filter((r) => r.videos.length);

  return {
    repo: REPO(),
    settings: { enabled, langs, minRelease, varsRead: Boolean(vars), zernioRead: Boolean(zernio), canWrite: Boolean(env('GITHUB_TOKEN')) },
    pinned,
    skipped,
    running: postRuns?.filter((w) => w.running) ?? null,
    generation: videoRuns,
    bank,
    slots: out,
    history: history.map((p) => ({
      at: p.at, key: p.key, tag: p.tag, platforms: [...(p.zernio ?? []), ...(p['upload-post'] ?? [])], caption: p.caption ?? null,
      format: formatOf(p),
    })),
  };
}

/** Derniers passages d'un workflow (publication, tournage) : en cours ou fini, et comment. */
async function workflowRuns(file) {
  if (!env('GITHUB_TOKEN')) return null;
  try {
    const r = await http(`${API()}/actions/workflows/${file}/runs?per_page=5`, { headers: ghHeaders() });
    return r.workflow_runs.map((w) => ({
      at: w.created_at, updated: w.updated_at, event: w.event, url: w.html_url,
      running: ['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(w.status), conclusion: w.conclusion,
    }));
  } catch {
    return null;
  }
}

// ─── Aperçu vidéo ────────────────────────────────────────────────────────────
// GitHub sert les vidéos des releases en application/octet-stream : Safari
// (iPhone) refuse de les lire. On les relaie par morceaux en video/mp4, avec
// un lien signé (la balise <video> ne peut pas envoyer le jeton de session).
const PREVIEW_TTL = 12 * 3600;
const CHUNK = 2 * 1024 * 1024; // sous la limite de 4,5 Mo d'une réponse Vercel
const secret = () => env('HQ_VIDEO_SECRET') ?? env('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const sign = (id, exp) => crypto.createHmac('sha256', secret()).update(`video:${id}:${exp}`).digest('base64url');

function previewUrl(id) {
  const exp = Math.floor(Date.now() / 1000) + PREVIEW_TTL;
  return `/api/hq?source=video&id=${id}&exp=${exp}&sig=${sign(id, exp)}`;
}

const signedUrls = new Map(); // id → { url, at } (liens GitHub valables 5 à 30 min)
async function githubUrl(id) {
  const hit = signedUrls.get(id);
  if (hit && Date.now() - hit.at < 4 * 60000) return hit.url;
  const res = await fetch(`${API()}/releases/assets/${id}`, {
    headers: ghHeaders('application/octet-stream'),
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  const url = res.headers.get('location');
  if (!url) throw new Error(`GitHub ${res.status}`);
  signedUrls.set(id, { url, at: Date.now() });
  return url;
}

/** GET /api/hq?source=video&id&exp&sig : un morceau de la vidéo (Range). */
export async function videoProxy(request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? '';
  const exp = Number(url.searchParams.get('exp'));
  const sig = url.searchParams.get('sig') ?? '';
  const good = sign(id, exp);
  if (!secret() || !/^\d{1,12}$/.test(id) || !(exp > Date.now() / 1000) || sig.length !== good.length
    || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) {
    return new Response('lien expiré', { status: 403 });
  }
  const m = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('range') ?? '') ?? [null, '0', ''];
  const start = Number(m[1]);
  const end = Math.min(m[2] ? Number(m[2]) : Infinity, start + CHUNK - 1);
  const up = await fetch(await githubUrl(id), { headers: { range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(20000) });
  if (!up.ok) {
    signedUrls.delete(id);
    return new Response(`GitHub ${up.status}`, { status: up.status === 416 ? 416 : 502 });
  }
  const body = await up.arrayBuffer();
  const headers = {
    'content-type': 'video/mp4',
    'accept-ranges': 'bytes',
    'content-length': String(body.byteLength),
    'cache-control': 'private, max-age=3600',
    'x-robots-tag': 'noindex',
  };
  const range = up.headers.get('content-range');
  if (range) headers['content-range'] = range;
  return new Response(body, { status: range ? 206 : 200, headers });
}

// ─── Actions depuis /hq ──────────────────────────────────────────────────────
function needWrite() {
  if (!env('GITHUB_TOKEN')) throw new NotConfigured(['GITHUB_TOKEN'], 'Jeton GitHub avec Contents et Actions en lecture et écriture');
}
const KEY = /^shorts-[\w-]+\/[\w.-]+\.mp4$/;

const keyList = (v, max) => Array.isArray(v) && v.length <= max && v.every((k) => typeof k === 'string' && KEY.test(k));

/**
 * Choix faits à la main, rangés dans order.json (release shorts-state) :
 * pinned (ordre des prochaines vidéos) et skipped (vidéos retirées).
 * patch : { pinned } pour l'ordre, { skip: clé } ou { unskip: clé }.
 */
export async function setOrder(patch) {
  needWrite();
  const release = await http(`${API()}/releases/tags/${STATE_TAG}`, { headers: ghHeaders() });
  const old = release.assets.find((a) => a.name === ORDER_FILE);
  const cur = old ? JSON.parse(await assetText(old).catch(() => '{}')) : {};
  let pinned = Array.isArray(cur.pinned) ? cur.pinned : [];
  let skipped = Array.isArray(cur.skipped) ? cur.skipped : [];
  if ('pinned' in patch) {
    if (!keyList(patch.pinned, 60)) throw new Error('ordre invalide');
    pinned = patch.pinned;
  } else if (typeof patch.skip === 'string' && KEY.test(patch.skip)) {
    skipped = [...skipped, patch.skip];
    pinned = pinned.filter((k) => k !== patch.skip);
  } else if (typeof patch.unskip === 'string' && KEY.test(patch.unskip)) {
    skipped = skipped.filter((k) => k !== patch.unskip);
  } else {
    throw new Error('modification invalide');
  }
  if (old) await http(`${API()}/releases/assets/${old.id}`, { method: 'DELETE', headers: ghHeaders() });
  pinned = [...new Set(pinned)];
  skipped = [...new Set(skipped)].slice(-500);
  const body = JSON.stringify({ pinned, skipped, at: new Date().toISOString() }, null, 2) + '\n';
  await http(`https://uploads.github.com/repos/${REPO()}/releases/${release.id}/assets?name=${ORDER_FILE}`, {
    method: 'POST',
    headers: { ...ghHeaders(), 'content-type': 'application/json' },
    body,
  });
  return { pinned, skipped };
}

/** Lance social-post.yml sur TikTok + Instagram pour cette vidéo-là. */
export async function publishNow(key) {
  needWrite();
  if (typeof key !== 'string' || !KEY.test(key)) throw new Error('vidéo invalide');
  const [tag, name] = key.split('/');
  const release = await http(`${API()}/releases/tags/${tag}`, { headers: ghHeaders() });
  if (!release.assets.some((a) => a.name === name)) throw new Error(`${key} introuvable`);
  const repo = await http(API(), { headers: ghHeaders() });
  await http(`${API()}/actions/workflows/social-post.yml/dispatches`, {
    method: 'POST',
    headers: { ...ghHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({
      ref: repo.default_branch,
      inputs: { target: 'social', kind: 'auto', count: '1', video: key, dry_run: 'false' },
    }),
  });
  return { ok: true };
}

/** Lance un tournage (social-video.yml) : formats animés seuls, ou avec l'app filmée. */
export async function generate({ record, globes }) {
  needWrite();
  const n = Number(globes);
  if (!Number.isInteger(n) || n < 0 || n > 6) throw new Error('nombre de globes invalide');
  const repo = await http(API(), { headers: ghHeaders() });
  await http(`${API()}/actions/workflows/social-video.yml/dispatches`, {
    method: 'POST',
    headers: { ...ghHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ ref: repo.default_branch, inputs: { record: String(Boolean(record)), globes: String(n) } }),
  });
  return { ok: true };
}
