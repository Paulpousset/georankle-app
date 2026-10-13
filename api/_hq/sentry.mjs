/** Source « Erreurs » : Sentry (org tita-30). */
import { env, need, http, settle, periodOf } from './lib.mjs';

export async function sentry({ days, from, to }) {
  need(['SENTRY_AUTH_TOKEN'], 'Jeton Sentry (org:read, project:read, event:read)');
  const org = env('SENTRY_ORG', 'tita-30');
  // Mêmes jours civils que les autres sources (dates perso comprises).
  const P = periodOf({ days, from, to });
  const end = new Date(Math.min(Date.parse(P.end), Date.now())).toISOString();
  const period = P.hourly ? 'statsPeriod=24h' : `start=${encodeURIComponent(P.start)}&end=${encodeURIComponent(end)}`;
  const interval = P.hourly ? '1h' : '1d';
  const cut = P.hourly ? 13 : 10;
  const api = (p) =>
    http(`https://sentry.io/api/0/organizations/${org}/${p}`, {
      headers: { authorization: `Bearer ${env('SENTRY_AUTH_TOKEN')}` },
    });
  const issue = (i) => ({
    id: i.shortId,
    title: i.title,
    culprit: i.culprit,
    level: i.level,
    count: Number(i.count),
    users: i.userCount,
    firstSeen: i.firstSeen,
    lastSeen: i.lastSeen,
    project: i.project?.slug,
    url: i.permalink,
  });

  return settle({
    top: async () =>
      (await api(`issues/?query=is:unresolved&${period}&sort=freq&limit=12`)).map(issue),
    fresh: async () =>
      (await api(`issues/?query=is:unresolved firstSeen:-7d&statsPeriod=14d&sort=new&limit=10`)).map(issue),
    unresolved: async () => {
      const r = await http(
        `https://sentry.io/api/0/organizations/${org}/issues-count/?query=is:unresolved&query=is:unresolved firstSeen:-24h`,
        { headers: { authorization: `Bearer ${env('SENTRY_AUTH_TOKEN')}` } },
      );
      return { total: r['is:unresolved'], last24h: r['is:unresolved firstSeen:-24h'] };
    },
    crashFree: async () => {
      const r = await api(
        `sessions/?field=crash_free_rate(session)&field=crash_free_rate(user)&field=sum(session)&${period}&interval=${interval}&project=-1`,
      );
      const g = r.groups?.[0];
      return {
        sessions: g?.totals?.['sum(session)'] ?? 0,
        session: g?.totals?.['crash_free_rate(session)'] ?? null,
        user: g?.totals?.['crash_free_rate(user)'] ?? null,
        byDay: (r.intervals ?? []).map((x, i) => ({
          x: x.slice(0, cut),
          y: g?.series?.['crash_free_rate(session)']?.[i] ?? null,
        })),
      };
    },
    errorsByDay: async () => {
      const r = await api(
        `stats_v2/?field=sum(quantity)&category=error&interval=${interval}&${period}&groupBy=outcome`,
      );
      const accepted = r.groups?.find((g) => g.by?.outcome === 'accepted');
      return (r.intervals ?? []).map((x, i) => ({ x: x.slice(0, cut), y: accepted?.series?.['sum(quantity)']?.[i] ?? 0 }));
    },
  });
}
