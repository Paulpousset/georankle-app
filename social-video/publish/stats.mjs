// Stats des posts TikTok / Instagram via l'API analytics de Zernio
// (vues, likes, commentaires, partages, enregistrements par post).
// Lecture seule : rien n'est publié ni modifié.
//
// Écrit social-stats.json (toutes les lignes) et affiche un tableau TSV.
// Variables : ZERNIO_API_KEY, DAYS (défaut 60).
import { writeFileSync } from 'node:fs';

const KEY = process.env.ZERNIO_API_KEY;
if (!KEY) throw new Error('ZERNIO_API_KEY manquante');
const DAYS = Number(process.env.DAYS || 60);

async function zernio(path) {
  const res = await fetch(`https://zernio.com/api/v1${path}`, { headers: { authorization: `Bearer ${KEY}` } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const acc = await zernio('/accounts');
console.log(`comptes : ${(acc.body.accounts || []).map((a) => `${a.platform}:${a.username ?? a.displayName ?? ''}`).join(', ')}`);
console.log(`hasAnalyticsAccess : ${acc.body.hasAnalyticsAccess}`);

const fromDate = new Date(Date.now() - DAYS * 864e5).toISOString().slice(0, 10);
const rows = [];
for (let page = 1; page <= 20; page++) {
  const { status, body } = await zernio(`/analytics?source=all&fromDate=${fromDate}&limit=100&page=${page}&sortBy=date&order=desc`);
  if (status !== 200) {
    console.log(`analytics ${status} : ${JSON.stringify(body).slice(0, 800)}`);
    break;
  }
  if (page === 1) console.log(`overview : ${JSON.stringify(body.overview ?? {})}`);
  for (const p of body.posts ?? []) {
    const per = p.platforms?.length ? p.platforms : [{ platform: p.platform, analytics: p.analytics, platformPostUrl: p.platformPostUrl }];
    for (const x of per) {
      const a = x.analytics ?? p.analytics ?? {};
      rows.push({
        platform: x.platform ?? p.platform, at: p.publishedAt ?? p.scheduledFor, latePostId: p.latePostId ?? null,
        external: Boolean(p.isExternal), url: x.platformPostUrl ?? p.platformPostUrl ?? null,
        content: (p.content ?? '').replace(/\s+/g, ' ').slice(0, 90),
        views: a.views ?? null, reach: a.reach ?? null, likes: a.likes ?? null, comments: a.comments ?? null,
        shares: a.shares ?? null, saves: a.saves ?? null, follows: a.follows ?? null,
        completionRate: a.completionRate ?? null, avgWatch: a.igReelsAvgWatchTime ?? null,
      });
    }
  }
  const pg = body.pagination ?? {};
  if (!(body.posts ?? []).length || (pg.pages && page >= pg.pages) || pg.hasMore === false) break;
}

writeFileSync('social-stats.json', JSON.stringify(rows, null, 1));
const cols = ['platform', 'at', 'views', 'reach', 'likes', 'comments', 'shares', 'saves', 'follows', 'completionRate', 'avgWatch', 'latePostId', 'content'];
console.log(`\n${rows.length} lignes\n${cols.join('\t')}`);
for (const r of rows) console.log(cols.map((c) => r[c] ?? '').join('\t'));
