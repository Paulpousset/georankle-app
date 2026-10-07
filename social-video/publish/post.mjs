// Publie les shorts finis sur TikTok, Instagram (Reels) et YouTube (Shorts)
// sans audit d'app TikTok à passer, via deux services au choix, cumulables :
// - Zernio (https://zernio.com) : 2 comptes gratuits, publications illimitées.
//   Le script publie sur tous les comptes connectés au profil.
// - Upload-Post (https://upload-post.com) : 10 envois/mois gratuits sans
//   TikTok, ou plan payant pour tout.
// Version gratuite : TikTok + Instagram sur Zernio, YouTube sur Upload-Post.
//
// Source : les releases `shorts-N` créées par le workflow « Vidéos réseaux
// sociaux » (chaque .mp4 a son .txt avec le texte de la publication).
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
//   MIN_RELEASE          ignorer les releases shorts-N avec N plus petit
//   DRY_RUN              0 pour publier pour de vrai
//   GITHUB_REPOSITORY    owner/repo (fourni par Actions)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
const USE_ZERNIO = ZERNIO && TARGET !== 'youtube';
const USE_UPLOAD_POST = (UPLOAD_POST || !ZERNIO) && TARGET !== 'social';
const STATE_TAG = 'shorts-state';
const STATE_FILE = 'posted.json';

const gh = (...args) => execFileSync('gh', [...args, '--repo', REPO], { encoding: 'utf8' });
const work = mkdtempSync(join(tmpdir(), 'social-post-'));

if (!REPO) throw new Error('GITHUB_REPOSITORY manquant (owner/repo)');
if (!DRY_RUN && !ZERNIO && !UPLOAD_POST) {
  throw new Error('Aucun service branché : ZERNIO_API_KEY ou UPLOAD_POST_API_KEY + UPLOAD_POST_USER');
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

// higher-lower-fr-v2.mp4 → { group: higher-lower-fr, lang: fr, variant: v2 }
function parse(name) {
  const m = name.match(/^(.+)-([a-z]{2})-(v\d+)\.mp4$/);
  return m && { group: `${m[1]}-${m[2]}`, lang: m[2], variant: m[3] };
}

// Une publication compte pour la cible du passage si elle est partie sur le
// service de cette cible.
function postedFor(p) {
  if (TARGET === 'social') return Boolean(p.zernio);
  if (TARGET === 'youtube') return Boolean(p['upload-post']);
  return true;
}

function queue(state) {
  const posted = state.posted.filter(postedFor);
  const done = new Set(posted.map((p) => p.key));
  const releases = JSON.parse(gh('release', 'list', '--limit', '100', '--json', 'tagName,createdAt'))
    .filter((r) => /^shorts-\d+$/.test(r.tagName) && Number(r.tagName.slice(7)) >= MIN_RELEASE)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (TARGET === 'youtube') releases.reverse();

  // Les accroches v1 / v2 d'une même vidéo montrent la même partie : une seule
  // part par release, en alternant d'une release à l'autre pour comparer.
  const variantUses = {};
  for (const p of posted) variantUses[p.variant] = (variantUses[p.variant] || 0) + 1;

  const out = [];
  for (const { tagName } of releases) {
    const assets = JSON.parse(gh('release', 'view', tagName, '--json', 'assets')).assets.map((a) => a.name);
    const groups = {};
    for (const name of assets) {
      const info = parse(name);
      if (!info || !LANGS.includes(info.lang)) continue;
      (groups[info.group] ||= []).push({ ...info, name, tag: tagName, key: `${tagName}/${name}` });
    }
    for (const [group, variants] of Object.entries(groups).sort()) {
      if (posted.some((p) => p.tag === tagName && p.group === group)) continue;
      const pick = variants
        .filter((v) => !done.has(v.key))
        .sort((a, b) => (variantUses[a.variant] || 0) - (variantUses[b.variant] || 0) || a.variant.localeCompare(b.variant))[0];
      if (pick) out.push({ ...pick, hasCaption: assets.includes(pick.name.replace(/\.mp4$/, '.txt')) });
    }
  }
  return out;
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

async function zernio(path, init = {}) {
  const res = await fetch(`${ZERNIO_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json', ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Zernio ${path} ${res.status} : ${JSON.stringify(body).slice(0, 500)}`);
  return { status: res.status, body };
}

async function zernioAccounts() {
  const { body } = await zernio('/accounts');
  return (body.accounts || []).filter((a) => a.isActive !== false && a.enabled !== false);
}

async function postZernio(item, { video, caption }, accounts) {
  const data = readFileSync(video);
  const { body: up } = await zernio('/media/presign', {
    method: 'POST',
    body: JSON.stringify({ filename: item.name, contentType: 'video/mp4', size: data.length }),
  });
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
  });
  // 207 : publié sur une partie des comptes seulement.
  if (status === 207) console.warn(`Zernio : publication partielle ${JSON.stringify(body).slice(0, 500)}`);
  return { zernio: accounts.map((a) => a.platform), zernioPost: body.post?._id ?? null };
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
const MIN_GAP_HOURS = Number(env.MIN_GAP_HOURS || 0);
const last = state.posted.filter(postedFor).map((p) => Date.parse(p.at)).filter(Boolean).sort().pop();
if (MIN_GAP_HOURS && last && Date.now() - last < MIN_GAP_HOURS * 3600e3) {
  console.log(`[${TARGET}] dernière publication il y a moins de ${MIN_GAP_HOURS} h : rien à faire.`);
  process.exit(0);
}

const todo = queue(state);
console.log(`[${TARGET}] ${todo.length} vidéo(s) en attente (langues ${LANGS.join(', ')}, releases ≥ shorts-${MIN_RELEASE}).`);

const accounts = USE_ZERNIO ? await zernioAccounts() : [];
const targets = [
  ...accounts.map((a) => `${a.platform} (Zernio)`),
  ...(USE_UPLOAD_POST ? PLATFORMS.map((p) => `${p} (Upload-Post)`) : []),
];
let failed = false;

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

if (DRY_RUN && todo.length) console.log('Simulation : rien n\'a été publié (DRY_RUN=0 pour publier).');
if (failed) process.exitCode = 1;
