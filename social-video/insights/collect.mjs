// Relevé des stats de chaque vidéo publiée (TikTok, Instagram) via l'API
// analytics de Zernio, rattachées à la vidéo d'origine grâce à posted.json
// (release shorts-state) : concept, accroche, format, langue, durée.
// Lecture seule : rien n'est publié ni modifié.
//
//   ZERNIO_API_KEY      compte Zernio français (obligatoire)
//   ZERNIO_API_KEY_EN   compte Zernio anglais (facultatif)
//   DAYS                jours en arrière (défaut 60)
//   OUT                 dossier de sortie (défaut social-video/insights/out)
//   GITHUB_REPOSITORY   owner/repo (fourni par Actions)
//   ZERNIO_BASE         autre adresse d'API (essais avec un faux serveur)
//
// Écrit OUT/posts.json : une ligne par post et par plateforme.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe } from './videos.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, v?.trim()]));
const REPO = env.GITHUB_REPOSITORY || 'Paulpousset/georankle-app';
const DAYS = Number(env.DAYS || 60);
const OUT = env.OUT || join(HERE, 'out');
mkdirSync(OUT, { recursive: true });
const KEYS = { fr: env.ZERNIO_API_KEY, en: env.ZERNIO_API_KEY_EN };
if (!KEYS.fr && !KEYS.en) throw new Error('ZERNIO_API_KEY manquante');

const BASE = env.ZERNIO_BASE || 'https://zernio.com/api/v1';
async function zernio(path, key) {
  const res = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${key}` } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const release = (tag, file) => `https://github.com/${REPO}/releases/download/${tag}/${file}`;
async function postedJson() {
  const res = await fetch(release('shorts-state', 'posted.json'));
  if (!res.ok) throw new Error(`posted.json ${res.status}`);
  return (await res.json()).posted ?? [];
}

// Durée de chaque vidéo : ffprobe lit seulement l'en-tête du MP4 en ligne.
// Gardée d'un relevé à l'autre (durations.json) pour ne pas relire.
const durFile = join(OUT, 'durations.json');
const durations = existsSync(durFile) ? JSON.parse(readFileSync(durFile, 'utf8')) : {};
function durationOf(key) {
  if (key in durations) return durations[key];
  const [tag, file] = key.split('/');
  try {
    const s = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', release(tag, file)], { encoding: 'utf8', timeout: 30000 });
    durations[key] = Math.round(Number(s.trim()) * 10) / 10 || null;
  } catch {
    durations[key] = null;
  }
  return durations[key];
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const posted = await postedJson();
const byPost = Object.fromEntries(posted.filter((p) => p.zernioPost).map((p) => [p.zernioPost, p]));
const fromDate = new Date(Date.now() - DAYS * 864e5).toISOString().slice(0, 10);
const rows = [];
const seenFields = {};

for (const [lang, key] of Object.entries(KEYS)) {
  if (!key) continue;
  for (let page = 1; page <= 20; page++) {
    const { status, body } = await zernio(`/analytics?source=all&fromDate=${fromDate}&limit=100&page=${page}&sortBy=date&order=desc`, key);
    if (status !== 200) {
      console.log(`[${lang}] analytics ${status} : ${JSON.stringify(body).slice(0, 500)}`);
      break;
    }
    for (const p of body.posts ?? []) {
      const per = p.platforms?.length ? p.platforms : [{ platform: p.platform, analytics: p.analytics, platformPostUrl: p.platformPostUrl }];
      for (const x of per) {
        const a = { ...(p.analytics ?? {}), ...(x.analytics ?? {}) };
        const platform = x.platform ?? p.platform;
        // Tous les champs chiffrés que Zernio renvoie, listés une fois par plateforme
        // (pour repérer un nouveau champ utile, ex. taux de « swipe » Instagram).
        (seenFields[platform] ||= new Set());
        for (const [k, v] of Object.entries(a)) if (typeof v === 'number') seenFields[platform].add(k);
        const src = byPost[p.latePostId] ?? null;
        const video = src ? describe(src.key) : { concept: 'manuel', format: 'manuel', hook: null };
        const avgWatchMs = num(a.igReelsAvgWatchTime) ?? num(a.averageTimeWatched) ?? num(a.avgWatchTime);
        rows.push({
          platform,
          account: lang,
          lang: src?.lang ?? video.lang ?? lang,
          postId: p.latePostId ?? null,
          url: x.platformPostUrl ?? p.platformPostUrl ?? null,
          at: p.publishedAt ?? p.scheduledFor,
          ageHours: Math.round((Date.now() - Date.parse(p.publishedAt ?? p.scheduledFor)) / 36e5),
          key: src?.key ?? null,
          ...video,
          durationS: src ? durationOf(src.key) : null,
          caption: (p.content ?? '').replace(/\s+/g, ' ').slice(0, 120),
          views: num(a.views),
          reach: num(a.reach),
          likes: num(a.likes),
          comments: num(a.comments),
          shares: num(a.shares),
          saves: num(a.saves),
          follows: num(a.follows),
          completionRate: num(a.completionRate),
          avgWatchS: avgWatchMs == null ? null : Math.round(avgWatchMs / 100) / 10,
          // Instagram : part des gens qui font défiler dans les 3 premières secondes.
          skipRate: num(a.reelsSkipRate) ?? num(a.igReelsSkipRate) ?? num(a.skipRate),
          raw: Object.fromEntries(Object.entries(a).filter(([, v]) => typeof v === 'number')),
        });
      }
    }
    const pg = body.pagination ?? {};
    if (!(body.posts ?? []).length || (pg.pages && page >= pg.pages) || pg.hasMore === false) break;
  }
}

for (const [platform, fields] of Object.entries(seenFields)) console.log(`champs ${platform} : ${[...fields].sort().join(', ')}`);
writeFileSync(join(OUT, 'posts.json'), JSON.stringify(rows, null, 1));
writeFileSync(durFile, JSON.stringify(durations, null, 1));
console.log(`${rows.length} lignes (${rows.filter((r) => r.key).length} rattachées à une vidéo) → ${join(OUT, 'posts.json')}`);
