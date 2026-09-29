/** Source « Déploiements » : Vercel (site + /play), EAS (builds natifs), santé du site. */
import { env, need, http, settle } from './lib.mjs';

const VERCEL_PROJECT = 'prj_uJUuqCRqBoRUDU418eV613jwTkR0';
const VERCEL_TEAM = 'team_lOlOMyH4XAayMj9hvYCIKowp';
const EAS_PROJECT = 'eb89ac82-5303-4bd0-94d5-6cfb80467efd';

async function ping(url) {
  const t = Date.now();
  try {
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    return { url, status: r.status, ms: Date.now() - t, ok: r.status < 400 };
  } catch (e) {
    return { url, status: 0, ms: Date.now() - t, ok: false, error: e.message };
  }
}

export async function deploys() {
  return settle({
    health: () =>
      Promise.all(
        ['https://playgeog.com/', 'https://playgeog.com/play', 'https://playgeog.com/app-ads.txt'].map(ping),
      ),
    vercel: async () => {
      need(['VERCEL_API_TOKEN'], 'Jeton Vercel (vercel.com/account/tokens, portée équipe)');
      const q = `projectId=${env('VERCEL_PROJECT_ID', VERCEL_PROJECT)}&teamId=${env('VERCEL_TEAM_ID', VERCEL_TEAM)}`;
      const r = await http(`https://api.vercel.com/v6/deployments?${q}&limit=12`, {
        headers: { authorization: `Bearer ${env('VERCEL_API_TOKEN')}` },
      });
      return r.deployments.map((d) => ({
        state: d.state ?? d.readyState,
        target: d.target ?? 'preview',
        created: new Date(d.created).toISOString(),
        durationS: d.ready && d.buildingAt ? Math.round((d.ready - d.buildingAt) / 1000) : null,
        message: d.meta?.githubCommitMessage?.split('\n')[0] ?? d.name,
        sha: d.meta?.githubCommitSha?.slice(0, 7),
        url: `https://${d.url}`,
      }));
    },
    eas: async () => {
      need(['EXPO_TOKEN'], 'Jeton Expo (expo.dev → Access tokens)');
      const r = await http('https://api.expo.dev/graphql', {
        method: 'POST',
        headers: { authorization: `Bearer ${env('EXPO_TOKEN')}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          query: `query($id:String!){app{byId(appId:$id){
            builds(offset:0,limit:10){id status platform appVersion appBuildVersion buildProfile createdAt completedAt gitCommitMessage}
            updateBranches(offset:0,limit:3){name updates(offset:0,limit:3){group message runtimeVersion platform createdAt}}
          }}}`,
          variables: { id: EAS_PROJECT },
        }),
      });
      if (r.errors?.length) throw new Error(r.errors[0].message);
      const app = r.data.app.byId;
      return {
        builds: app.builds,
        updates: app.updateBranches.flatMap((b) => b.updates.map((u) => ({ ...u, branch: b.name }))),
      };
    },
  });
}
