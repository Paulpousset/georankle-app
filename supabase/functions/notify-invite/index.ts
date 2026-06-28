import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODE_LABELS: Record<string, string> = {
  classic: 'Classique',
  streak: 'Streak',
  versus: 'Versus',
  globe: 'Globe Géo',
  guess: 'Devine le Pays',
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

    const { match_id } = await req.json();
    if (!match_id) {
      return new Response(JSON.stringify({ error: 'match_id required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: match } = await admin
      .from('matches')
      .select('player1_id, player2_id, game_mode')
      .eq('id', match_id)
      .single();

    // Only the inviting player (player1) may trigger the invite notification.
    if (!match || match.player1_id !== user.id || !match.player2_id) {
      return new Response(JSON.stringify({ error: 'not allowed' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const [{ data: recipient }, { data: sender }] = await Promise.all([
      admin.from('profiles').select('push_token').eq('id', match.player2_id).single(),
      admin.from('profiles').select('username').eq('id', match.player1_id).single(),
    ]);

    if (!recipient?.push_token) {
      return new Response(JSON.stringify({ sent: false, reason: 'no_token' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const fromName = sender?.username || 'Un joueur';
    const mode = MODE_LABELS[match.game_mode] ?? match.game_mode;

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: recipient.push_token,
        title: 'GeoG — Défi reçu !',
        body: `${fromName} te défie en ${mode}.`,
        sound: 'default',
        data: { match_id, type: 'invite' },
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
