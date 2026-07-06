import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';

    // Identify the caller from their JWT.
    const asUser = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await asUser.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const { target_user_id } = await req.json();
    if (!target_user_id) {
      return new Response(JSON.stringify({ error: 'target_user_id required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Only notify for a real pending request from the caller to the target —
    // the row is the proof; without it anyone could push-spam arbitrary users.
    const { data: request } = await admin
      .from('friends')
      .select('id')
      .eq('user_id1', user.id)
      .eq('user_id2', target_user_id)
      .eq('status', 'pending')
      .maybeSingle();
    if (!request) {
      return new Response(JSON.stringify({ error: 'not allowed' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const [{ data: recipient }, { data: sender }] = await Promise.all([
      admin.from('profiles').select('push_token, push_lang').eq('id', target_user_id).single(),
      admin.from('profiles').select('username').eq('id', user.id).single(),
    ]);

    if (!recipient?.push_token) {
      return new Response(JSON.stringify({ sent: false, reason: 'no_token' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const en = recipient.push_lang === 'en';
    const fromName = sender?.username || (en ? 'A player' : 'Un joueur');

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: recipient.push_token,
        title: en ? 'GeoG — Friend request!' : "GeoG — Demande d'ami !",
        body: en
          ? `${fromName} wants to add you as a friend.`
          : `${fromName} veut t'ajouter en ami.`,
        sound: 'default',
        data: { type: 'friend_request', from: user.id },
      }),
    });

    return new Response(JSON.stringify({ sent: true, expo: await res.json() }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
