import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { pushLang, pushText } from '../_shared/push_i18n.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * La clé anglaise du libellé de chaque mode ; `pushText` la traduit dans la
 * langue du destinataire (voir _shared/push_i18n.ts).
 */
const MODE_KEYS: Record<string, string> = {
  classic: 'Rankle',
  streak: 'Streak',
  versus: 'Versus',
  globe: 'Geo Globe',
  guess: 'Guess the Country',
  regions: 'Country Challenges',
  challenge: 'Country Quiz',
  higherlower: 'Higher or Lower',
  silhouette: 'Silhouette',
  borders: 'Borders',
  languages: 'Languages',
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
      admin.from('profiles').select('push_token, push_lang').eq('id', match.player2_id).single(),
      admin.from('profiles').select('username').eq('id', match.player1_id).single(),
    ]);

    if (!recipient?.push_token) {
      return new Response(JSON.stringify({ sent: false, reason: 'no_token' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const lang = pushLang(recipient.push_lang);
    const fromName = sender?.username || pushText(lang, 'A player');
    const modeKey = MODE_KEYS[match.game_mode] ?? match.game_mode;
    const mode = pushText(lang, modeKey);

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: recipient.push_token,
        title: `GeoG — ${pushText(lang, 'New Challenge!')}`,
        body: pushText(lang, '{0} challenges you in {2}!', [fromName, '', mode]),
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
