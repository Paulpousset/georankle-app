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
    // Joueurs restés sur une ancienne version, par jour et par plateforme.
    // `$app_version` seul ne suffit pas : il vaut 5.7.0 pour tous les binaires
    // et toutes les mises à jour OTA. On compare donc (version, build natif,
    // date du bundle OTA `ota_date`). La référence d'un jour est la plus
    // récente vue jusqu'à ce jour inclus ; un joueur compte sous le dernier
    // bundle qu'il a utilisé ce jour-là. Pas de `ota_date` = bundle d'avant le
    // suivi (ou binaire sans OTA) : toujours plus ancien qu'un bundle qui l'a.
    outdated: async () => {
      const rows = await hogql(`
        select d, p, v, b, o, count()
        from (select ${W.bucket} d, ${PLATFORM} p, person_id,
                     argMax(properties.$app_version, timestamp) v,
                     argMax(toString(properties.$app_build), timestamp) b,
                     argMax(toString(properties.ota_date), timestamp) o
              from events where ${win} and properties.$lib = 'posthog-react-native' and properties.$app_version != ''
              group by d, p, person_id)
        group by d, p, v, b, o`);
      return outdatedFrom(rows, W.buckets);
    },
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

const clean = (x) => (x == null || x === 'null' ? '' : String(x));
const num = (v) => clean(v).split('.').map((n) => Number(n) || 0);

/** Ordre (version, build, date OTA) ; négatif si a est plus ancien que b. */
export function cmpBuild(a, b) {
  const x = num(a.v), y = num(b.v);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  const bx = Number(clean(a.b)) || 0, by = Number(clean(b.b)) || 0;
  if (bx !== by) return bx - by;
  const ox = clean(a.o), oy = clean(b.o);
  return ox < oy ? -1 : ox > oy ? 1 : 0;
}

export function buildLabel({ v, b, o }) {
  const ota = clean(o);
  return `${clean(v)}${clean(b) ? ` (${clean(b)})` : ''}${ota ? ` · OTA ${ota.slice(8, 10)}/${ota.slice(5, 7)}` : ' · OTA ?'}`;
}

/** rows : [jour, plateforme, version, build, date OTA, joueurs]. */
export function outdatedFrom(rows, buckets) {
  const sorted = [...rows].sort((r, s) => (r[0] < s[0] ? -1 : r[0] > s[0] ? 1 : 0));
  const latestByDay = {};
  const running = {};
  for (const [d, p, v, b, o] of sorted) {
    const cur = { v, b, o };
    if (!running[p] || cmpBuild(cur, running[p]) > 0) running[p] = cur;
    latestByDay[d] = { ...(latestByDay[d] ?? {}), ...running };
  }
  // Reporte la référence sur les jours suivants (une plateforme absente un
  // jour garde sa dernière référence connue).
  const ref = {};
  for (const d of new Set(sorted.map((r) => r[0]))) {
    Object.assign(ref, latestByDay[d]);
    latestByDay[d] = { ...ref };
  }
  const empty = (x) => ({ x, iOS: 0, Android: 0, total: 0, versions: {} });
  const byDay = {};
  for (const [d, p, v, b, o, n] of sorted) {
    const r = (byDay[d] ??= empty(d));
    r.total += n;
    if (cmpBuild({ v, b, o }, latestByDay[d][p]) < 0) {
      r[p] = (r[p] ?? 0) + n;
      const k = `${p} ${buildLabel({ v, b, o })}`;
      r.versions[k] = (r.versions[k] ?? 0) + n;
    }
  }
  const latest = Object.fromEntries(Object.entries(ref).map(([p, x]) => [p, buildLabel(x)]));
  return { latest, days: buckets.map((x) => byDay[x] ?? empty(x)) };
}
