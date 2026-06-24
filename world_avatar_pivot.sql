-- ════════════════════════════════════════════════════════════════════════════
-- World Avatar pivot — replace the fantasy cosmetic catalog (KayKit heroes/gear)
-- with the geographic "World" identity (globe / cosmos / orbit / emblem /
-- satellite) and introduce rarity tiers.
--
-- Run ONCE against the project. Safe & idempotent: refunds happen against the
-- pre-pivot price rows, then the catalog is fully replaced. Re-running after the
-- catalog has already been swapped refunds nothing (no legacy owned items left).
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

-- 1. Ensure the rarity column exists (no-op if economy.sql already added it).
ALTER TABLE public.cosmetic_prices
  ADD COLUMN IF NOT EXISTS rarity text NOT NULL DEFAULT 'common';

-- 2. Refund coins for every owned, non-default item priced under the OLD catalog.
--    Done before the price table is replaced so legacy prices are still readable.
WITH refunds AS (
  SELECT uc.user_id, COALESCE(SUM(cp.price), 0) AS amount
  FROM public.user_cosmetics uc
  JOIN public.cosmetic_prices cp ON cp.item_id = uc.item_id
  WHERE cp.is_default = false
  GROUP BY uc.user_id
)
INSERT INTO public.coin_wallets (user_id, balance)
SELECT r.user_id, r.amount FROM refunds r
ON CONFLICT (user_id) DO UPDATE
  SET balance = public.coin_wallets.balance + EXCLUDED.balance,
      updated_at = now();

-- 3. Replace the catalog (cosmetic_prices) with the new World items.
DELETE FROM public.cosmetic_prices;
INSERT INTO public.cosmetic_prices (item_id, category, price, is_default, rarity) VALUES
  ('cosmos_bluenight','cosmos',0,true,'common'),
  ('cosmos_starfield','cosmos',50,false,'common'),
  ('cosmos_sunrise','cosmos',150,false,'uncommon'),
  ('cosmos_aurora','cosmos',400,false,'rare'),
  ('cosmos_milkyway','cosmos',800,false,'epic'),
  ('cosmos_nebula','cosmos',800,false,'epic'),
  ('cosmos_meteors','cosmos',1500,false,'legendary'),
  ('globe_classic','globe',0,true,'common'),
  ('globe_political','globe',150,false,'uncommon'),
  ('globe_relief','globe',150,false,'uncommon'),
  ('globe_vintage','globe',400,false,'rare'),
  ('globe_satellite','globe',400,false,'rare'),
  ('globe_night','globe',800,false,'epic'),
  ('globe_hologram','globe',800,false,'epic'),
  ('globe_gold','globe',1500,false,'legendary'),
  ('globe_gaia','globe',1500,false,'legendary'),
  ('orbit_none','orbit',0,true,'common'),
  ('orbit_meridian','orbit',50,false,'common'),
  ('orbit_graticule','orbit',150,false,'uncommon'),
  ('orbit_compass','orbit',400,false,'rare'),
  ('orbit_neon','orbit',800,false,'epic'),
  ('orbit_asteroids','orbit',1500,false,'legendary'),
  ('emblem_none','emblem',0,true,'common'),
  ('emblem_compass','emblem',50,false,'common'),
  ('emblem_eiffel','emblem',150,false,'uncommon'),
  ('emblem_pyramids','emblem',150,false,'uncommon'),
  ('emblem_liberty','emblem',400,false,'rare'),
  ('emblem_bigben','emblem',400,false,'rare'),
  ('emblem_fuji','emblem',800,false,'epic'),
  ('emblem_christ','emblem',800,false,'epic'),
  ('emblem_taj','emblem',1500,false,'legendary'),
  ('emblem_colosseum','emblem',1500,false,'legendary'),
  ('sat_none','satellite',0,true,'common'),
  ('sat_moon','satellite',50,false,'common'),
  ('sat_plane','satellite',150,false,'uncommon'),
  ('sat_balloon','satellite',150,false,'uncommon'),
  ('sat_satellite','satellite',400,false,'rare'),
  ('sat_iss','satellite',800,false,'epic'),
  ('sat_comet','satellite',1500,false,'legendary');

-- 4. Drop ownership rows that point at items no longer in the catalog (the old
--    fantasy cosmetics — already refunded above).
DELETE FROM public.user_cosmetics uc
WHERE NOT EXISTS (
  SELECT 1 FROM public.cosmetic_prices cp WHERE cp.item_id = uc.item_id
);

-- 5. Reset equipped avatar configs. Legacy configs reference old slots (hero/
--    weapon/…) and would fail validation; NULL makes the app derive a fresh
--    World default (classic Earth + personal cosmos tint) on next load.
UPDATE public.profiles SET avatar_config = NULL WHERE avatar_config IS NOT NULL;

COMMIT;
