-- Coin multiplier (rewarded-ad "double your winnings") + performance-scaled
-- solo reward.
--
-- End-of-game flow: the player earns their base solo coins, then may watch up to
-- two rewarded ads to multiply THIS session's coins — ad 1 → ×2, ad 2 → ×4.
--
-- Server-authoritative, honest-client (mirrors claim_rewarded_ad): the client
-- passes the base award and the stage; the server clamps the base to a sane max
-- and grants the exact increment, so a tampered client can't mint coins. Shares
-- the same daily ad cap (ad_claims, 5/day UTC) as the flat rewarded button, and
-- is gated by the same 'rewarded_ads' feature flag (OFF = no-op).

-- 1) Solo reward now SCALES WITH PERFORMANCE (decision 2026-07-20): the client
-- passes the session's normalized score (0..1000, see normalizeRoundScore) and
-- the server maps it linearly onto min_reward..max_reward (2..10). Floor of 2
-- keeps a played game worth something; the daily cap (5/mode) still bounds farm.
-- Adding an argument means REPLACE would create an overload, so drop the old
-- single-arg version first.
DROP FUNCTION IF EXISTS public.award_solo_coins(text);

CREATE OR REPLACE FUNCTION public.award_solo_coins(p_game_mode text, p_score int DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid        uuid := auth.uid();
  today      date := (now() at time zone 'utc')::date;
  cur        int;
  cap        constant int := 5;
  min_reward constant int := 2;
  max_reward constant int := 10;
  score      int;
  reward     int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_game_mode NOT IN ('classic','streak','versus','globe','guess','regions','quiz-capital','quiz-flag','higherlower','silhouette','borders') THEN
    RAISE EXCEPTION 'bad game mode';
  END IF;

  -- Normalized score is 0..1000; clamp defensively, then scale to the coin band.
  score  := GREATEST(0, LEAST(COALESCE(p_score, 0), 1000));
  reward := min_reward + round(score::numeric / 1000 * (max_reward - min_reward));

  INSERT INTO public.solo_coin_log (user_id, day, game_mode, count)
    VALUES (uid, today, p_game_mode, 0)
    ON CONFLICT (user_id, day, game_mode) DO NOTHING;

  SELECT count INTO cur FROM public.solo_coin_log
    WHERE user_id = uid AND day = today AND game_mode = p_game_mode FOR UPDATE;

  IF cur >= cap THEN
    RETURN jsonb_build_object('coins_awarded', 0, 'capped', true);
  END IF;

  UPDATE public.solo_coin_log SET count = count + 1
    WHERE user_id = uid AND day = today AND game_mode = p_game_mode;

  INSERT INTO public.coin_wallets (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.coin_wallets SET balance = balance + reward, updated_at = now() WHERE user_id = uid;

  RETURN jsonb_build_object('coins_awarded', reward, 'capped', false);
END;
$$;

REVOKE ALL ON FUNCTION public.award_solo_coins(text, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.award_solo_coins(text, int) TO authenticated;

-- 2) Multiplier claim after a watched ad. Stage 1 grants base×1 (×1→×2),
-- stage 2 grants base×2 (×2→×4). Consumes one ad_claims slot per ad watched, so
-- doubler views share the flat rewarded-ad daily cap.
CREATE OR REPLACE FUNCTION public.claim_coin_multiplier(p_base int, p_stage int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid       uuid := auth.uid();
  today     date := (now() at time zone 'utc')::date;
  cur       int;
  cap       constant int := 5;
  max_base  constant int := 50;   -- hard clamp so a tampered client can't inflate
  base      int;
  grant_amt int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE key = 'rewarded_ads' AND enabled) THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'disabled');
  END IF;
  IF p_stage NOT IN (1, 2) THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'bad_stage');
  END IF;

  base := GREATEST(0, LEAST(COALESCE(p_base, 0), max_base));
  IF base = 0 THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'no_base');
  END IF;

  -- Increment: stage 1 → base (total reaches ×2), stage 2 → base×2 (total ×4).
  grant_amt := base * (CASE WHEN p_stage = 1 THEN 1 ELSE 2 END);

  INSERT INTO public.ad_claims (user_id, day, count)
    VALUES (uid, today, 0)
    ON CONFLICT (user_id, day) DO NOTHING;

  SELECT count INTO cur FROM public.ad_claims
    WHERE user_id = uid AND day = today FOR UPDATE;
  IF cur >= cap THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'capped');
  END IF;

  UPDATE public.ad_claims SET count = count + 1
    WHERE user_id = uid AND day = today;

  INSERT INTO public.coin_wallets (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.coin_wallets
    SET balance = balance + grant_amt, updated_at = now()
    WHERE user_id = uid;

  RETURN jsonb_build_object('granted', true, 'coins', grant_amt);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_coin_multiplier(int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_coin_multiplier(int, int) TO authenticated;
