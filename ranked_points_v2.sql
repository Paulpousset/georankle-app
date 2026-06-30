-- ════════════════════════════════════════════════════════════════════════════
-- Ranked points v2 — asymmetric ELO by tier.
-- Supersedes the fixed-K=32 apply_ranked_result in economy.sql.
--
-- Each player's rating change uses the gain/loss K-factor of THEIR OWN current
-- tier: low ranks gain a lot / lose little (easy climb), high ranks gain little /
-- lose a lot (sticky ceiling). Mirrors ELO_K in src/lib/ranked.ts.
-- Coin awards (win 20 / loss 8) and all idempotency guards are unchanged.
-- Re-runnable: every statement is CREATE OR REPLACE.
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

CREATE OR REPLACE FUNCTION public.apply_ranked_result(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m              public.matches%ROWTYPE;
  caller         uuid := auth.uid();
  win_reward     constant int := 20;
  loss_reward    constant int := 8;
  needed         int;
  p1_elo         int;
  p2_elo         int;
  exp1           numeric;
  s1             numeric;
  d1             int;
  d2             int;
  new1           int;
  new2           int;
  p1_won         boolean;
  caller_is_p1   boolean;
  caller_coins   int;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF caller <> m.player1_id AND caller <> m.player2_id THEN
    RAISE EXCEPTION 'not a participant';
  END IF;
  IF m.is_ranked IS NOT TRUE THEN RAISE EXCEPTION 'match is not ranked'; END IF;
  IF m.player2_id IS NULL THEN RAISE EXCEPTION 'match has no opponent'; END IF;

  needed := ceil(GREATEST(m.best_of, 1) / 2.0);
  IF m.p1_rounds_won < needed AND m.p2_rounds_won < needed THEN
    RAISE EXCEPTION 'series not finished';
  END IF;

  caller_is_p1 := (caller = m.player1_id);

  IF m.rating_applied THEN
    SELECT elo INTO new1 FROM public.player_ratings
      WHERE user_id = CASE WHEN caller_is_p1 THEN m.player1_id ELSE m.player2_id END;
    RETURN jsonb_build_object('already_applied', true, 'new_elo', COALESCE(new1, 1000), 'coins_awarded', 0);
  END IF;

  p1_won := m.p1_rounds_won > m.p2_rounds_won;

  INSERT INTO public.player_ratings (user_id) VALUES (m.player1_id)
    ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.player_ratings (user_id) VALUES (m.player2_id)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT elo INTO p1_elo FROM public.player_ratings WHERE user_id = m.player1_id;
  SELECT elo INTO p2_elo FROM public.player_ratings WHERE user_id = m.player2_id;

  exp1 := 1.0 / (1.0 + power(10.0, (p2_elo - p1_elo) / 400.0));
  s1   := CASE WHEN p1_won THEN 1 ELSE 0 END;
  -- Each player uses the gain/loss K of their own tier.
  d1   := round(public.elo_k_factor(p1_elo, p1_won)       * (s1 - exp1));
  d2   := round(public.elo_k_factor(p2_elo, NOT p1_won)   * ((1 - s1) - (1 - exp1)));
  new1 := greatest(0, p1_elo + d1);
  new2 := greatest(0, p2_elo + d2);

  UPDATE public.player_ratings
    SET elo = new1,
        wins = wins + CASE WHEN p1_won THEN 1 ELSE 0 END,
        losses = losses + CASE WHEN p1_won THEN 0 ELSE 1 END,
        updated_at = now()
    WHERE user_id = m.player1_id;

  UPDATE public.player_ratings
    SET elo = new2,
        wins = wins + CASE WHEN p1_won THEN 0 ELSE 1 END,
        losses = losses + CASE WHEN p1_won THEN 1 ELSE 0 END,
        updated_at = now()
    WHERE user_id = m.player2_id;

  -- Coins: winner gets win_reward, loser loss_reward.
  INSERT INTO public.coin_wallets (user_id) VALUES (m.player1_id) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.coin_wallets (user_id) VALUES (m.player2_id) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.coin_wallets
    SET balance = balance + CASE WHEN p1_won THEN win_reward ELSE loss_reward END, updated_at = now()
    WHERE user_id = m.player1_id;
  UPDATE public.coin_wallets
    SET balance = balance + CASE WHEN p1_won THEN loss_reward ELSE win_reward END, updated_at = now()
    WHERE user_id = m.player2_id;

  UPDATE public.matches SET rating_applied = true, coins_awarded = true, status = 'completed'
    WHERE id = p_match_id;

  caller_coins := CASE
    WHEN (caller_is_p1 AND p1_won) OR (NOT caller_is_p1 AND NOT p1_won) THEN win_reward
    ELSE loss_reward END;

  RETURN jsonb_build_object(
    'already_applied', false,
    'old_elo', CASE WHEN caller_is_p1 THEN p1_elo ELSE p2_elo END,
    'new_elo', CASE WHEN caller_is_p1 THEN new1 ELSE new2 END,
    'elo_change', CASE WHEN caller_is_p1 THEN d1 ELSE d2 END,
    'won', CASE WHEN caller_is_p1 THEN p1_won ELSE NOT p1_won END,
    'coins_awarded', caller_coins
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_ranked_result(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_ranked_result(uuid) TO authenticated;
