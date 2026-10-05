// Publie les shorts finis sur TikTok, Instagram (Reels) et YouTube (Shorts)
// via Upload-Post (https://upload-post.com), une seule clé pour toutes les
// plateformes et pas d'audit d'app TikTok à passer.
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
//   UPLOAD_POST_API_KEY  clé API Upload-Post (obligatoire hors simulation)
//   UPLOAD_POST_USER     nom du profil créé dans Upload-Post (ex. georankle)
//   PLATFORMS            tiktok,instagram,youtube (défaut)
//   LANGS                langues à publier, ex. "fr" ou "fr en" (défaut fr)
//   COUNT                vidéos par passage (défaut 1)
//   MIN_RELEASE          ignorer les releases shorts-N avec N plus petit
//   DRY_RUN              0 pour publier pour de vrai
//   GITHUB_REPOSITORY    owner/repo (fourni par Actions)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = process.env;
const REPO = env.GITHUB_REPOSITORY;
const PLATFORMS = (env.PLATFORMS || 'tiktok,instagram,youtube').split(/[\s,]+/).filter(Boolean);
const LANGS = (env.LANGS || 'fr').split(/[\s,]+/).filter(Boolean);
const COUNT = Number(env.COUNT || 1);
const MIN_RELEASE = Number(env.MIN_RELEASE || 0);
const DRY_RUN = env.DRY_RUN !== '0';
const STATE_TAG = 'shorts-state';
const STATE_FILE = 'posted.json';

const gh = (...args) => execFileSync('gh', [...args, '--repo', REPO], { encoding: 'utf8' });
const work = mkdtempSync(join(tmpdir(), 'social-post-'));

if (!REPO) throw new Error('GITHUB_REPOSITORY manquant (owner/repo)');
if (!DRY_RUN && !(env.UPLOAD_POST_API_KEY && env.UPLOAD_POST_USER)) {
  throw new Error('UPLOAD_POST_API_KEY et UPLOAD_POST_USER sont requis pour publier');
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

function queue(state) {
  const done = new Set(state.posted.map((p) => p.key));
  const releases = JSON.parse(gh('release', 'list', '--limit', '100', '--json', 'tagName,createdAt'))
    .filter((r) => /^shorts-\d+$/.test(r.tagName) && Number(r.tagName.slice(7)) >= MIN_RELEASE)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Les accroches v1 / v2 d'une même vidéo montrent la même partie : une seule
  // part par release, en alternant d'une release à l'autre pour comparer.
  const variantUses = {};
  for (const p of state.posted) variantUses[p.variant] = (variantUses[p.variant] || 0) + 1;

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
      if (state.posted.some((p) => p.tag === tagName && p.group === group)) continue;
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

async function post(item, { video, caption }) {
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
  return body;
}

// --- Main -------------------------------------------------------------------

const state = loadState();
const todo = queue(state);
console.log(`${todo.length} vidéo(s) en attente (langues ${LANGS.join(', ')}, releases ≥ shorts-${MIN_RELEASE}).`);

for (const item of todo.slice(0, COUNT)) {
  const files = download(item);
  if (DRY_RUN) {
    console.log(`[simulation] ${item.key} → ${PLATFORMS.join(', ')}\n  ${files.caption.replace(/\n/g, '\n  ')}`);
    continue;
  }
  const result = await post(item, files);
  console.log(`Publié ${item.key} → ${PLATFORMS.join(', ')}`);
  state.posted.push({
    key: item.key, tag: item.tag, group: item.group, variant: item.variant,
    platforms: PLATFORMS, at: new Date().toISOString(), result: result.results ?? null,
  });
  // Écrit après chaque vidéo : un échec plus loin ne fait pas republier celle-ci.
  saveState(state);
}

if (DRY_RUN && todo.length) console.log('Simulation : rien n\'a été publié (DRY_RUN=0 pour publier).');
