/** Sources Google : Search Console, Google Play (avis + vitals), AdMob, AdSense. */
import { env, http, settle, googleToken, isoDay, daysAgo } from './lib.mjs';

const PKG = 'com.paulpousset.geog';
const PUB = () => env('ADMOB_PUBLISHER_ID', 'pub-2429865520138981');

const gget = async (url, scopes, mode, opts = {}) =>
  http(url, {
    ...opts,
    headers: {
      authorization: `Bearer ${await googleToken(scopes, mode)}`,
      'content-type': 'application/json',
      ...(opts.headers ?? {}),
    },
  });

// ─── Search Console ──────────────────────────────────────────────────────────

const GSC = ['https://www.googleapis.com/auth/webmasters.readonly'];

export async function searchconsole({ days }) {
  const sites = await gget('https://www.googleapis.com/webmasters/v3/sites', GSC);
  const list = (sites.siteEntry ?? []).map((s) => s.siteUrl);
  const site =
    env('GSC_SITE') ?? list.find((s) => s === 'sc-domain:playgeog.com') ?? list.find((s) => s.includes('playgeog'));
  if (!site) throw new Error(`Aucune propriété playgeog.com visible (vues : ${list.join(', ') || 'aucune'})`);
  const enc = encodeURIComponent(site);
  // Les données Search Console ont ~2-3 jours de retard.
  const endDate = isoDay(daysAgo(2));
  const startDate = isoDay(daysAgo(days + 1));
  const q = (body) =>
    gget(`https://www.googleapis.com/webmasters/v3/sites/${enc}/searchAnalytics/query`, GSC, 'auto', {
      method: 'POST',
      body: JSON.stringify({ startDate, endDate, dataState: 'all', ...body }),
    });
  const prevQ = (body) =>
    gget(`https://www.googleapis.com/webmasters/v3/sites/${enc}/searchAnalytics/query`, GSC, 'auto', {
      method: 'POST',
      body: JSON.stringify({ startDate: isoDay(daysAgo(days * 2 + 1)), endDate: isoDay(daysAgo(days + 2)), ...body }),
    });
  const rowsOf = (r) =>
    (r.rows ?? []).map((x) => ({
      label: x.keys?.[0],
      clicks: x.clicks,
      impressions: x.impressions,
      ctr: x.ctr,
      position: x.position,
    }));

  return settle({
    site: async () => ({ site, range: [startDate, endDate] }),
    totals: async () => {
      const [cur, prev] = await Promise.all([q({}), prevQ({})]);
      return { cur: rowsOf(cur)[0] ?? null, prev: rowsOf(prev)[0] ?? null };
    },
    byDay: async () => rowsOf(await q({ dimensions: ['date'] })),
    queries: async () => rowsOf(await q({ dimensions: ['query'], rowLimit: 30 })),
    pages: async () => rowsOf(await q({ dimensions: ['page'], rowLimit: 25 })),
    countries: async () => rowsOf(await q({ dimensions: ['country'], rowLimit: 12 })),
    devices: async () => rowsOf(await q({ dimensions: ['device'] })),
    sitemaps: async () => {
      const r = await gget(`https://www.googleapis.com/webmasters/v3/sites/${enc}/sitemaps`, GSC);
      return (r.sitemap ?? []).map((s) => ({
        path: s.path,
        lastDownloaded: s.lastDownloaded,
        errors: Number(s.errors ?? 0),
        warnings: Number(s.warnings ?? 0),
        submitted: s.contents?.reduce((a, c) => a + Number(c.submitted ?? 0), 0),
        pending: s.isPending,
      }));
    },
  });
}

// ─── Google Play ─────────────────────────────────────────────────────────────

const PLAY = ['https://www.googleapis.com/auth/androidpublisher'];
const VITALS = ['https://www.googleapis.com/auth/playdeveloperreporting'];

export async function play({ days }) {
  const d = (x) => ({ year: x.getUTCFullYear(), month: x.getUTCMonth() + 1, day: x.getUTCDate() });
  const vitals = async (set, metrics) => {
    const r = await gget(`https://playdeveloperreporting.googleapis.com/v1beta1/apps/${PKG}/${set}:query`, VITALS, 'auto', {
      method: 'POST',
      body: JSON.stringify({
        timelineSpec: {
          aggregationPeriod: 'DAILY',
          startTime: { ...d(daysAgo(Math.min(days, 30) + 2)), timeZone: { id: 'America/Los_Angeles' } },
          endTime: { ...d(daysAgo(2)), timeZone: { id: 'America/Los_Angeles' } },
        },
        metrics,
      }),
    });
    return (r.rows ?? []).map((row) => {
      const o = { x: `${row.startTime.year}-${String(row.startTime.month).padStart(2, '0')}-${String(row.startTime.day).padStart(2, '0')}` };
      for (const m of row.metrics ?? []) o[m.metric] = Number(m.decimalValue?.value ?? 0);
      return o;
    });
  };
  return settle({
    reviews: async () => {
      const r = await gget(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}/reviews?maxResults=20`,
        PLAY,
      );
      return (r.reviews ?? []).map((rv) => {
        const c = rv.comments?.[0]?.userComment ?? {};
        return {
          author: rv.authorName,
          rating: c.starRating,
          text: c.text?.trim(),
          lang: c.reviewerLanguage,
          version: c.appVersionName,
          date: c.lastModified?.seconds ? new Date(Number(c.lastModified.seconds) * 1000).toISOString() : null,
        };
      });
    },
    crashes: () => vitals('crashRateMetricSet', ['crashRate', 'userPerceivedCrashRate', 'distinctUsers']),
    anrs: () => vitals('anrRateMetricSet', ['anrRate', 'userPerceivedAnrRate', 'distinctUsers']),
  });
}

// ─── AdMob (compte utilisateur obligatoire) ─────────────────────────────────

const ADMOB = ['https://www.googleapis.com/auth/admob.readonly'];

export async function admob({ days }) {
  const d = (x) => ({ year: x.getUTCFullYear(), month: x.getUTCMonth() + 1, day: x.getUTCDate() });
  const report = async (dimensions) => {
    const r = await gget(`https://admob.googleapis.com/v1/accounts/${PUB()}/networkReport:generate`, ADMOB, 'user', {
      method: 'POST',
      body: JSON.stringify({
        reportSpec: {
          dateRange: { startDate: d(daysAgo(days)), endDate: d(daysAgo(0)) },
          dimensions,
          metrics: ['ESTIMATED_EARNINGS', 'IMPRESSIONS', 'AD_REQUESTS', 'MATCH_RATE', 'CLICKS', 'IMPRESSION_RPM'],
          localizationSettings: { currencyCode: 'EUR' },
        },
      }),
    });
    return r
      .filter((x) => x.row)
      .map(({ row }) => {
        const dim = Object.fromEntries(
          Object.entries(row.dimensionValues).map(([k, v]) => [k, v.displayLabel ?? v.value]),
        );
        const m = row.metricValues;
        return {
          ...dim,
          earnings: Number(m.ESTIMATED_EARNINGS?.microsValue ?? 0) / 1e6,
          impressions: Number(m.IMPRESSIONS?.integerValue ?? 0),
          requests: Number(m.AD_REQUESTS?.integerValue ?? 0),
          clicks: Number(m.CLICKS?.integerValue ?? 0),
          matchRate: m.MATCH_RATE?.doubleValue ?? null,
          rpm: Number(m.IMPRESSION_RPM?.microsValue ?? 0) / 1e6,
        };
      });
  };
  return settle({
    byDay: async () =>
      (await report(['DATE'])).map((r) => ({ ...r, x: `${r.DATE.slice(0, 4)}-${r.DATE.slice(4, 6)}-${r.DATE.slice(6)}` })),
    byFormat: () => report(['FORMAT']),
    byCountry: async () => (await report(['COUNTRY'])).sort((a, b) => b.earnings - a.earnings).slice(0, 10),
    byApp: () => report(['APP']),
  });
}

// ─── AdSense (site web) ─────────────────────────────────────────────────────

const ADSENSE = ['https://www.googleapis.com/auth/adsense.readonly'];

export async function adsense({ days }) {
  const base = `https://adsense.googleapis.com/v2/accounts/${PUB()}`;
  const s = daysAgo(days);
  const e = daysAgo(0);
  const range =
    `dateRange=CUSTOM&startDate.year=${s.getUTCFullYear()}&startDate.month=${s.getUTCMonth() + 1}&startDate.day=${s.getUTCDate()}` +
    `&endDate.year=${e.getUTCFullYear()}&endDate.month=${e.getUTCMonth() + 1}&endDate.day=${e.getUTCDate()}`;
  const metrics = ['ESTIMATED_EARNINGS', 'PAGE_VIEWS', 'IMPRESSIONS', 'CLICKS', 'PAGE_VIEWS_RPM'];
  const report = async (dim) => {
    const r = await gget(
      `${base}/reports:generate?${range}&currencyCode=EUR&dimensions=${dim}&${metrics.map((m) => `metrics=${m}`).join('&')}`,
      ADSENSE,
      'user',
    );
    return (r.rows ?? []).map((row) => {
      const [label, ...vals] = row.cells.map((c) => c.value);
      return {
        label,
        earnings: Number(vals[0] ?? 0),
        pageViews: Number(vals[1] ?? 0),
        impressions: Number(vals[2] ?? 0),
        clicks: Number(vals[3] ?? 0),
        rpm: Number(vals[4] ?? 0),
      };
    });
  };
  return settle({
    account: async () => {
      const a = await gget(base, ADSENSE, 'user');
      return { state: a.state, pendingTasks: a.pendingTasks ?? [], timeZone: a.timeZone?.id };
    },
    sites: async () => {
      const r = await gget(`${base}/sites`, ADSENSE, 'user');
      return (r.sites ?? []).map((x) => ({ domain: x.domain, state: x.state, autoAds: x.autoAdsEnabled }));
    },
    alerts: async () => {
      const r = await gget(`${base}/alerts`, ADSENSE, 'user');
      return (r.alerts ?? []).map((x) => ({ severity: x.severity, message: x.message, type: x.type }));
    },
    byDay: async () => (await report('DATE')).map((r) => ({ ...r, x: r.label })),
  });
}
