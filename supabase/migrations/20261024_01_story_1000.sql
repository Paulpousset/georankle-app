-- ════════════════════════════════════════════════════════════════════════════
-- Story mode v3 (2026-10-24) — 1000 levels, rarer rewards.
--
--  1. story_progress.level : 1..500 → 1..1000.
--  2. complete_story_level :
--     - accepts up to level 1000;
--     - star gate capped at world 50 (2.5 stars per earlier level), so it never
--       asks more than the 3 stars a level gives. Same numbers as before up to
--       world 50. MUST mirror starsRequiredForTier in src/data/story.ts;
--     - coins: 60 on the first clear of every 10th level (a world's défi)
--       instead of 10 on every level. A life is now only lost on a failed
--       level, so the campaign moves faster and rewards come less often.
--       MUST mirror COIN_LEVEL_STEP / STORY_COIN_REWARD in src/data/story.ts;
--     - the 14 exclusive cosmetics are spread over the 1000 levels.
--       MUST mirror STORY_COSMETIC_UNLOCKS in src/data/cosmetics.ts.
--  3. Backfill: players already past a (new) milestone receive its item.
--     Nobody loses an item they already own.
--
-- Lives: unchanged server-side. consume_story_life is now called by the client
-- when a level is FAILED (or abandoned) instead of when it starts.
--
-- Re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Level range ────────────────────────────────────────────────────────────
ALTER TABLE public.story_progress DROP CONSTRAINT IF EXISTS story_progress_level_check;
ALTER TABLE public.story_progress
  ADD CONSTRAINT story_progress_level_check CHECK (level BETWEEN 1 AND 1000);

-- ── 2. complete_story_level ───────────────────────────────────────────────────
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
      WHEN 900  THEN 'cosmos_st_embersky'
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

-- ── 3. Backfill the new milestone schedule ───────────────────────────────────
INSERT INTO public.user_cosmetics (user_id, item_id)
SELECT p.id, m.item_id
  FROM public.profiles p
  JOIN (VALUES
    (40, 'emblem_st_star'),
    (90, 'sat_st_moon'),
    (150, 'globe_st_fractured'),
    (220, 'emblem_st_summit'),
    (290, 'orbit_st_laurel'),
    (360, 'cosmos_st_aurorastorm'),
    (430, 'emblem_st_worldtree'),
    (500, 'sat_st_ship'),
    (575, 'globe_st_galaxy'),
    (650, 'sat_st_comet'),
    (725, 'orbit_st_compass'),
    (800, 'emblem_st_laurel'),
    (900, 'cosmos_st_embersky'),
    (1000, 'globe_st_crowned')
  ) AS m(level, item_id) ON p.story_max_level >= m.level
ON CONFLICT DO NOTHING;
