-- ════════════════════════════════════════════════════════════════════════════
-- Bot ranked results — ranked-counting matches against the matchmaking fill-in.
--
-- When no human opponent is found, matchmaking spins up a believable opponent
-- (random username + equipped World + hidden skill rating) and plays the series
-- out ON-DEVICE. The match is still a real `matches` row owned by the human:
--   player1_id = the human, player2_id = NULL,
--   is_ranked  = true,
--   game_data  = { ..., is_bot: true, bot: { rating, name, avatar_config } }
--
-- Because there is no second client to cross-report scores, the human's client
-- reports the final round counts. apply_bot_ranked_result validates the series is
-- actually decided, clamps the (client-supplied) bot rating to a band around the
-- player so a tampered game_data cannot inflate the swing, then applies a single-
-- sided ELO change vs that rating using the SAME asymmetric K-factor as real
-- ranked (src/lib/ranked.ts / ranked_points_v2.sql). Win 20 / loss 8 coins.
--
-- Idempotent via matches.rating_applied (one-shot per row). SECURITY DEFINER so
-- it can write the anti-cheat-locked rounds_won / rating_applied columns.
-- Self-contained (re-declares the ELO helpers) + re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

-- Tier from elo (mirror of RANKS thresholds in src/lib/ranked.ts).
CREATE OR REPLACE FUNCTION public.rank_tier_from_elo(p_elo int)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_elo >= 2400 THEN 'master'
    WHEN p_elo >= 2100 THEN 'diamond'
    WHEN p_elo >= 1800 THEN 'platinum'
    WHEN p_elo >= 1500 THEN 'gold'
    WHEN p_elo >= 1200 THEN 'silver'
    ELSE 'bronze'
  END;
$$;

-- Asymmetric K-factor (mirror of ELO_K in src/lib/ranked.ts).
CREATE OR REPLACE FUNCTION public.elo_k_factor(p_elo int, p_won boolean)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE public.rank_tier_from_elo(p_elo)
    WHEN 'bronze'   THEN CASE WHEN p_won THEN 40 ELSE 16 END
    WHEN 'silver'   THEN CASE WHEN p_won THEN 36 ELSE 22 END
    WHEN 'gold'     THEN CASE WHEN p_won THEN 32 ELSE 28 END
    WHEN 'platinum' THEN CASE WHEN p_won THEN 28 ELSE 32 END
    WHEN 'diamond'  THEN CASE WHEN p_won THEN 24 ELSE 36 END
    ELSE                 CASE WHEN p_won THEN 20 ELSE 40 END
  END;
$$;

CREATE OR REPLACE FUNCTION public.apply_bot_ranked_result(
  p_match_id          uuid,
  p_player_rounds_won int,
  p_bot_rounds_won    int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m            public.matches%ROWTYPE;
  caller       uuid := auth.uid();
  win_reward   constant int := 20;
  loss_reward  constant int := 8;
  needed       int;
  player_elo   int;
  bot_rating   int;
  exp_p        numeric;
  s_p          numeric;
  d            int;
  new_elo      int;
  player_won   boolean;
  reward       int;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF caller <> m.player1_id THEN RAISE EXCEPTION 'not the player'; END IF;
  IF m.is_ranked IS NOT TRUE THEN RAISE EXCEPTION 'match is not ranked'; END IF;
  IF COALESCE(m.game_data->>'is_bot', '') <> 'true' THEN RAISE EXCEPTION 'not a bot match'; END IF;
  IF m.player2_id IS NOT NULL THEN RAISE EXCEPTION 'bot match has an opponent'; END IF;

  needed := ceil(GREATEST(m.best_of, 1) / 2.0);

  -- Validate the reported series: non-negative, within the format, and exactly
  -- one side reached the wins needed (no double-win / unfinished claims).
  IF p_player_rounds_won < 0 OR p_bot_rounds_won < 0
     OR p_player_rounds_won + p_bot_rounds_won > GREATEST(m.best_of, 1)
     OR (p_player_rounds_won >= needed) = (p_bot_rounds_won >= needed) THEN
    RAISE EXCEPTION 'invalid series result';
  END IF;

  IF m.rating_applied THEN
    SELECT elo INTO new_elo FROM public.player_ratings WHERE user_id = caller;
    RETURN jsonb_build_object('already_applied', true, 'new_elo', COALESCE(new_elo, 1000), 'coins_awarded', 0);
  END IF;

  INSERT INTO public.player_ratings (user_id) VALUES (caller) ON CONFLICT (user_id) DO NOTHING;
  SELECT elo INTO player_elo FROM public.player_ratings WHERE user_id = caller;

  -- Clamp the stored bot rating to ±300 of the player (floor 100) so a tampered
  -- game_data cannot turn a single bot win into a huge ELO gain.
  bot_rating := COALESCE(NULLIF(m.game_data->'bot'->>'rating', '')::int, player_elo);
  bot_rating := GREATEST(100, LEAST(player_elo + 300, GREATEST(player_elo - 300, bot_rating)));

  player_won := p_player_rounds_won > p_bot_rounds_won;
  exp_p := 1.0 / (1.0 + power(10.0, (bot_rating - player_elo) / 400.0));
  s_p   := CASE WHEN player_won THEN 1 ELSE 0 END;
  d     := round(public.elo_k_factor(player_elo, player_won) * (s_p - exp_p));
  new_elo := greatest(0, player_elo + d);

  UPDATE public.player_ratings
    SET elo    = new_elo,
        wins   = wins   + CASE WHEN player_won THEN 1 ELSE 0 END,
        losses = losses + CASE WHEN player_won THEN 0 ELSE 1 END,
        updated_at = now()
    WHERE user_id = caller;

  reward := CASE WHEN player_won THEN win_reward ELSE loss_reward END;
  INSERT INTO public.coin_wallets (user_id) VALUES (caller) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.coin_wallets SET balance = balance + reward, updated_at = now() WHERE user_id = caller;

  UPDATE public.matches SET
    p1_rounds_won  = p_player_rounds_won,
    p2_rounds_won  = p_bot_rounds_won,
    rating_applied = true,
    coins_awarded  = true,
    status         = 'completed',
    updated_at     = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'already_applied', false,
    'old_elo',       player_elo,
    'new_elo',       new_elo,
    'elo_change',    d,
    'won',           player_won,
    'coins_awarded', reward
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_bot_ranked_result(uuid, int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_bot_ranked_result(uuid, int, int) TO authenticated;
