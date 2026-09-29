/** Source « Jeu » : la base Supabase (joueurs, parties, économie, crons). */
import { SUPABASE_URL, env, need, http, settle, isoDay, daysAgo, buckets, bucketOf, hourly } from './lib.mjs';

function rest() {
  need(['SUPABASE_SERVICE_ROLE_KEY']);
  const url = SUPABASE_URL();
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const headers = { apikey: key, authorization: `Bearer ${key}` };

  /** Toutes les lignes (PostgREST plafonne à 1000 par page). */
  async function all(path, cap = 50000) {
    const rows = [];
    for (let from = 0; from < cap; from += 1000) {
      const page = await http(`${url}/rest/v1/${path}`, {
        headers: { ...headers, range: `${from}-${from + 999}`, 'range-unit': 'items' },
      });
      rows.push(...page);
      if (page.length < 1000) break;
    }
    return rows;
  }

  async function count(path) {
    const { res } = await http(`${url}/rest/v1/${path}`, {
      method: 'HEAD',
      headers: { ...headers, prefer: 'count=exact', range: '0-0' },
      raw: true,
    });
    return Number(res.headers.get('content-range')?.split('/')[1] ?? 0);
  }

  async function authUsers() {
    const users = [];
    for (let page = 1; page < 50; page++) {
      const r = await http(`${url}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers });
      users.push(...(r.users ?? []));
      if ((r.users ?? []).length < 1000) break;
    }
    return users;
  }

  return { all, count, authUsers };
}

const byDay = (rows, field, days, pred = () => true) => {
  const m = Object.fromEntries(buckets(days).map((d) => [d, 0]));
  for (const r of rows) {
    const d = bucketOf(r[field], days);
    if (d in m && pred(r)) m[d]++;
  }
  return Object.entries(m).map(([x, y]) => ({ x, y }));
};

const tally = (rows, key) => {
  const m = {};
  for (const r of rows) {
    const k = typeof key === 'function' ? key(r) : r[key];
    m[k ?? '—'] = (m[k ?? '—'] ?? 0) + 1;
  }
  return Object.entries(m)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
};

export async function supabase({ days }) {
  const db = rest();
  const since = daysAgo(days).toISOString();
  const since2 = daysAgo(days * 2).toISOString();

  return settle({
    users: async () => {
      const users = await db.authUsers();
      const real = users.filter((u) => !u.is_anonymous);
      const inWin = (u, a, b) => u.created_at >= a && u.created_at < b;
      return {
        total: real.length,
        anonymous: users.length - real.length,
        signups: real.filter((u) => u.created_at >= since).length,
        signupsPrev: real.filter((u) => inWin(u, since2, since)).length,
        signupsByDay: byDay(real, 'created_at', days),
        providers: tally(real, (u) => u.app_metadata?.provider ?? 'email'),
        activeSignIn7d: real.filter((u) => (u.last_sign_in_at ?? '') >= daysAgo(7).toISOString()).length,
      };
    },
    active: async () => {
      const at = (n) => db.count(`profiles?select=id&last_seen=gte.${daysAgo(n).toISOString()}`);
      const [d1, d7, d30, push, streak3] = await Promise.all([
        at(1),
        at(7),
        at(30),
        db.count('profiles?select=id&push_token=not.is.null'),
        db.count(`profiles?select=id&daily_streak=gte.3&daily_last_date=gte.${isoDay(daysAgo(1))}`),
      ]);
      return { d1, d7, d30, pushTokens: push, activeStreaks3: streak3 };
    },
    solo: async () => {
      const rows = await db.all(`scores?select=game_mode,created_at,user_id&created_at=gte.${since}`);
      return {
        games: rows.length,
        players: new Set(rows.map((r) => r.user_id)).size,
        byDay: byDay(rows, 'created_at', days),
        byMode: tally(rows, 'game_mode'),
      };
    },
    daily: async () => {
      const rows = await db.all(
        hourly(days)
          ? `daily_results?select=game_mode,created_at,user_id&created_at=gte.${daysAgo(1).toISOString()}`
          : `daily_results?select=game_mode,puzzle_date,user_id&puzzle_date=gte.${isoDay(daysAgo(days))}`,
      );
      // Joueurs distincts par seau (jour du puzzle, ou heure de jeu en mode 24 h).
      const players = {};
      for (const r of rows) (players[hourly(days) ? bucketOf(r.created_at, days) : r.puzzle_date] ??= new Set()).add(r.user_id);
      return {
        plays: rows.length,
        playersByDay: buckets(days).map((x) => ({ x, y: players[x]?.size ?? 0 })),
        byMode: tally(rows, 'game_mode'),
      };
    },
    online: async () => {
      const rows = await db.all(
        `matches?select=game_mode,status,is_ranked,max_players,created_at&created_at=gte.${since}`,
      );
      return {
        matches: rows.length,
        byDay: byDay(rows, 'created_at', days),
        byMode: tally(rows, 'game_mode'),
        byStatus: tally(rows, 'status'),
        ranked: rows.filter((r) => r.is_ranked).length,
        ffa: rows.filter((r) => (r.max_players ?? 2) > 2).length,
      };
    },
    story: async () => {
      const rows = await db.all('profiles?select=story_max_level&story_max_level=gt.0');
      const buckets = [
        [1, 10],
        [11, 25],
        [26, 50],
        [51, 100],
        [101, 200],
        [201, 300],
      ];
      const recent = await db.count(`story_progress?select=level&completed_at=gte.${since}`);
      return {
        players: rows.length,
        levelsCompleted: recent,
        maxLevel: Math.max(0, ...rows.map((r) => r.story_max_level)),
        distribution: buckets.map(([a, b]) => ({
          label: `${a}–${b}`,
          value: rows.filter((r) => r.story_max_level >= a && r.story_max_level <= b).length,
        })),
      };
    },
    economy: async () => {
      const [wallets, ads, iap, cosmetics] = await Promise.all([
        db.all('coin_wallets?select=balance'),
        db.all(`ad_claims?select=count,day&day=gte.${isoDay(daysAgo(days))}`),
        db.all(`iap_grants?select=product_id,coins,created_at&created_at=gte.${since}`),
        db.count(`user_cosmetics?select=item_id&acquired_at=gte.${since}`),
      ]);
      return {
        coinsInCirculation: wallets.reduce((s, w) => s + (w.balance ?? 0), 0),
        rewardedAds: ads.reduce((s, a) => s + (a.count ?? 0), 0),
        iapPurchases: iap.length,
        iapByProduct: tally(iap, 'product_id'),
        cosmeticsBought: cosmetics,
      };
    },
    social: async () => {
      const [friends, pending] = await Promise.all([
        db.count('friends?select=id&status=eq.accepted'),
        db.count('friends?select=id&status=eq.pending'),
      ]);
      return { friendships: friends, pending };
    },
    ops: async () => {
      const [cron, flags, pushes] = await Promise.all([
        db.all('cron_run_log?select=job,status,detail,created_at&order=created_at.desc&limit=200', 200),
        db.all('feature_flags?select=key,enabled&order=key'),
        db.all('notification_log?select=title,recipients,sent,source,created_at&order=created_at.desc&limit=8', 8),
      ]);
      const jobs = {};
      for (const c of cron) jobs[c.job] ??= c; // dernière exécution par job
      return {
        cronLatest: Object.values(jobs),
        cronFailures: cron.filter((c) => c.status !== 'ok' && c.status !== 'success').slice(0, 10),
        flags,
        recentPushes: pushes,
      };
    },
  });
}
