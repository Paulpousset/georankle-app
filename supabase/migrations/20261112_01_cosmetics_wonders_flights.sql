-- ════════════════════════════════════════════════════════════════════════════
-- Cosmétiques « Merveilles & Envols » (2026-11-12).
--
--  1. Boutique : 6 emblèmes + 5 satellites. Prix = palier de rareté.
--     MUST mirror buildCosmeticPriceRows() (src/data/cosmetics.ts).
--  2. Packs : Envol, Temples anciens. MUST mirror BUNDLES.
--
-- Aucun changement au Mode Histoire. Re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Catalogue boutique ─────────────────────────────────────────────────────
INSERT INTO public.cosmetic_prices (item_id, category, price, is_default, rarity) VALUES
  ('emblem_stonehenge','emblem',150,false,'uncommon'),
  ('emblem_torii','emblem',150,false,'uncommon'),
  ('emblem_chichen','emblem',400,false,'rare'),
  ('emblem_burj','emblem',800,false,'epic'),
  ('emblem_angkor','emblem',800,false,'epic'),
  ('emblem_basil','emblem',1500,false,'legendary'),
  ('sat_kite','satellite',150,false,'uncommon'),
  ('sat_helicopter','satellite',150,false,'uncommon'),
  ('sat_zeppelin','satellite',400,false,'rare'),
  ('sat_shuttle','satellite',800,false,'epic'),
  ('sat_phoenix','satellite',1500,false,'legendary')
ON CONFLICT (item_id) DO UPDATE
  SET category = EXCLUDED.category, price = EXCLUDED.price,
      is_default = EXCLUDED.is_default, rarity = EXCLUDED.rarity;

-- ── 2. Packs ──────────────────────────────────────────────────────────────────
INSERT INTO public.cosmetic_bundles (bundle_id, item_ids, price) VALUES
  ('bundle_skies',   ARRAY['sat_kite','sat_helicopter','sat_zeppelin'], 500),
  ('bundle_temples', ARRAY['emblem_chichen','emblem_angkor','emblem_stonehenge'], 950)
ON CONFLICT (bundle_id) DO UPDATE
  SET item_ids = EXCLUDED.item_ids, price = EXCLUDED.price;
