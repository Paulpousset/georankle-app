-- ════════════════════════════════════════════════════════════════════════════
-- Story mode: a single 300-level campaign (same for everyone), progressive
-- difficulty, one game mode per level. Server-authoritative like daily/economy —
-- clients READ progress (public, powers the friends-on-the-map view) and all
-- writes go through SECURITY DEFINER RPCs.
--
-- Lives: 5 max, one regenerates every REGEN_MINUTES; regeneration is computed at
-- READ time (no cron) from (lives, updated_at). A rewarded ad grants +1 life,
-- daily-capped and gated by the same 'rewarded_ads' feature flag as coins.
--
-- Re-runnable: every statement is idempotent. Both story_progress and story_lives
-- cascade on profile delete, so delete_user_account needs no change.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.story_progress (
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  level        int  NOT NULL CHECK (level BETWEEN 1 AND 300),
  stars        int  NOT NULL DEFAULT 0 CHECK (stars BETWEEN 0 AND 3),
  score        int  NOT NULL DEFAULT 0,     -- normalized 0..1000
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, level)
);

-- Denormalized highest level reached, for cheap "where is this player" reads
-- (mirrors how daily_streak lives on the profile).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS story_max_level int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.story_lives (
  user_id       uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  lives         int  NOT NULL DEFAULT 5,     -- stored value; effective = +regen since updated_at
  updated_at    timestamptz NOT NULL DEFAULT now(),
  ad_refills    int  NOT NULL DEFAULT 0,     -- lives gained via ad today
  ad_refill_day date
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- story_progress: PUBLIC read (same as scores/daily_results) so the app can show
-- friends' globes on the map by querying their user_ids. No sensitive data. This
-- deliberately avoids a cross-table friends subquery in the policy (that class of
-- policy caused the FFA RLS recursion — see ffa_rls_recursion_fix.sql). Writes are
-- RPC-only.

ALTER TABLE public.story_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read story progress" ON public.story_progress;
CREATE POLICY "public read story progress" ON public.story_progress
  FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS story_progress_user_idx ON public.story_progress (user_id);

-- story_lives: read own only (nobody else needs your life count).
ALTER TABLE public.story_lives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own story lives" ON public.story_lives;
CREATE POLICY "read own story lives" ON public.story_lives
  FOR SELECT USING ((select auth.uid()) = user_id);

-- ── Lives helpers ────────────────────────────────────────────────────────────
-- Regeneration is computed on read: effective lives = min(MAX, stored + elapsed
-- full intervals since updated_at). When we mutate lives we first "settle" the
-- regenerated value into the row and reset updated_at accordingly so no partial
-- interval is lost.

-- Settle regenerated lives into the row, returning the effective count. Assumes
-- the row exists and is locked by the caller.
CREATE OR REPLACE FUNCTION public._story_settle_lives(p_uid uuid)
RETURNS int
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  max_lives   constant int := 5;
  regen_secs  constant int := 20 * 60;   -- one life per 20 min
  cur_lives   int;
  upd         timestamptz;
  elapsed     int;
  gained      int;
  eff         int;
BEGIN
  SELECT lives, updated_at INTO cur_lives, upd
    FROM public.story_lives WHERE user_id = p_uid FOR UPDATE;

  IF cur_lives >= max_lives THEN
    -- Full: keep the clock pinned to now so it doesn't "bank" future regen.
    UPDATE public.story_lives SET updated_at = now() WHERE user_id = p_uid;
    RETURN max_lives;
  END IF;

  elapsed := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - upd)))::int);
  gained  := elapsed / regen_secs;
  IF gained <= 0 THEN
    RETURN cur_lives;
  END IF;

  eff := LEAST(max_lives, cur_lives + gained);
  -- Advance the clock by exactly the consumed intervals (keep the remainder),
  -- unless we hit the cap, in which case reset to now.
  IF eff >= max_lives THEN
    UPDATE public.story_lives SET lives = max_lives, updated_at = now() WHERE user_id = p_uid;
  ELSE
    UPDATE public.story_lives
      SET lives = eff, updated_at = upd + make_interval(secs => gained * regen_secs)
      WHERE user_id = p_uid;
  END IF;
  RETURN eff;
END;
$$;

-- Ensure a lives row exists for the user.
CREATE OR REPLACE FUNCTION public._story_ensure_lives(p_uid uuid)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO public.story_lives (user_id) VALUES (p_uid) ON CONFLICT (user_id) DO NOTHING;
$$;

-- Read the full story state (regenerated lives + max level + total stars).
CREATE OR REPLACE FUNCTION public.get_story_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid        uuid := auth.uid();
  eff        int;
  upd        timestamptz;
  max_lvl    int;
  total_star int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM public._story_ensure_lives(uid);
  eff := public._story_settle_lives(uid);
  SELECT updated_at INTO upd FROM public.story_lives WHERE user_id = uid;
  SELECT COALESCE(story_max_level, 0) INTO max_lvl FROM public.profiles WHERE id = uid;
  SELECT COALESCE(SUM(stars), 0) INTO total_star FROM public.story_progress WHERE user_id = uid;

  RETURN jsonb_build_object(
    'lives', eff,
    'max_lives', 5,
    'lives_updated_at', upd,
    'regen_seconds', 20 * 60,
    'max_level', max_lvl,
    'total_stars', total_star
  );
END;
$$;

-- Spend one life to start a level. Refuses at 0. Returns the remaining lives.
CREATE OR REPLACE FUNCTION public.consume_story_life()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  eff int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM public._story_ensure_lives(uid);
  eff := public._story_settle_lives(uid);
  IF eff <= 0 THEN
    RETURN jsonb_build_object('spent', false, 'lives', 0, 'reason', 'no_lives');
  END IF;
  UPDATE public.story_lives
    SET lives = eff - 1,
        -- Start the regen clock now if we just dropped below the cap from full.
        updated_at = CASE WHEN eff = 5 THEN now() ELSE updated_at END
    WHERE user_id = uid;
  RETURN jsonb_build_object('spent', true, 'lives', eff - 1);
END;
$$;

-- Grant +1 life for a watched rewarded ad. Gated by the 'rewarded_ads' flag and
-- daily-capped (shares the pattern of claim_rewarded_ad).
CREATE OR REPLACE FUNCTION public.claim_story_life()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid    uuid := auth.uid();
  today  date := (now() at time zone 'utc')::date;
  cap    constant int := 5;   -- ad-refills per day
  maxl   constant int := 5;
  cur    int;
  eff    int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE key = 'rewarded_ads' AND enabled) THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'disabled');
  END IF;

  PERFORM public._story_ensure_lives(uid);

  -- Reset the daily ad counter when the UTC day rolls over.
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
    SET lives = eff + 1, ad_refills = ad_refills + 1, ad_refill_day = today
    WHERE user_id = uid;
  RETURN jsonb_build_object('granted', true, 'lives', eff + 1);
END;
$$;

-- ── complete_story_level: upsert progress (keep best) + bump max level + coins ─
-- Coins are granted ONLY on the first-ever completion of a level (the INSERT that
-- creates the row), so replays/retries can't farm. Passing >= PASS_SCORE stars is
-- validated by the caller; we clamp here defensively.
CREATE OR REPLACE FUNCTION public.complete_story_level(
  p_level int,
  p_score int,
  p_stars int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid         uuid := auth.uid();
  prev_stars  int;
  first_clear boolean;
  reward      constant int := 10;   -- coins for the first clear of a level
  coins_added int := 0;
  new_max     int;
  reward_item text := NULL;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_level < 1 OR p_level > 300 THEN RAISE EXCEPTION 'bad level'; END IF;

  p_score := GREATEST(0, LEAST(1000, COALESCE(p_score, 0)));
  p_stars := GREATEST(0, LEAST(3, COALESCE(p_stars, 0)));

  -- Prior best stars (NULL = never attempted). A "first clear" is the transition
  -- from not-yet-cleared (0 or none) to ≥1 star — NOT merely the first row, so a
  -- failed first attempt doesn't burn the reward before the level is beaten.
  SELECT stars INTO prev_stars FROM public.story_progress
    WHERE user_id = uid AND level = p_level;
  first_clear := (COALESCE(prev_stars, 0) = 0) AND (p_stars >= 1);

  INSERT INTO public.story_progress (user_id, level, stars, score)
    VALUES (uid, p_level, p_stars, p_score)
    ON CONFLICT (user_id, level) DO UPDATE
      SET stars        = GREATEST(story_progress.stars, EXCLUDED.stars),
          score        = GREATEST(story_progress.score, EXCLUDED.score),
          completed_at = now();

  -- A level counts as "cleared" (unlocks the next) only with ≥1 star.
  IF p_stars >= 1 THEN
    UPDATE public.profiles
      SET story_max_level = GREATEST(COALESCE(story_max_level, 0), p_level)
      WHERE id = uid;
  END IF;
  SELECT COALESCE(story_max_level, 0) INTO new_max FROM public.profiles WHERE id = uid;

  IF first_clear THEN
    -- Coins on first clear.
    INSERT INTO public.coin_wallets (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.coin_wallets SET balance = balance + reward, updated_at = now() WHERE user_id = uid;
    coins_added := reward;

    -- Exclusive cosmetic at milestone levels (must mirror STORY_COSMETIC_UNLOCKS
    -- in src/data/cosmetics.ts). Granted for free — no cosmetic_prices row needed.
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

-- ── Grants ────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.get_story_state()               FROM public, anon;
REVOKE ALL ON FUNCTION public.consume_story_life()            FROM public, anon;
REVOKE ALL ON FUNCTION public.claim_story_life()              FROM public, anon;
REVOKE ALL ON FUNCTION public.complete_story_level(int, int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_story_state()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_story_life()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_story_life()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_story_level(int, int, int) TO authenticated;
-- Internal helpers: not callable directly by clients.
REVOKE ALL ON FUNCTION public._story_settle_lives(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._story_ensure_lives(uuid) FROM public, anon, authenticated;
