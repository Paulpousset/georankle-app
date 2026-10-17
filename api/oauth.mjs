/**
 * GET /api/oauth?code&state : retour d'Instagram ou de TikTok après le
 * branchement d'un compte depuis /hq (onglet Vidéos). Pas de session ici :
 * le paramètre state est signé par /api/hq?source=social-connect.
 */
import { connectFinish } from './_hq/social.mjs';

const back = (url, params) => Response.redirect(`${new URL(url).origin}/hq/?${new URLSearchParams(params)}#videos`, 302);

export async function GET(request) {
  try {
    const { platform, name } = await connectFinish(new URL(request.url));
    return back(request.url, { connected: `${platform} ${name}` });
  } catch (e) {
    return back(request.url, { connect_error: e.message.slice(0, 300) });
  }
}
