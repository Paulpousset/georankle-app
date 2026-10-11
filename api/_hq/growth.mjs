/**
 * Source « Croissance » (onglet du même nom) : téléchargements par jour et par
 * plateforme, pays, entonnoir des nouveaux joueurs, rétention, engagement,
 * revenus par utilisateur et repères (versions, push, campagnes).
 * Tout est filtrable par pays (ISO2) et plateforme, sur N jours ou des dates perso.
 */
import { settle, PLATFORM, hogql, hogFilter, windowOf, isoDay, NotConfigured } from './lib.mjs';
import { appstoreDaily } from './appstore.mjs';
import { playInstalls, admobEarnings, adsenseEarnings } from './google.mjs';
import { rest } from './supabase.mjs';

const PLATS = ['iOS', 'Android', 'Web'];

export async function growth({ days, from, to, countries, exclude, platform }) {
  const W = windowOf({ days, from, to });
  const geo = { countries, exclude };
  const F = hogFilter({ ...geo, platform });
  const FC = hogFilter(geo); // séries par plateforme : la plateforme est une dimension

  // Nouveaux joueurs : premières ouvertures de l'app, ou première visite du site.
  const installsIn = (w, keys) =>
    hogql(`
      select ${W.bucket} d, ${PLATFORM} p, uniq(person_id)
      from events
      where ${w}${FC}
        and (event = 'Application Installed'
             or (event = '$pageview' and ${PLATFORM} = 'Web' and toDate(timestamp) = toDate(person.created_at)))
      group by d, p`).then((rows) => {
      const m = {};
      for (const [d, p, n] of rows) (m[p] ??= {})[d] = n;
      return Object.fromEntries(PLATS.map((p) => [p, keys.map((k) => m[p]?.[k] ?? 0)]));
    });

  return settle({
    window: async () => ({ first: W.first, last: W.last, buckets: W.buckets, hourly: W.hourly, custom: W.custom }),

    installs: async () => {
      const [cur, prev] = await Promise.all([installsIn(W.cur, W.buckets), installsIn(W.prev, W.prevBuckets)]);
      return { cur, prev };
    },

    // Chiffres officiels des stores (jour par jour, pas à l'heure).
    appstore: async () => (W.hourly ? null : appstoreDaily(W.buckets.slice(-90), geo)),
    play: async () => (W.hourly ? null : playInstalls(W.buckets, geo)),

    // Séries des tuiles : actifs, inscriptions, parties, par seau (période et précédente).
    series: async () => {
      const q = (w, keys) =>
        hogql(`
          select ${W.bucket} d, uniq(person_id), uniqIf(person_id, event = 'signed_up'), countIf(event = 'game_completed')
          from events where ${w}${F} group by d`).then((rows) => {
          const m = Object.fromEntries(rows.map(([d, ...v]) => [d, v]));
          const col = (i) => keys.map((k) => m[k]?.[i] ?? 0);
          return { active: col(0), signups: col(1), games: col(2) };
        });
      const [cur, prev] = await Promise.all([q(W.cur, W.buckets), q(W.prev, W.prevBuckets)]);
      return { cur, prev };
    },

    // Cohorte : personnes vues pour la première fois sur la période.
    cohort: async () => {
      const rows = await hogql(`
        select plat, c, count(),
          countIf(has(evs, 'Application Installed')),
          countIf(has(evs, 'game_started')),
          countIf(has(evs, 'game_completed')),
          countIf(has(evs, 'signed_up')),
          countIf(d0 <= today() - 1), countIf(d0 <= today() - 1 and has(ds, d0 + 1)),
          countIf(d0 <= today() - 7), countIf(d0 <= today() - 7 and has(ds, d0 + 7)),
          countIf(d0 <= today() - 30), countIf(d0 <= today() - 30 and has(ds, d0 + 30))
        from (
          select person_id,
            toDate(any(person.created_at)) d0,
            argMin(${PLATFORM}, timestamp) plat,
            argMin(properties.$geoip_country_code, timestamp) c,
            groupUniqArray(event) evs,
            groupUniqArray(toDate(timestamp)) ds
          from events
          where timestamp >= ${W.start} and person.created_at >= ${W.start} and person.created_at < ${W.end}${F}
          group by person_id
        )
        group by plat, c`);
      const keys = ['n', 'installed', 'started', 'completed', 'signed', 'e1', 'r1', 'e7', 'r7', 'e30', 'r30'];
      return rows.map(([plat, c, ...v]) => ({ plat, c: c ?? null, ...Object.fromEntries(keys.map((k, i) => [k, v[i]])) }));
    },

    // Par pays : nouveaux joueurs et actifs (la carte montre tous les pays).
    countries: async () => {
      const rows = await hogql(`
        select properties.$geoip_country_code c,
          uniqIf(person_id, event = 'Application Installed'
                 or (event = '$pageview' and ${PLATFORM} = 'Web' and toDate(timestamp) = toDate(person.created_at))) n,
          uniq(person_id) a
        from events where ${W.cur}${hogFilter({ platform })}
        group by c order by a desc limit 200`);
      return rows.filter(([c]) => c).map(([c, installs, active]) => ({ c, installs, active }));
    },

    engagement: async () => {
      const [[users, personDays, games, daily]] = await hogql(`
        select uniq(person_id), uniq(person_id, toDate(timestamp)), countIf(event = 'game_completed'),
               uniqIf(person_id, event = 'daily_completed')
        from events where ${W.cur}${F}`);
      const [[avgSession, medianSession]] = await hogql(`
        select avg(d), median(d) from (
          select properties.$session_id s, dateDiff('second', min(timestamp), max(timestamp)) d
          from events where ${W.cur}${F} and properties.$session_id is not null and properties.$session_id != ''
          group by s
        ) where d > 0 and d < 14400`);
      return { users, personDays, games, daily, avgSession, medianSession, n: W.n };
    },

    // Revenus pub : AdMob (app) et AdSense (site), filtrés par pays.
    revenue: async () => {
      const app = platform !== 'web';
      const web = platform !== 'ios' && platform !== 'android';
      const sumOf = (rows) => rows.reduce((s, r) => s + r.earnings, 0);
      const safe = (p) => p.catch((e) => ({ error: e.message, missing: e.missing }));
      const [am, amPrev, amCountry, as, asPrev, asCountry] = await Promise.all([
        app ? safe(admobEarnings({ first: W.first, last: W.last, dimension: 'DATE', ...geo })) : [],
        app ? safe(admobEarnings({ first: W.prevFirst, last: W.prevLast, dimension: 'DATE', ...geo })) : [],
        app ? safe(admobEarnings({ first: W.first, last: W.last, dimension: 'COUNTRY' })) : [],
        web ? safe(adsenseEarnings({ first: W.first, last: W.last, dimension: 'DATE', ...geo })) : [],
        web ? safe(adsenseEarnings({ first: W.prevFirst, last: W.prevLast, dimension: 'DATE', ...geo })) : [],
        web ? safe(adsenseEarnings({ first: W.first, last: W.last, dimension: 'COUNTRY_CODE' })) : [],
      ]);
      const ok = (x) => Array.isArray(x);
      const asked = [app && am, web && as].filter(Boolean);
      const missing = asked.filter((x) => !ok(x) && x.missing).flatMap((x) => x.missing);
      if (!asked.some(ok)) {
        if (missing.length) {
          throw new NotConfigured([...new Set(missing)], 'Lancer node scripts/hq_google_oauth.mjs (voir HQ_SETUP.md)');
        }
        throw new Error(asked.find((x) => x.error)?.error ?? 'revenus indisponibles');
      }
      const byCountry = {};
      for (const r of [...(ok(amCountry) ? amCountry : []), ...(ok(asCountry) ? asCountry : [])]) {
        byCountry[r.key] = (byCountry[r.key] ?? 0) + r.earnings;
      }
      const daily = {};
      for (const r of ok(am) ? am : []) (daily[r.key] ??= { admob: 0, adsense: 0 }).admob += r.earnings;
      for (const r of ok(as) ? as : []) (daily[r.key] ??= { admob: 0, adsense: 0 }).adsense += r.earnings;
      return {
        admob: ok(am) ? sumOf(am) : null,
        adsense: ok(as) ? sumOf(as) : null,
        prev: (ok(amPrev) ? sumOf(amPrev) : 0) + (ok(asPrev) ? sumOf(asPrev) : 0),
        byDay: Object.entries(daily).sort().map(([x, v]) => ({ x, ...v })),
        byCountry: Object.entries(byCountry).map(([c, earnings]) => ({ c, earnings })).sort((a, b) => b.earnings - a.earnings),
        partial: asked.some((x) => !ok(x)) ? 'une des deux régies est indisponible' : null,
      };
    },

    // Repères : versions de l'app (PostHog), push envoyés et repères manuels (Supabase).
    markers: async () => {
      const out = [];
      const tasks = [
        hogql(`
          select properties.$app_version v, toDateTime(quantile(0.05)(toUnixTimestamp(timestamp))) t
          from events
          where timestamp > now() - interval 200 day and properties.$lib = 'posthog-react-native' and properties.$app_version != ''
          group by v having uniq(person_id) >= 5 order by t`).then((rows) =>
          rows.forEach(([v, t]) => out.push({ day: String(t).slice(0, 10), kind: 'version', label: `v${v}` })),
        ),
        rest()
          .all(`notification_log?select=title,sent,source,created_at&created_at=gte.${W.prevFirst}&order=created_at.desc&limit=60`, 60)
          .then((rows) =>
            rows
              .filter((r) => (r.sent ?? 0) > 0)
              .forEach((r) => out.push({ day: isoDay(new Date(r.created_at)), kind: 'push', label: r.title ?? 'Push' })),
          ),
        rest()
          .all(`hq_markers?select=id,day,kind,label&day=gte.${W.prevFirst}&order=day`, 500)
          .then((rows) => rows.forEach((r) => out.push({ id: r.id, day: r.day, kind: r.kind, label: r.label, manual: true }))),
      ];
      const res = await Promise.allSettled(tasks);
      const failed = res.filter((r) => r.status === 'rejected').map((r) => r.reason?.message ?? String(r.reason));
      return {
        list: out.filter((m) => m.day >= W.prevFirst && m.day <= W.last).sort((a, b) => (a.day < b.day ? 1 : -1)),
        warnings: failed,
      };
    },
  });
}
