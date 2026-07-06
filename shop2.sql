-- ════════════════════════════════════════════════════════════════════════════
-- Boutique 2.0 — 31 new cosmetics, discounted bundles and a daily featured item.
--
-- Idempotent: prices upsert, table/functions use IF NOT EXISTS / OR REPLACE.
-- Client mirror: src/data/cosmetics.ts (catalog + BUNDLES + FEATURED_DISCOUNT)
-- — keep both sides in sync.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

-- 1. New catalog rows (prices derive from rarity tiers, as in cosmetics.ts).
INSERT INTO public.cosmetic_prices (item_id, category, price, is_default, rarity) VALUES
  -- cosmos
  ('cosmos_constellation','cosmos',400,false,'rare'),
  ('cosmos_goldrain','cosmos',400,false,'rare'),
  ('cosmos_galaxy','cosmos',800,false,'epic'),
  ('cosmos_solareclipse','cosmos',800,false,'epic'),
  ('cosmos_supernova','cosmos',1500,false,'legendary'),
  ('cosmos_blackhole','cosmos',1500,false,'legendary'),
  -- globes
  ('globe_pastel','globe',150,false,'uncommon'),
  ('globe_mars','globe',400,false,'rare'),
  ('globe_ice','globe',400,false,'rare'),
  ('globe_blueprint','globe',400,false,'rare'),
  ('globe_lava','globe',800,false,'epic'),
  ('globe_cyber','globe',800,false,'epic'),
  ('globe_eclipse','globe',1500,false,'legendary'),
  ('globe_biolum','globe',1500,false,'legendary'),
  -- orbits
  ('orbit_ice','orbit',150,false,'uncommon'),
  ('orbit_double','orbit',400,false,'rare'),
  ('orbit_fireflies','orbit',400,false,'rare'),
  ('orbit_saturn','orbit',800,false,'epic'),
  ('orbit_rainbow','orbit',800,false,'epic'),
  ('orbit_fire','orbit',1500,false,'legendary'),
  -- emblems
  ('emblem_windmill','emblem',150,false,'uncommon'),
  ('emblem_pisa','emblem',400,false,'rare'),
  ('emblem_moai','emblem',400,false,'rare'),
  ('emblem_goldengate','emblem',800,false,'epic'),
  ('emblem_sydney','emblem',800,false,'epic'),
  ('emblem_greatwall','emblem',1500,false,'legendary'),
  -- satellites
  ('sat_paperplane','satellite',150,false,'uncommon'),
  ('sat_bird','satellite',150,false,'uncommon'),
  ('sat_rocket','satellite',400,false,'rare'),
  ('sat_ufo','satellite',800,false,'epic'),
  ('sat_shootingstar','satellite',1500,false,'legendary')
ON CONFLICT (item_id) DO UPDATE
  SET category = EXCLUDED.category,
      price = EXCLUDED.price,
      is_default = EXCLUDED.is_default,
      rarity = EXCLUDED.rarity;

-- 2. Bundles — economic source of truth for purchase_bundle().
CREATE TABLE IF NOT EXISTS public.cosmetic_bundles (
  bundle_id text PRIMARY KEY,
  item_ids  text[] NOT NULL,
  price     int NOT NULL CHECK (price >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cosmetic_bundles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cosmetic_bundles_read ON public.cosmetic_bundles;
CREATE POLICY cosmetic_bundles_read ON public.cosmetic_bundles
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.cosmetic_bundles (bundle_id, item_ids, price) VALUES
  ('bundle_solar',   ARRAY['globe_mars','orbit_saturn','cosmos_galaxy'], 1400),
  ('bundle_fireice', ARRAY['globe_lava','orbit_fire','globe_ice','orbit_ice'], 2000),
  ('bundle_wonders', ARRAY['emblem_moai','emblem_goldengate','emblem_sydney'], 1400)
ON CONFLICT (bundle_id) DO UPDATE
  SET item_ids = EXCLUDED.item_ids, price = EXCLUDED.price;

-- 3. Daily featured item: deterministic pick over the non-default catalog,
--    30% off rounded down to a multiple of 10. Shared by the RPC the client
--    reads AND by purchase_cosmetic (server-authoritative discount).
CREATE OR REPLACE FUNCTION public.featured_cosmetic_today()
RETURNS TABLE (item_id text, price int, base_price int)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT cp.item_id,
         (floor(cp.price * 0.7 / 10) * 10)::int AS price,
         cp.price AS base_price
  FROM public.cosmetic_prices cp
  WHERE NOT cp.is_default
  ORDER BY cp.item_id
  OFFSET abs(hashtext(current_date::text))
         % (SELECT count(*) FROM public.cosmetic_prices WHERE NOT is_default)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_featured_cosmetic()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('item_id', f.item_id, 'price', f.price, 'base_price', f.base_price)
  FROM public.featured_cosmetic_today() f;
$$;

REVOKE ALL ON FUNCTION public.featured_cosmetic_today() FROM public, anon;
REVOKE ALL ON FUNCTION public.get_featured_cosmetic() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_featured_cosmetic() TO authenticated;

-- 4. purchase_cosmetic — unchanged flow, but the daily featured item is charged
--    at its discounted price (server-authoritative; the banner price the client
--    shows comes from get_featured_cosmetic, so both always agree).
CREATE OR REPLACE FUNCTION public.purchase_cosmetic(p_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid     uuid := auth.uid();
  v_price int;
  f       record;
  bal     int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT price INTO v_price FROM public.cosmetic_prices WHERE item_id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown item'; END IF;

  SELECT * INTO f FROM public.featured_cosmetic_today();
  IF f.item_id = p_item_id THEN v_price := f.price; END IF;

  IF EXISTS (SELECT 1 FROM public.user_cosmetics WHERE user_id = uid AND item_id = p_item_id) THEN
    SELECT balance INTO bal FROM public.coin_wallets WHERE user_id = uid;
    RETURN jsonb_build_object('already_owned', true, 'new_balance', COALESCE(bal, 0));
  END IF;

  INSERT INTO public.coin_wallets (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO bal FROM public.coin_wallets WHERE user_id = uid FOR UPDATE;

  IF bal < v_price THEN RAISE EXCEPTION 'insufficient funds'; END IF;

  UPDATE public.coin_wallets SET balance = balance - v_price, updated_at = now() WHERE user_id = uid;
  INSERT INTO public.user_cosmetics (user_id, item_id) VALUES (uid, p_item_id)
    ON CONFLICT (user_id, item_id) DO NOTHING;

  RETURN jsonb_build_object('already_owned', false, 'new_balance', bal - v_price);
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_cosmetic(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.purchase_cosmetic(text) TO authenticated;

-- 5. purchase_bundle — atomic: debits the bundle price once and grants every
--    item of the pack the user doesn't own yet. Buying a pack you fully own is
--    rejected; partial ownership still pays the full (discounted) pack price,
--    which the client surfaces before confirming.
CREATE OR REPLACE FUNCTION public.purchase_bundle(p_bundle_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid       uuid := auth.uid();
  b         record;
  bal       int;
  granted   text[];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO b FROM public.cosmetic_bundles WHERE bundle_id = p_bundle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown bundle'; END IF;

  SELECT COALESCE(array_agg(i), '{}') INTO granted
  FROM unnest(b.item_ids) AS i
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_cosmetics uc WHERE uc.user_id = uid AND uc.item_id = i
  );
  IF granted = '{}' THEN RAISE EXCEPTION 'bundle already owned'; END IF;

  INSERT INTO public.coin_wallets (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO bal FROM public.coin_wallets WHERE user_id = uid FOR UPDATE;

  IF bal < b.price THEN RAISE EXCEPTION 'insufficient funds'; END IF;

  UPDATE public.coin_wallets SET balance = balance - b.price, updated_at = now() WHERE user_id = uid;
  INSERT INTO public.user_cosmetics (user_id, item_id)
  SELECT uid, i FROM unnest(granted) AS i
  ON CONFLICT (user_id, item_id) DO NOTHING;

  RETURN jsonb_build_object('granted', to_jsonb(granted), 'new_balance', bal - b.price);
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_bundle(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.purchase_bundle(text) TO authenticated;

COMMIT;
