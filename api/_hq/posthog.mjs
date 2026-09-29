/** Source « Audience » : PostHog (HogQL), app native + web dans le même projet. */
import { env, need, http, settle, dayRange } from './lib.mjs';

// App native = lib posthog-react-native ; tout le reste = web (site + /play).
const PLATFORM = `multiIf(properties.$lib = 'posthog-react-native', if(properties.$os = 'Android', 'Android', 'iOS'), 'Web')`;

export async function posthog({ days }) {
  need(['POSTHOG_PERSONAL_API_KEY'], 'Clé perso PostHog (déjà dans .env.secrets)');
  const host = env('POSTHOG_HOST_API', 'https://eu.posthog.com');
  const hogql = async (query) => {
    const r = await http(`${host}/api/projects/@current/query/`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env('POSTHOG_PERSONAL_API_KEY')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
      timeout: 30000,
    });
    return r.results;
  };
  const win = `timestamp > now() - interval ${days} day`;
  const prevWin = `timestamp > now() - interval ${days * 2} day and timestamp <= now() - interval ${days} day`;
  const top = (rows) => rows.map(([label, value]) => ({ label: label ?? '(aucun)', value }));

  return settle({
    active: async () => {
      const [[dau, wau, mau, cur, prev]] = await hogql(`
        select
          uniqIf(person_id, timestamp > now() - interval 1 day),
          uniqIf(person_id, timestamp > now() - interval 7 day),
          uniqIf(person_id, timestamp > now() - interval 30 day),
          uniqIf(person_id, ${win}),
          uniqIf(person_id, ${prevWin})
        from events where timestamp > now() - interval ${Math.max(60, days * 2)} day`);
      return { dau, wau, mau, period: cur, periodPrev: prev };
    },
    dauByPlatform: async () => {
      const rows = await hogql(`
        select toDate(timestamp) d, ${PLATFORM} p, uniq(person_id)
        from events where ${win} group by d, p order by d`);
      const series = {};
      for (const [d, p, n] of rows) (series[p] ??= {})[d] = n;
      const daysList = dayRange(days);
      return ['iOS', 'Android', 'Web'].map((name) => ({
        name,
        points: daysList.map((x) => ({ x, y: series[name]?.[x] ?? 0 })),
      }));
    },
    platforms: async () =>
      top(await hogql(`select ${PLATFORM} p, uniq(person_id) n from events where ${win} group by p order by n desc`)),
    retention: async () => {
      // Cohortes par jour de première apparition (fenêtre 60 j : approximation).
      const rows = await hogql(`
        select f.d0, count() cohort,
               countIf(has(a.ds, f.d0 + 1)) d1,
               countIf(has(a.ds, f.d0 + 7)) d7
        from (select person_id, min(toDate(timestamp)) d0 from events
              where timestamp > now() - interval 60 day group by person_id) f
        left join (select person_id, groupUniqArray(toDate(timestamp)) ds from events
                   where timestamp > now() - interval 60 day group by person_id) a
          on a.person_id = f.person_id
        where f.d0 >= today() - ${Math.max(days, 14)} and f.d0 <= today() - 1
        group by f.d0 order by f.d0`);
      const sum = (i, pred) => rows.filter(pred).reduce((s, r) => s + r[i], 0);
      const d1Base = sum(1, (r) => new Date(r[0]) <= new Date(Date.now() - 2 * 86400000));
      const d7Base = sum(1, (r) => new Date(r[0]) <= new Date(Date.now() - 8 * 86400000));
      return {
        d1: d1Base ? sum(2, (r) => new Date(r[0]) <= new Date(Date.now() - 2 * 86400000)) / d1Base : null,
        d7: d7Base ? sum(3, (r) => new Date(r[0]) <= new Date(Date.now() - 8 * 86400000)) / d7Base : null,
        cohorts: rows.map(([x, n, d1, d7]) => ({ x, n, d1, d7 })),
      };
    },
    funnel: async () => {
      const steps = [
        ['Application Installed', 'Install app'],
        ['$pageview', 'Visite web'],
        ['game_started', 'Partie lancée'],
        ['game_completed', 'Partie finie'],
        ['daily_completed', 'Défi du jour fini'],
        ['signed_up', 'Inscription'],
        ['install_cta_pressed', 'Clic « installer l’app »'],
        ['match_started', 'Match en ligne'],
        ['rewarded_ad_requested', 'Pub récompensée'],
      ];
      const list = steps.map(([e]) => `'${e}'`).join(',');
      const rows = await hogql(`select event, uniq(person_id), count() from events where ${win} and event in (${list}) group by event`);
      const m = Object.fromEntries(rows.map(([e, u, c]) => [e, { users: u, count: c }]));
      return steps.map(([e, label]) => ({ event: e, label, users: m[e]?.users ?? 0, count: m[e]?.count ?? 0 }));
    },
    topEvents: async () =>
      top(await hogql(`select event, count() n from events where ${win} and event not like '$%' group by event order by n desc limit 25`)),
    webPages: async () =>
      top(await hogql(`select properties.$pathname p, count() n from events where ${win} and event = '$pageview' group by p order by n desc limit 20`)),
    referrers: async () =>
      top(await hogql(`select properties.$referring_domain r, uniq(person_id) n from events where ${win} and event = '$pageview' group by r order by n desc limit 15`)),
    utm: async () =>
      top(await hogql(`select concat(coalesce(properties.utm_source, '?'), ' / ', coalesce(properties.utm_campaign, '?')) s, uniq(person_id) n from events where ${win} and properties.utm_source is not null group by s order by n desc limit 10`)),
    countries: async () =>
      top(await hogql(`select properties.$geoip_country_code c, uniq(person_id) n from events where ${win} group by c order by n desc limit 15`)),
    appVersions: async () =>
      top(await hogql(`select properties.$app_version v, uniq(person_id) n from events where timestamp > now() - interval 7 day and properties.$lib = 'posthog-react-native' group by v order by n desc limit 8`)),
    webVitals: async () => {
      const [[lcp, inp, cls, n]] = await hogql(`
        select quantile(0.75)(toFloat(properties.$web_vitals_LCP_value)),
               quantile(0.75)(toFloat(properties.$web_vitals_INP_value)),
               quantile(0.75)(toFloat(properties.$web_vitals_CLS_value)),
               count()
        from events where ${win} and event = '$web_vitals'`);
      return { lcp, inp, cls, samples: n };
    },
    modes: async () =>
      top(await hogql(`select properties.mode m, count() n from events where ${win} and event = 'game_completed' group by m order by n desc limit 15`)),
    languages: async () =>
      top(await hogql(`select coalesce(properties.$locale, properties.$browser_language) l, uniq(person_id) n from events where ${win} group by l order by n desc limit 10`)),
  });
}
