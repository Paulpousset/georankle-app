-- ════════════════════════════════════════════════════════════════════════════
-- Cosmétiques « Nouveaux mondes » (2026-10-24).
--
--  1. Boutique : 6 globes + 4 fonds cosmos. Prix = palier de rareté.
--     MUST mirror buildCosmeticPriceRows() (src/data/cosmetics.ts).
--  2. Packs : Explorateur, Néo-rétro. MUST mirror BUNDLES.
--  3. Mode Histoire : 2 nouvelles exclusivités, au niveau 850 (Monde
--     d'Obsidienne) et 950 (Voûte Céleste) — la fin de campagne garde une
--     récompense tous les 50 niveaux. Le reste du barème (#62) ne bouge pas.
--     MUST mirror STORY_COSMETIC_UNLOCKS.
--  4. Backfill : les joueurs déjà au-delà de 850 / 950 reçoivent l'item.
--
-- Re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Catalogue boutique ─────────────────────────────────────────────────────
INSERT INTO public.cosmetic_prices (item_id, category, price, is_default, rarity) VALUES
  ('cosmos_dusk','cosmos',150,false,'uncommon'),
  ('cosmos_deepsea','cosmos',400,false,'rare'),
  ('cosmos_ringedplanet','cosmos',800,false,'epic'),
  ('cosmos_synthwave','cosmos',1500,false,'legendary'),
  ('globe_jungle','globe',150,false,'uncommon'),
  ('globe_desert','globe',150,false,'uncommon'),
  ('globe_candy','globe',400,false,'rare'),
  ('globe_neptune','globe',400,false,'rare'),
  ('globe_toxic','globe',800,false,'epic'),
  ('globe_diamond','globe',1500,false,'legendary')
ON CONFLICT (item_id) DO UPDATE
  SET category = EXCLUDED.category, price = EXCLUDED.price,
      is_default = EXCLUDED.is_default, rarity = EXCLUDED.rarity;

-- ── 2. Packs ──────────────────────────────────────────────────────────────────
INSERT INTO public.cosmetic_bundles (bundle_id, item_ids, price) VALUES
  ('bundle_explorer', ARRAY['globe_jungle','globe_desert','cosmos_deepsea'], 500),
  ('bundle_retro',    ARRAY['cosmos_synthwave','globe_toxic','globe_candy'], 1900)
ON CONFLICT (bundle_id) DO UPDATE
  SET item_ids = EXCLUDED.item_ids, price = EXCLUDED.price;

-- ── 3. complete_story_level (barème de 20261024_01 + 850 / 950) ───────────────
CREATE OR REPLACE FUNCTION public.complete_story_level(p_level int, p_score int, p_stars int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid         uuid := auth.uid();
  prev_stars  int;
  first_clear boolean;
  reward      constant int := 60;   -- STORY_COIN_REWARD, paid every 10th level
  coins_added int := 0;
  new_max     int;
  reward_item text := NULL;
  cur_max     int;
  gate_tier   int;
  gate_need   int;
  gate_have   int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_level < 1 OR p_level > 1000 THEN RAISE EXCEPTION 'bad level'; END IF;

  -- On ne peut valider qu'un niveau déjà atteint, ou le suivant.
  SELECT COALESCE(story_max_level, 0) INTO cur_max FROM public.profiles WHERE id = uid;
  IF p_level > COALESCE(cur_max, 0) + 1 THEN
    RAISE EXCEPTION 'level % not unlocked (max %)', p_level, cur_max;
  END IF;

  -- Porte d'étoiles : premier niveau d'un monde encore jamais franchi.
  IF p_level > COALESCE(cur_max, 0) AND p_level > 1 AND (p_level - 1) % 10 = 0 THEN
    gate_tier := (p_level - 1) / 10 + 1;
    gate_need := ((gate_tier - 1) * 10 * (190 + LEAST(gate_tier, 50)) + 95) / 96;
    SELECT COALESCE(SUM(stars), 0) INTO gate_have
      FROM public.story_progress WHERE user_id = uid AND level < p_level;
    IF gate_have < gate_need THEN
      RETURN jsonb_build_object(
        'gate_closed', true,
        'stars_required', gate_need,
        'stars_have', gate_have,
        'first_clear', false,
        'coins', 0,
        'max_level', cur_max,
        'unlocked', NULL
      );
    END IF;
  END IF;

  p_score := GREATEST(0, LEAST(1000, COALESCE(p_score, 0)));
  p_stars := GREATEST(0, LEAST(3, COALESCE(p_stars, 0)));

  SELECT stars INTO prev_stars FROM public.story_progress
    WHERE user_id = uid AND level = p_level;
  first_clear := (COALESCE(prev_stars, 0) = 0) AND (p_stars >= 1);

  INSERT INTO public.story_progress (user_id, level, stars, score)
    VALUES (uid, p_level, p_stars, p_score)
    ON CONFLICT (user_id, level) DO UPDATE
      SET stars        = GREATEST(story_progress.stars, EXCLUDED.stars),
          score        = GREATEST(story_progress.score, EXCLUDED.score),
          completed_at = now();

  IF p_stars >= 1 THEN
    UPDATE public.profiles
      SET story_max_level = GREATEST(COALESCE(story_max_level, 0), p_level)
      WHERE id = uid;
  END IF;
  SELECT COALESCE(story_max_level, 0) INTO new_max FROM public.profiles WHERE id = uid;

  -- Coins only on a world's last level (COIN_LEVEL_STEP in src/data/story.ts).
  IF first_clear AND p_level % 10 = 0 THEN
    INSERT INTO public.coin_wallets (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.coin_wallets SET balance = balance + reward, updated_at = now() WHERE user_id = uid;
    coins_added := reward;
  END IF;

  IF first_clear THEN
    -- Must mirror STORY_COSMETIC_UNLOCKS in src/data/cosmetics.ts.
    reward_item := CASE p_level
      WHEN 40   THEN 'emblem_st_star'
      WHEN 90   THEN 'sat_st_moon'
      WHEN 150  THEN 'globe_st_fractured'
      WHEN 220  THEN 'emblem_st_summit'
      WHEN 290  THEN 'orbit_st_laurel'
      WHEN 360  THEN 'cosmos_st_aurorastorm'
      WHEN 430  THEN 'emblem_st_worldtree'
      WHEN 500  THEN 'sat_st_ship'
      WHEN 575  THEN 'globe_st_galaxy'
      WHEN 650  THEN 'sat_st_comet'
      WHEN 725  THEN 'orbit_st_compass'
      WHEN 800  THEN 'emblem_st_laurel'
      WHEN 850  THEN 'globe_st_obsidian'
      WHEN 900  THEN 'cosmos_st_embersky'
      WHEN 950  THEN 'cosmos_st_celestial'
      WHEN 1000 THEN 'globe_st_crowned'
      ELSE NULL
    END;
    IF reward_item IS NOT NULL THEN
      INSERT INTO public.user_cosmetics (user_id, item_id)
        VALUES (uid, reward_item) ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'stars', p_stars,
    'score', p_score,
    'first_clear', first_clear,
    'coins', coins_added,
    'max_level', new_max,
    'unlocked', reward_item
  );
END;
$$;

-- ── 4. Backfill des deux nouveaux jalons ──────────────────────────────────────
INSERT INTO public.user_cosmetics (user_id, item_id)
SELECT p.id, m.item_id
  FROM public.profiles p
  JOIN (VALUES
    (850, 'globe_st_obsidian'),
    (950, 'cosmos_st_celestial')
  ) AS m(level, item_id) ON p.story_max_level >= m.level
ON CONFLICT DO NOTHING;
