-- ════════════════════════════════════════════════════════════════════════════
-- Story mode v2 (2026-09-29) — 500 levels, star gates between worlds, and the
-- lives shop behind the « + » button.
--
--  1. story_progress.level : 1..300 → 1..500.
--  2. complete_story_level :
--     - accepts up to level 500;
--     - star gate: the first level of world T (T ≥ 2) only advances the
--       campaign when the stars earned on every earlier level reach
--       ceil(levels × (190 + T) / 96) — 2.0 stars/level at world 2 rising to
--       2.5 at world 50. MUST mirror starsRequiredForTier in src/data/story.ts.
--       A completion behind a closed gate is not recorded (gate_closed: true),
--       it doesn't raise — old clients keep syncing without an error loop;
--     - reward schedule realigned on STORY_COSMETIC_UNLOCKS (src/data/cosmetics.ts):
--       the hardening pass of harden_write_surfaces.sql had re-created the
--       function with the pre-« Collection de l'Explorateur » ids
--       (globe_st_emerald…), which no longer exist in the catalogue.
--  3. claim_story_life : a rewarded ad now refills ALL lives (was +1).
--  4. buy_story_life   : NEW — one life for STORY_LIFE_PRICE coins.
--  5. Backfill: players already past a milestone receive its exclusive item.
--
-- Re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Level range ────────────────────────────────────────────────────────────
ALTER TABLE public.story_progress DROP CONSTRAINT IF EXISTS story_progress_level_check;
ALTER TABLE public.story_progress
  ADD CONSTRAINT story_progress_level_check CHECK (level BETWEEN 1 AND 500);

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
  reward      constant int := 10;
  coins_added int := 0;
  new_max     int;
  reward_item text := NULL;
  cur_max     int;
  gate_tier   int;
  gate_need   int;
  gate_have   int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_level < 1 OR p_level > 500 THEN RAISE EXCEPTION 'bad level'; END IF;

  -- On ne peut valider qu'un niveau déjà atteint, ou le suivant.
  SELECT COALESCE(story_max_level, 0) INTO cur_max FROM public.profiles WHERE id = uid;
  IF p_level > COALESCE(cur_max, 0) + 1 THEN
    RAISE EXCEPTION 'level % not unlocked (max %)', p_level, cur_max;
  END IF;

  -- Porte d'étoiles : premier niveau d'un monde encore jamais franchi.
  IF p_level > COALESCE(cur_max, 0) AND p_level > 1 AND (p_level - 1) % 10 = 0 THEN
    gate_tier := (p_level - 1) / 10 + 1;
    gate_need := ((gate_tier - 1) * 10 * (190 + gate_tier) + 95) / 96;
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

  IF first_clear THEN
    INSERT INTO public.coin_wallets (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.coin_wallets SET balance = balance + reward, updated_at = now() WHERE user_id = uid;
    coins_added := reward;

    -- Must mirror STORY_COSMETIC_UNLOCKS in src/data/cosmetics.ts.
    reward_item := CASE p_level
      WHEN 30  THEN 'emblem_st_star'
      WHEN 60  THEN 'sat_st_moon'
      WHEN 75  THEN 'globe_st_fractured'
      WHEN 90  THEN 'emblem_st_summit'
      WHEN 100 THEN 'orbit_st_laurel'
      WHEN 125 THEN 'cosmos_st_aurorastorm'
      WHEN 150 THEN 'emblem_st_worldtree'
      WHEN 170 THEN 'sat_st_ship'
      WHEN 180 THEN 'globe_st_galaxy'
      WHEN 200 THEN 'sat_st_comet'
      WHEN 225 THEN 'orbit_st_compass'
      WHEN 250 THEN 'emblem_st_laurel'
      WHEN 275 THEN 'cosmos_st_embersky'
      WHEN 300 THEN 'globe_st_crowned'
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

-- ── 3. claim_story_life : the ad refills every life ──────────────────────────
CREATE OR REPLACE FUNCTION public.claim_story_life()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid    uuid := auth.uid();
  today  date := (now() at time zone 'utc')::date;
  cap    constant int := 5;   -- ad refills per day
  maxl   constant int := 5;
  cur    int;
  eff    int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE key = 'rewarded_ads' AND enabled) THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'disabled');
  END IF;

  PERFORM public._story_ensure_lives(uid);

  UPDATE public.story_lives
    SET ad_refills = 0, ad_refill_day = today
    WHERE user_id = uid AND (ad_refill_day IS DISTINCT FROM today);

  eff := public._story_settle_lives(uid);
  SELECT ad_refills INTO cur FROM public.story_lives WHERE user_id = uid FOR UPDATE;
  IF cur >= cap THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'capped', 'lives', eff);
  END IF;
  IF eff >= maxl THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'full', 'lives', eff);
  END IF;

  UPDATE public.story_lives
    SET lives = maxl, updated_at = now(), ad_refills = ad_refills + 1, ad_refill_day = today
    WHERE user_id = uid;
  RETURN jsonb_build_object('granted', true, 'lives', maxl);
END;
$$;

-- ── 4. buy_story_life : one life for coins ───────────────────────────────────
-- Price MUST mirror STORY_LIFE_PRICE in src/lib/story.ts.
CREATE OR REPLACE FUNCTION public.buy_story_life()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid   uuid := auth.uid();
  price constant int := 15;
  maxl  constant int := 5;
  eff   int;
  bal   int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM public._story_ensure_lives(uid);
  eff := public._story_settle_lives(uid);

  INSERT INTO public.coin_wallets (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO bal FROM public.coin_wallets WHERE user_id = uid FOR UPDATE;

  IF eff >= maxl THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'full', 'lives', eff, 'balance', bal);
  END IF;
  IF bal < price THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'funds', 'lives', eff, 'balance', bal);
  END IF;

  UPDATE public.coin_wallets SET balance = balance - price, updated_at = now() WHERE user_id = uid;
  -- Regen clock untouched: the running interval keeps counting toward the next life.
  UPDATE public.story_lives SET lives = eff + 1 WHERE user_id = uid;
  IF eff + 1 >= maxl THEN
    UPDATE public.story_lives SET updated_at = now() WHERE user_id = uid;
  END IF;
  RETURN jsonb_build_object('granted', true, 'lives', eff + 1, 'balance', bal - price);
END;
$$;

REVOKE ALL ON FUNCTION public.buy_story_life() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.buy_story_life() TO authenticated;

-- ── 5. Backfill the realigned milestone rewards ──────────────────────────────
INSERT INTO public.user_cosmetics (user_id, item_id)
SELECT p.id, m.item_id
  FROM public.profiles p
  JOIN (VALUES
    (30, 'emblem_st_star'), (60, 'sat_st_moon'), (75, 'globe_st_fractured'),
    (90, 'emblem_st_summit'), (100, 'orbit_st_laurel'), (125, 'cosmos_st_aurorastorm'),
    (150, 'emblem_st_worldtree'), (170, 'sat_st_ship'), (180, 'globe_st_galaxy'),
    (200, 'sat_st_comet'), (225, 'orbit_st_compass'), (250, 'emblem_st_laurel'),
    (275, 'cosmos_st_embersky'), (300, 'globe_st_crowned')
  ) AS m(level, item_id) ON p.story_max_level >= m.level
ON CONFLICT DO NOTHING;
