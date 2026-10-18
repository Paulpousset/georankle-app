// Publie les shorts finis sur TikTok, Instagram (Reels) et YouTube (Shorts)
// sans audit d'app TikTok à passer, via deux services au choix, cumulables :
// - Zernio (https://zernio.com) : 2 comptes gratuits, publications illimitées.
//   Le script publie sur tous les comptes connectés au profil.
// - Upload-Post (https://upload-post.com) : 10 envois/mois gratuits sans
//   TikTok, ou plan payant pour tout.
// - En direct (api/_hq/direct.mjs) : comptes Instagram et TikTok de plus,
//   branchés depuis /hq (Vidéos › Comptes), sur les API officielles.
// Version gratuite : TikTok + Instagram sur Zernio, YouTube sur Upload-Post,
// les comptes en plus en direct.
//
// Source : les releases `shorts-N` créées par le workflow « Vidéos réseaux
// sociaux » (chaque .mp4 a son .txt avec le texte de la publication).
// Release `shorts-next` : vidéos montées à part (ex. concepts de l'atlas),
// publiées avant tout le reste, quel que soit le créneau, dans l'ordre de
// leur nom (01-…, 02-…). Demande de Paul le 12/10.
// Mémoire : posted.json, rangé dans la release `shorts-state`, liste ce qui
// est déjà parti. Une vidéo n'est jamais publiée deux fois.
//
// Par défaut rien ne part : sans DRY_RUN=0, le script affiche seulement ce
// qu'il publierait.
//
// Variables :
//   ZERNIO_API_KEY       clé API Zernio (facultative)
//   UPLOAD_POST_API_KEY  clé API Upload-Post (facultative)
//   UPLOAD_POST_USER     nom du profil créé dans Upload-Post (ex. georankle)
//   UPLOAD_POST_PLATFORMS  plateformes envoyées à Upload-Post
//                        (défaut youtube si Zernio est branché, sinon
//                        tiktok,instagram,youtube)
//   ZERNIO_API_KEY_EN    clé du 2e compte Zernio (comptes anglais) : vidéos -en-,
//                        leur propre file, aux mêmes créneaux (facultative)
//   ONLY_LANG            publier seulement la file de cette langue (ex. en),
//                        sans toucher aux comptes français
//   SOCIAL_ACCOUNTS_KEY  clé du coffre des comptes en direct (accounts.enc),
//                        la même que dans Vercel (facultative)
//   TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET  appli TikTok (renouvellement
//                        des jetons des comptes TikTok en direct)
//   TIKTOK_AUDITED       true une fois l'appli TikTok auditée : publication
//                        directe en public au lieu de la boîte de réception
//   LANGS                langues à publier, ex. "fr" ou "fr en" (défaut fr)
//   COUNT                vidéos par passage (défaut 1)
//   MIN_GAP_HOURS        ne rien publier si la dernière publication de la
//                        cible date de moins de N heures (0 = désactivé)
//   SCHEDULE             cron de la tâche planifiée (github.event.schedule) :
//                        rien n'est publié avec plus de MAX_LATE_MINUTES (60)
//                        de retard sur ce créneau
//   TARGET               social (Zernio : TikTok + Instagram), youtube
//                        (Upload-Post) ou all (défaut). Chaque cible a sa
//                        propre file : YouTube, moins fréquent, prend la
//                        vidéo la plus récente qu'il n'a pas encore eue.
//   KIND                 social seulement : globe (quiz globe*), jeu (modes
//                        de jeu animés : plus ou moins, quiz-*), app (vidéos
//                        de l'app) ou auto (défaut : globe avant 16 h à
//                        Paris, jeu après). Si la file de ce format est
//                        vide, un autre format part à la place.
//   MIN_RELEASE_APP      vidéos de l'app : ignorer les releases plus anciennes
//   MIN_RELEASE          ignorer les releases shorts-N avec N plus petit
//   VIDEO                publier cette vidéo-là (tag/fichier.mp4) au lieu
//                        de la suivante (bouton « Publier maintenant » de /hq)
//   DRY_RUN              0 pour publier pour de vrai
//   GITHUB_REPOSITORY    owner/repo (fourni par Actions)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  STATE_TAG, STATE_FILE, ORDER_FILE, DEFAULT_MIN_RELEASE_APP, kindFor, parisHourOf, postedFor as postedForTarget, upcoming,
} from '../../api/_hq/social-queue.mjs';
import { ACCOUNTS_FILE, open, seal, refresh, langOf, publishInstagram, publishTikTok } from '../../api/_hq/direct.mjs';

// Valeurs collées depuis un téléphone : on enlève espaces et retours à la ligne.
const env = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, v?.trim()]));
const REPO = env.GITHUB_REPOSITORY;
const ZERNIO = Boolean(env.ZERNIO_API_KEY);
const UPLOAD_POST = Boolean(env.UPLOAD_POST_API_KEY && env.UPLOAD_POST_USER);
const PLATFORMS = (env.UPLOAD_POST_PLATFORMS || (ZERNIO ? 'youtube' : 'tiktok,instagram,youtube'))
  .split(/[\s,]+/).filter(Boolean);
const LANGS = (env.LANGS || 'fr').split(/[\s,]+/).filter(Boolean);
const COUNT = Number(env.COUNT || 1);
const MIN_RELEASE = Number(env.MIN_RELEASE || 0);
const DRY_RUN = env.DRY_RUN !== '0';
const TARGET = env.TARGET || 'all';
// Vidéos de l'app : seulement à partir de cette release (voir social-queue.mjs).
const MIN_RELEASE_APP = Number(env.MIN_RELEASE_APP || DEFAULT_MIN_RELEASE_APP);
// Globe à midi, mode de jeu animé le soir (voir social-queue.mjs).
const KIND = kindFor(TARGET, env.KIND, parisHourOf(new Date()));
const USE_ZERNIO = ZERNIO && TARGET !== 'youtube';
const USE_UPLOAD_POST = (UPLOAD_POST || !ZERNIO) && TARGET !== 'social';
const USE_DIRECT = Boolean(env.SOCIAL_ACCOUNTS_KEY) && TARGET !== 'youtube';

const gh = (...args) => execFileSync('gh', [...args, '--repo', REPO], { encoding: 'utf8' });
const work = mkdtempSync(join(tmpdir(), 'social-post-'));

if (!REPO) throw new Error('GITHUB_REPOSITORY manquant (owner/repo)');
if (!DRY_RUN && !ZERNIO && !UPLOAD_POST && !USE_DIRECT) {
  throw new Error('Aucun service branché : ZERNIO_API_KEY, UPLOAD_POST_API_KEY + UPLOAD_POST_USER ou SOCIAL_ACCOUNTS_KEY');
}

// --- Mémoire de ce qui est déjà publié -------------------------------------

function loadState() {
  try {
    gh('release', 'download', STATE_TAG, '--pattern', STATE_FILE, '--dir', work, '--clobber');
  } catch {
    return { posted: [] };
  }
  return JSON.parse(readFileSync(join(work, STATE_FILE), 'utf8'));
}

// Choix faits à la main depuis /hq (onglet Vidéos) : { pinned: [clés], skipped: [clés] }.
function loadOrder() {
  try {
    gh('release', 'download', STATE_TAG, '--pattern', ORDER_FILE, '--dir', work, '--clobber');
    const order = JSON.parse(readFileSync(join(work, ORDER_FILE), 'utf8'));
    return { pinned: order.pinned ?? [], skipped: order.skipped ?? [] };
  } catch {
    return { pinned: [], skipped: [] };
  }
}

function saveState(state) {
  const path = join(work, STATE_FILE);
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
  try {
    gh('release', 'view', STATE_TAG);
  } catch {
    gh('release', 'create', STATE_TAG, '--prerelease', '--title', 'Shorts publiés (état)',
      '--notes', 'Tenu à jour par social-video/publish/post.mjs : ne pas supprimer, sinon les vidéos repartent.');
  }
  gh('release', 'upload', STATE_TAG, path, '--clobber');
}

// --- File d'attente ---------------------------------------------------------
// Le choix lui-même est dans api/_hq/social-queue.mjs, partagé avec la page
// « Vidéos » de /hq (social-video/ n'est pas envoyé à Vercel).

const postedFor = (p) => postedForTarget(p, TARGET);

function pending(state, langs = LANGS) {
  const order = loadOrder();
  const releases = JSON.parse(gh('release', 'list', '--limit', '100', '--json', 'tagName,createdAt,publishedAt'));
  const assetsOf = (tag) => JSON.parse(gh('release', 'view', tag, '--json', 'assets')).assets.map((a) => a.name);
  return upcoming({
    state, releases, assetsOf, target: TARGET, kind: KIND, langs, minRelease: MIN_RELEASE, minReleaseApp: MIN_RELEASE_APP,
    // Une vidéo retirée puis publiée à la main (VIDEO) part quand même.
    pinned: order.pinned, skipped: order.skipped.filter((key) => key !== env.VIDEO),
  });
}

// --- Publication ------------------------------------------------------------

function download(item) {
  const patterns = ['--pattern', item.name];
  if (item.hasCaption) patterns.push('--pattern', item.name.replace(/\.mp4$/, '.txt'));
  gh('release', 'download', item.tag, ...patterns, '--dir', work, '--clobber');
  const txt = join(work, item.name.replace(/\.mp4$/, '.txt'));
  return { video: join(work, item.name), caption: existsSync(txt) ? readFileSync(txt, 'utf8').trim() : '' };
}

// Titre YouTube : première ligne du texte, sans hashtags, 100 caractères max.
function youtubeTitle(caption) {
  const first = caption.split('\n').find((l) => l.trim() && !l.trim().startsWith('#')) || 'Georankle';
  return `${first.trim()} #shorts`.slice(0, 100);
}

async function postUploadPost(item, { video, caption }) {
  const form = new FormData();
  form.append('user', env.UPLOAD_POST_USER);
  for (const p of PLATFORMS) form.append('platform[]', p);
  form.append('video', new Blob([readFileSync(video)], { type: 'video/mp4' }), item.name);
  form.append('title', caption);
  form.append('description', caption);
  form.append('youtube_title', youtubeTitle(caption));
  form.append('youtube_description', caption);
  form.append('privacyStatus', 'public');
  form.append('media_type', 'REELS');
  form.append('privacy_level', 'PUBLIC_TO_EVERYONE');

  const res = await fetch('https://api.upload-post.com/api/upload', {
    method: 'POST',
    headers: { Authorization: `Apikey ${env.UPLOAD_POST_API_KEY}` },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    throw new Error(`Upload-Post ${res.status} : ${JSON.stringify(body).slice(0, 500)}`);
  }
  return { 'upload-post': PLATFORMS };
}

const ZERNIO_API = 'https://zernio.com/api/v1';

async function zernio(path, init = {}, key = env.ZERNIO_API_KEY) {
  const res = await fetch(`${ZERNIO_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Zernio ${path} ${res.status} : ${JSON.stringify(body).slice(0, 500)}`);
  return { status: res.status, body };
}

async function zernioAccounts(key) {
  const { body } = await zernio('/accounts', {}, key);
  return (body.accounts || []).filter((a) => a.isActive !== false && a.enabled !== false);
}

async function postZernio(item, { video, caption }, accounts, key) {
  const data = readFileSync(video);
  const { body: up } = await zernio('/media/presign', {
    method: 'POST',
    body: JSON.stringify({ filename: item.name, contentType: 'video/mp4', size: data.length }),
  }, key);
  const put = await fetch(up.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: data });
  if (!put.ok) throw new Error(`Zernio envoi de la vidéo ${put.status}`);

  const platforms = accounts.map((a) => ({
    platform: a.platform,
    accountId: a._id,
    platformSpecificData:
      a.platform === 'tiktok' ? { tiktokSettings: { privacy_level: 'PUBLIC_TO_EVERYONE', allow_comment: true } }
      : a.platform === 'youtube' ? { title: youtubeTitle(caption) }
      : {},
  }));
  const { status, body } = await zernio('/posts', {
    method: 'POST',
    body: JSON.stringify({ content: caption, mediaItems: [{ type: 'video', url: up.publicUrl }], platforms, publishNow: true }),
  }, key);
  // 207 : publié sur une partie des comptes seulement.
  if (status === 207) console.warn(`Zernio : publication partielle ${JSON.stringify(body).slice(0, 500)}`);
  return { zernio: accounts.map((a) => a.platform), zernioPost: body.post?._id ?? null };
}

// Comptes en direct : jetons renouvelés à chaque passage (TikTok : 24 h), le
// coffre est réécrit s'il a changé. Un compte en panne n'arrête pas les autres.
function loadDirect() {
  try {
    gh('release', 'download', STATE_TAG, '--pattern', ACCOUNTS_FILE, '--dir', work, '--clobber');
  } catch {
    return [];
  }
  return open(readFileSync(join(work, ACCOUNTS_FILE), 'utf8'), env.SOCIAL_ACCOUNTS_KEY);
}

async function refreshDirect(list) {
  let changed = false;
  const out = [];
  for (const acc of list) {
    try {
      const next = await refresh(acc, env);
      changed ||= next !== acc;
      out.push(next);
    } catch (e) {
      console.error(e.message);
      out.push({ ...acc, broken: e.message.slice(0, 200) });
    }
  }
  if (changed) {
    const path = join(work, ACCOUNTS_FILE);
    writeFileSync(path, seal(out, env.SOCIAL_ACCOUNTS_KEY));
    gh('release', 'upload', STATE_TAG, path, '--clobber');
  }
  return out.filter((a) => !a.broken);
}

async function postDirect(item, { video, caption }, list) {
  const data = readFileSync(video);
  const done = [];
  for (const acc of list) {
    try {
      if (acc.platform === 'instagram') await publishInstagram(acc, data, caption);
      else await publishTikTok(acc, data, caption, { audited: env.TIKTOK_AUDITED === 'true' });
      done.push(`${acc.platform} ${acc.name}`);
    } catch (e) {
      failed = true;
      console.error(e.message);
    }
  }
  return done.length ? { direct: done } : {};
}

// --- Main -------------------------------------------------------------------

const state = loadState();

// GitHub lance les tâches planifiées avec jusqu'à une heure de retard : si une
// publication manuelle a déjà comblé le créneau, la tâche planifiée ne repart
// pas une 2e fois.
// GitHub peut aussi la lancer des heures après le créneau (le 6/10, celle de
// 19 h 30 est partie à 23 h 48) : au-delà d'une heure de retard, le créneau
// est passé, on ne publie pas.
if (env.SCHEDULE) {
  const [minute, hour] = env.SCHEDULE.trim().split(/\s+/).map(Number);
  const slot = new Date();
  slot.setUTCHours(hour, minute, 0, 0);
  if (slot > Date.now()) slot.setUTCDate(slot.getUTCDate() - 1);
  const lateMinutes = (Date.now() - slot) / 60e3;
  if (lateMinutes > Number(env.MAX_LATE_MINUTES || 60)) {
    console.log(`[${TARGET}] tâche planifiée partie avec ${Math.round(lateMinutes)} min de retard : créneau passé, rien à faire.`);
    process.exit(0);
  }
}
// Pause des tâches planifiées demandée par Paul le 11/10 : le plus ou moins
// part à la main l'après-midi, rien à 19 h 30 ; reprise lundi 12/10.
const PAUSED_UNTIL = Date.parse('2026-10-12T00:00:00+02:00');
if (env.SCHEDULE && Date.now() < PAUSED_UNTIL) {
  console.log(`[${TARGET}] publications planifiées en pause jusqu'au 12/10 : rien à faire.`);
  process.exit(0);
}
const MIN_GAP_HOURS = Number(env.MIN_GAP_HOURS || 0);
const last = state.posted.filter(postedFor).map((p) => Date.parse(p.at)).filter(Boolean).sort().pop();
if (MIN_GAP_HOURS && last && Date.now() - last < MIN_GAP_HOURS * 3600e3) {
  console.log(`[${TARGET}] dernière publication il y a moins de ${MIN_GAP_HOURS} h : rien à faire.`);
  process.exit(0);
}

let failed = false;
const { todo: queued, wanted } = pending(state);
// VIDEO : une vidéo précise, lancée depuis /hq (« Publier maintenant »).
const todo = env.ONLY_LANG ? [] : env.VIDEO ? queued.filter((item) => item.key === env.VIDEO) : queued;
if (env.VIDEO && !todo.length) throw new Error(`${env.VIDEO} : introuvable dans la file (déjà publiée ?)`);
console.log(`[${TARGET}] ${todo.length} vidéo(s) en attente dont ${wanted.length} au format ${KIND || 'quelconque'} (langues ${LANGS.join(', ')}, releases ≥ shorts-${MIN_RELEASE}).`);

const accounts = USE_ZERNIO ? await zernioAccounts(env.ZERNIO_API_KEY) : [];
const allDirect = USE_DIRECT ? (DRY_RUN ? loadDirect() : await refreshDirect(loadDirect())) : [];
// Comptes dans une langue publiée (fr) : même vidéo que Zernio. Les autres
// (compte Instagram anglais…) ont leur propre file, plus bas.
const direct = allDirect.filter((a) => LANGS.includes(langOf(a)));
// 2e compte Zernio (autre adresse mail) pour les comptes anglais : ZERNIO_API_KEY_EN.
const ZERNIO_BY_LANG = TARGET === 'youtube' ? {} : Object.fromEntries([['en', env.ZERNIO_API_KEY_EN]].filter(([, k]) => k));
const otherLangs = [...new Set([...allDirect.map(langOf), ...Object.keys(ZERNIO_BY_LANG)].filter((l) => !LANGS.includes(l)))]
  .filter((l) => !env.ONLY_LANG || l === env.ONLY_LANG);
const targets = [
  ...accounts.map((a) => `${a.platform} (Zernio)`),
  ...direct.map((a) => `${a.platform} ${a.name} (direct)`),
  ...(USE_UPLOAD_POST ? PLATFORMS.map((p) => `${p} (Upload-Post)`) : []),
];

for (const item of todo.slice(0, COUNT)) {
  const files = download(item);
  if (DRY_RUN) {
    console.log(`[simulation] ${item.key} → ${targets.join(', ')}\n  ${files.caption.replace(/\n/g, '\n  ')}`);
    continue;
  }
  // Chaque service est indépendant : si l'un échoue (quota gratuit atteint),
  // la vidéo part quand même sur l'autre et n'est pas republiée demain.
  const done = {};
  if (accounts.length) {
    try { Object.assign(done, await postZernio(item, files, accounts)); }
    catch (e) { failed = true; console.error(e.message); }
  }
  if (direct.length) Object.assign(done, await postDirect(item, files, direct));
  if (USE_UPLOAD_POST && UPLOAD_POST) {
    try { Object.assign(done, await postUploadPost(item, files)); }
    catch (e) { failed = true; console.error(e.message); }
  }
  if (!Object.keys(done).length) break;
  console.log(`Publié ${item.key} → ${JSON.stringify(done)}`);
  state.posted.push({
    key: item.key, tag: item.tag, group: item.group, variant: item.variant,
    at: new Date().toISOString(), ...done,
  });
  // Écrit après chaque vidéo : un échec plus loin ne fait pas republier celle-ci.
  saveState(state);
}

// Comptes en direct dans une autre langue : leur propre file (vidéos -en-…),
// même format que le créneau, une vidéo jamais publiée deux fois.
for (const lang of env.VIDEO ? [] : otherLangs) {
  const accs = allDirect.filter((a) => langOf(a) === lang);
  const zKey = ZERNIO_BY_LANG[lang];
  const zAccs = zKey ? await zernioAccounts(zKey) : [];
  const { todo: queue } = pending(state, [lang]);
  console.log(`[${TARGET}/${lang}] ${queue.length} vidéo(s) en attente pour ${[...zAccs.map((a) => `${a.platform} (Zernio ${lang})`), ...accs.map((a) => a.name)].join(', ')}.`);
  for (const item of queue.slice(0, COUNT)) {
    const files = download(item);
    if (DRY_RUN) {
      console.log(`[simulation] ${item.key} → ${[...zAccs.map((a) => `${a.platform} (Zernio ${lang})`), ...accs.map((a) => `${a.platform} ${a.name}`)].join(', ')}\n  ${files.caption.replace(/\n/g, '\n  ')}`);
      continue;
    }
    const done = {};
    if (zAccs.length) {
      try { Object.assign(done, await postZernio(item, files, zAccs, zKey)); }
      catch (e) { failed = true; console.error(e.message); }
    }
    if (accs.length) Object.assign(done, await postDirect(item, files, accs));
    if (!Object.keys(done).length) break;
    console.log(`Publié ${item.key} → ${JSON.stringify(done)}`);
    state.posted.push({ key: item.key, tag: item.tag, group: item.group, variant: item.variant, at: new Date().toISOString(), lang, ...done });
    saveState(state);
  }
}

if (DRY_RUN && todo.length) console.log('Simulation : rien n\'a été publié (DRY_RUN=0 pour publier).');
if (failed) process.exitCode = 1;
