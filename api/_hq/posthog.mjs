/** Source « Audience » : PostHog (HogQL), app native + web dans le même projet. */
import { need, settle, PLATFORM, hogql, hogFilter, windowOf } from './lib.mjs';

export async function posthog({ days, from, to, countries, exclude, platform }) {
  need(['POSTHOG_PERSONAL_API_KEY'], 'Clé perso PostHog (déjà dans .env.secrets)');
  const W = windowOf({ days, from, to });
  const F = hogFilter({ countries, exclude, platform });
  const win = `${W.cur}${F}`;
  const span = Math.max(W.n, 1);
  const top = (rows) => rows.map(([label, value]) => ({ label: label ?? '(aucun)', value }));

  return settle({
    active: async () => {
      const [[dau, wau, mau, cur, prev]] = await hogql(`
        select
          uniqIf(person_id, timestamp > now() - interval 1 day),
          uniqIf(person_id, timestamp > now() - interval 7 day),
          uniqIf(person_id, timestamp > now() - interval 30 day),
          uniqIf(person_id, ${W.cur}),
          uniqIf(person_id, ${W.prev})
        from events where (${W.prev} or ${W.cur} or timestamp > now() - interval 30 day)${F}`);
      return { dau, wau, mau, period: cur, periodPrev: prev };
    },
    dauByPlatform: async () => {
      const rows = await hogql(`
        select ${W.bucket} d, ${PLATFORM} p, uniq(person_id)
        from events where ${win} group by d, p order by d`);
      const series = {};
      for (const [d, p, n] of rows) (series[p] ??= {})[d] = n;
      const daysList = W.buckets;
      return ['iOS', 'Android', 'Web'].map((name) => ({
        name,
        points: daysList.map((x) => ({ x, y: series[name]?.[x] ?? 0 })),
      }));
    },
    platforms: async () =>
      top(await hogql(`select ${PLATFORM} p, uniq(person_id) n from events where ${win} group by p order by n desc`)),
    retention: async () => {
      // Cohortes par jour de création de la personne : même définition que
      // l'onglet Croissance (avant : 1re apparition dans une fenêtre de 60 j,
      // qui comptait d'anciens joueurs comme nouveaux). J1 compté quand le
      // lendemain est fini (d0 ≤ J-2), J7 quand d0 ≤ J-8.
      const back = Math.min(Math.max(span, 14), 58);
      const rows = await hogql(`
        select d0, count() cohort,
               countIf(has(ds, d0 + 1)) d1,
               countIf(has(ds, d0 + 7)) d7
        from (select person_id, toDate(any(person.created_at)) d0, groupUniqArray(toDate(timestamp)) ds
              from events
              where timestamp >= today() - ${back} and person.created_at >= today() - ${back}${F}
              group by person_id)
        where d0 >= today() - ${back} and d0 <= today() - 1
        group by d0 order by d0`);
      const done = (r, k) => new Date(r[0]) <= new Date(Date.now() - (k + 1) * 86400000);
      const sum = (i, k) => rows.filter((r) => done(r, k)).reduce((s, r) => s + r[i], 0);
      const d1Base = sum(1, 1);
      const d7Base = sum(1, 7);
      return {
        d1: d1Base ? sum(2, 1) / d1Base : null,
        d7: d7Base ? sum(3, 7) / d7Base : null,
        days: back,
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
      top(await hogql(`select properties.$app_version v, uniq(person_id) n from events where timestamp > now() - interval 7 day and properties.$lib = 'posthog-react-native'${F} group by v order by n desc limit 8`)),
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
