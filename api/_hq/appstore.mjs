/** Source « App Store » : note publique (sans clé) + ventes et avis (clé App Store Connect). */
import zlib from 'node:zlib';
import { env, need, http, settle, appleJwt, isoDay, daysAgo } from './lib.mjs';

const APP_ID = '6779650018';

export async function appstore({ days }) {
  const asc = (p) =>
    http(`https://api.appstoreconnect.apple.com/v1/${p}`, { headers: { authorization: `Bearer ${appleJwt()}` } });

  return settle({
    // API publique iTunes : note moyenne et version en ligne, par vitrine.
    rating: async () => {
      const stores = ['fr', 'us', 'be', 'ca', 'gb'];
      const res = await Promise.all(
        stores.map(async (c) => {
          const r = await http(`https://itunes.apple.com/lookup?id=${APP_ID}&country=${c}`);
          const a = r.results?.[0];
          return a && { store: c.toUpperCase(), rating: a.averageUserRating, count: a.userRatingCount, version: a.version };
        }),
      );
      return res.filter(Boolean);
    },
    reviews: async () => {
      const r = await asc(`apps/${APP_ID}/customerReviews?sort=-createdDate&limit=15`);
      return r.data.map((x) => ({
        rating: x.attributes.rating,
        title: x.attributes.title,
        text: x.attributes.body,
        author: x.attributes.reviewerNickname,
        territory: x.attributes.territory,
        date: x.attributes.createdDate,
      }));
    },
    // Rapport SALES quotidien (J-1 disponible vers midi UTC) : téléchargements et revenus.
    sales: async () => {
      need(['ASC_VENDOR_NUMBER']);
      const n = Math.min(days, 30);
      const dates = Array.from({ length: n }, (_, i) => isoDay(daysAgo(n - i)));
      const jwt = appleJwt();
      const rows = await Promise.all(
        dates.map(async (date) => {
          try {
            const buf = await http(
              `https://api.appstoreconnect.apple.com/v1/salesReports?filter[frequency]=DAILY&filter[reportType]=SALES&filter[reportSubType]=SUMMARY&filter[vendorNumber]=${env('ASC_VENDOR_NUMBER')}&filter[reportDate]=${date}`,
              { headers: { authorization: `Bearer ${jwt}` }, binary: true },
            );
            return { x: date, ...parseSales(buf) };
          } catch (e) {
            // 404 = aucune vente ce jour-là (ou rapport pas encore publié).
            if (String(e.message).startsWith('404')) return { x: date, downloads: 0, redownloads: 0, updates: 0, proceeds: 0 };
            return { x: date, downloads: null, error: e.message };
          }
        }),
      );
      return rows;
    },
  });
}

function parseSales(buf) {
  if (!buf) return { downloads: 0, redownloads: 0, updates: 0, proceeds: 0 };
  let txt;
  try {
    txt = zlib.gunzipSync(Buffer.from(buf)).toString('utf8');
  } catch {
    txt = Buffer.from(buf).toString('utf8');
  }
  const [head, ...lines] = txt.trim().split('\n');
  const cols = head.split('\t');
  const idx = (n) => cols.indexOf(n);
  const out = { downloads: 0, redownloads: 0, updates: 0, proceeds: 0 };
  for (const l of lines) {
    const c = l.split('\t');
    const type = c[idx('Product Type Identifier')] ?? '';
    const units = Number(c[idx('Units')] ?? 0);
    if (/^1/.test(type)) out.downloads += units;
    else if (/^3/.test(type)) out.redownloads += units;
    else if (/^7/.test(type)) out.updates += units;
    out.proceeds += units * Number(c[idx('Developer Proceeds')] ?? 0);
  }
  return out;
}
