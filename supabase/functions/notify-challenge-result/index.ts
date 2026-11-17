// Push « X a joué ton défi » to a friend challenge's creator.
//
// Called by the app right after submit_friend_challenge recorded a result. The
// caller's own fresh result row is the proof (like notify-friend-request): no
// row, no push, so nobody can push-spam a creator.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// FR/EN only for now; every other language gets the English line.
function copy(lang: string, name: string, theirs: number, mine: number) {
  const fr = lang.toLowerCase().startsWith('fr');
  if (theirs > mine) {
    return fr
      ? {
          title: 'Ton défi est tombé ⚔️',
          body: `${name} t'a battu : ${theirs} contre ${mine}. Revanche ?`,
        }
      : {
          title: 'Your challenge fell ⚔️',
          body: `${name} beat you: ${theirs} to ${mine}. Rematch?`,
        };
  }
  if (theirs === mine) {
    return fr
      ? { title: 'Égalité ⚔️', body: `${name} a fait ${theirs}, comme toi.` }
      : { title: 'A tie ⚔️', body: `${name} scored ${theirs}, same as you.` };
  }
  return fr
    ? {
        title: 'Ton défi tient bon 🛡️',
        body: `${name} a fait ${theirs}, tu gardes la tête avec ${mine}.`,
      }
    : {
        title: 'Your challenge holds 🛡️',
        body: `${name} scored ${theirs}; you stay ahead with ${mine}.`,
      };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const asUser = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const {
      data: { user },
    } = await asUser.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { code } = (await req.json()) as { code?: string };
    if (!code) return json({ error: 'code required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: ch } = await admin
      .from('friend_challenges')
      .select('id, creator_id, creator_score')
      .eq('code', code.toUpperCase())
      .maybeSingle();
    if (!ch) return json({ error: 'not found' }, 404);

    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: result } = await admin
      .from('friend_challenge_results')
      .select('score')
      .eq('challenge_id', ch.id)
      .eq('user_id', user.id)
      .gte('created_at', since)
      .maybeSingle();
    if (!result) return json({ error: 'not allowed' }, 403);

    const [{ data: creator }, { data: player }] = await Promise.all([
      admin.from('profiles').select('push_token, push_lang').eq('id', ch.creator_id).single(),
      admin.from('profiles').select('username').eq('id', user.id).single(),
    ]);
    if (!creator?.push_token) return json({ sent: false, reason: 'no_token' });

    const lang = creator.push_lang ?? 'en';
    const name = player?.username || (lang.startsWith('fr') ? 'Un ami' : 'A friend');
    const { title, body } = copy(lang, name, result.score, ch.creator_score);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: creator.push_token,
        title,
        body,
        sound: 'default',
        data: { type: 'friend_challenge', code: code.toUpperCase() },
      }),
    });
    return json({ sent: res.ok });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
