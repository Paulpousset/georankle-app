/**
 * RevenueCat → coin-pack credit webhook. SCAFFOLDING — the 'iap' feature flag
 * is OFF and RevenueCat is not configured yet; deploying this is harmless
 * (nothing calls it until RevenueCat is pointed at it).
 *
 * Setup when going live:
 * 1. Insert the shared secret:
 *    INSERT INTO public.app_secrets (key, value) VALUES ('revenuecat_webhook_secret', '<random>');
 * 2. In RevenueCat → Integrations → Webhooks, set the URL to this function and
 *    the Authorization header to `Bearer <that secret>`.
 * 3. Deploy with verify_jwt = false (RevenueCat cannot send a Supabase JWT) —
 *    auth is the shared secret, mirroring the run-campaigns cron pattern.
 *
 * Credits are granted by the SERVICE-ROLE-ONLY grant_iap_coins RPC, idempotent
 * per store transaction id — replayed webhooks and duplicates are no-ops.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** RevenueCat event types that represent a completed one-time purchase. */
const PURCHASE_EVENTS = new Set(['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE']);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Shared-secret auth (same pattern as the campaigns cron).
    const auth = req.headers.get('Authorization') ?? '';
    const { data: secretRow } = await admin
      .from('app_secrets')
      .select('value')
      .eq('key', 'revenuecat_webhook_secret')
      .maybeSingle();
    if (!secretRow?.value || auth !== `Bearer ${secretRow.value}`) {
      return json({ error: 'forbidden' }, 403);
    }

    const payload = await req.json();
    const event = payload?.event;
    if (!event || !PURCHASE_EVENTS.has(event.type)) {
      return json({ ok: true, skipped: event?.type ?? 'no_event' });
    }

    // app_user_id is set to the Supabase user id when configuring the SDK.
    const userId = event.app_user_id as string | undefined;
    const productId = event.product_id as string | undefined;
    const transactionId = (event.transaction_id ?? event.id) as string | undefined;
    if (!userId || !productId || !transactionId) {
      return json({ error: 'missing fields' }, 400);
    }

    const { data, error } = await admin.rpc('grant_iap_coins', {
      p_user: userId,
      p_product: productId,
      p_transaction_id: transactionId,
    });
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true, result: data });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
