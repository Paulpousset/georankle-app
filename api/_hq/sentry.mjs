/** Source « Erreurs » : Sentry (org tita-30). */
import { env, need, http, settle } from './lib.mjs';

export async function sentry({ days }) {
  need(['SENTRY_AUTH_TOKEN'], 'Jeton Sentry (org:read, project:read, event:read)');
  const org = env('SENTRY_ORG', 'tita-30');
  const period = `${Math.min(days, 90)}d`;
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
      (await api(`issues/?query=is:unresolved&statsPeriod=${period}&sort=freq&limit=12`)).map(issue),
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
        `sessions/?field=crash_free_rate(session)&field=crash_free_rate(user)&field=sum(session)&statsPeriod=${period}&interval=1d&project=-1`,
      );
      const g = r.groups?.[0];
      return {
        sessions: g?.totals?.['sum(session)'] ?? 0,
        session: g?.totals?.['crash_free_rate(session)'] ?? null,
        user: g?.totals?.['crash_free_rate(user)'] ?? null,
        byDay: (r.intervals ?? []).map((x, i) => ({
          x: x.slice(0, 10),
          y: g?.series?.['crash_free_rate(session)']?.[i] ?? null,
        })),
      };
    },
    errorsByDay: async () => {
      const r = await api(
        `stats_v2/?field=sum(quantity)&category=error&interval=1d&statsPeriod=${period}&groupBy=outcome`,
      );
      const accepted = r.groups?.find((g) => g.by?.outcome === 'accepted');
      return (r.intervals ?? []).map((x, i) => ({ x: x.slice(0, 10), y: accepted?.series?.['sum(quantity)']?.[i] ?? 0 }));
    },
  });
}
