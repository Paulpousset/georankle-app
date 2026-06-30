-- ════════════════════════════════════════════════════════════════════════════
-- Cumulative-points tiebreaker for ranked / online matches.
--
-- Scores are now unified to a 0–1000 scale per round across every game mode
-- (client: lib/score.ts normalizeRoundScore). This migration makes the match
-- outcome fall back to *cumulative points* when both players win the same number
-- of rounds — "en cas d'égalité, les points priment".
--
-- finalize_round wipes p*_current_score to 0 every round, so we first persist a
-- running total in two new server-only columns, then use it as the tiebreak.
--
-- Re-runnable: idempotent (ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE). The new
-- columns are NOT in the client UPDATE whitelist (see server_authoritative.sql),
-- so only the SECURITY DEFINER RPCs ever write them.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Cumulative per-match score columns (server-authoritative) ────────────────
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS p1_total_score int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS p2_total_score int NOT NULL DEFAULT 0;

-- ── finalize_round: accumulate totals before the per-round reset ─────────────
-- Identical to server_authoritative.sql except it now (a) adds each round's
-- score into p*_total_score before zeroing the per-round columns, and (b) also
-- completes the series once every best_of round has been played, so a run of
-- drawn rounds can no longer stall a match below `needed`.
CREATE OR REPLACE FUNCTION public.finalize_round(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m       public.matches%ROWTYPE;
  caller  uuid := auth.uid();
  needed  int;
  p1_win  boolean;
  is_draw boolean;
  new1    int;
  new2    int;
  over    boolean;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF caller <> m.player1_id AND caller <> m.player2_id THEN
    RAISE EXCEPTION 'not a participant';
  END IF;

  needed := ceil(GREATEST(m.best_of, 1) / 2.0);

  IF NOT (m.p1_finished_round AND m.p2_finished_round) THEN
    RETURN jsonb_build_object(
      'finalized',     false,
      'p1_rounds_won', m.p1_rounds_won,
      'p2_rounds_won', m.p2_rounds_won,
      'p1_total_score', m.p1_total_score,
      'p2_total_score', m.p2_total_score,
      'current_round', m.current_round,
      'status',        m.status,
      'match_over',    m.status = 'completed'
    );
  END IF;

  p1_win  := m.p1_current_score > m.p2_current_score;
  is_draw := m.p1_current_score = m.p2_current_score;
  new1    := m.p1_rounds_won + CASE WHEN p1_win THEN 1 ELSE 0 END;
  new2    := m.p2_rounds_won + CASE WHEN (NOT p1_win AND NOT is_draw) THEN 1 ELSE 0 END;
  -- Complete when a player reaches the needed wins, OR every round was played
  -- (the latter resolves draw-stalls; the points tiebreaker decides the winner).
  over    := new1 >= needed OR new2 >= needed OR m.current_round >= GREATEST(m.best_of, 1);

  UPDATE public.matches SET
    p1_rounds_won     = new1,
    p2_rounds_won     = new2,
    p1_total_score    = m.p1_total_score + m.p1_current_score,
    p2_total_score    = m.p2_total_score + m.p2_current_score,
    current_round     = m.current_round + 1,
    p1_current_score  = 0,
    p2_current_score  = 0,
    p1_finished_round = false,
    p2_finished_round = false,
    status            = CASE WHEN over THEN 'completed' ELSE 'in_progress' END,
    updated_at        = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'finalized',      true,
    'p1_rounds_won',  new1,
    'p2_rounds_won',  new2,
    'p1_total_score', m.p1_total_score + m.p1_current_score,
    'p2_total_score', m.p2_total_score + m.p2_current_score,
    'current_round',  m.current_round + 1,
    'status',         CASE WHEN over THEN 'completed' ELSE 'in_progress' END,
    'match_over',     over
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_round(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finalize_round(uuid) TO authenticated;

-- ── apply_ranked_result: winner = rounds_won, tiebreak by cumulative points ──
-- Replaces economy.sql version. Adds the points tiebreaker and a true-draw path
-- (equal rounds AND equal total points → ELO drawn at s=0.5, no win/loss, both
-- get the loss coin reward). Series is considered finished once status is
-- 'completed' (set by finalize_round) or someone reached the needed wins.
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
  is_draw        boolean;
  caller_is_p1   boolean;
  caller_coins   int;
  caller_outcome text;
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
  IF m.status <> 'completed'
     AND m.p1_rounds_won < needed AND m.p2_rounds_won < needed THEN
    RAISE EXCEPTION 'series not finished';
  END IF;

  caller_is_p1 := (caller = m.player1_id);

  IF m.rating_applied THEN
    SELECT elo INTO new1 FROM public.player_ratings
      WHERE user_id = CASE WHEN caller_is_p1 THEN m.player1_id ELSE m.player2_id END;
    RETURN jsonb_build_object('already_applied', true, 'new_elo', COALESCE(new1, 1000), 'coins_awarded', 0);
  END IF;

  -- Winner = more rounds won; on a rounds tie, more cumulative points; if those
  -- are also equal it's a true draw.
  is_draw := (m.p1_rounds_won = m.p2_rounds_won) AND (m.p1_total_score = m.p2_total_score);
  p1_won  := (m.p1_rounds_won > m.p2_rounds_won)
             OR (m.p1_rounds_won = m.p2_rounds_won AND m.p1_total_score > m.p2_total_score);

  INSERT INTO public.player_ratings (user_id) VALUES (m.player1_id)
    ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.player_ratings (user_id) VALUES (m.player2_id)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT elo INTO p1_elo FROM public.player_ratings WHERE user_id = m.player1_id;
  SELECT elo INTO p2_elo FROM public.player_ratings WHERE user_id = m.player2_id;

  exp1 := 1.0 / (1.0 + power(10.0, (p2_elo - p1_elo) / 400.0));
  s1   := CASE WHEN is_draw THEN 0.5 WHEN p1_won THEN 1 ELSE 0 END;
  -- Each player uses the gain/loss K of their own tier (a draw counts as the
  -- "win" K side for both — small symmetric adjustment toward expected).
  d1   := round(public.elo_k_factor(p1_elo, p1_won OR is_draw)     * (s1 - exp1));
  d2   := round(public.elo_k_factor(p2_elo, (NOT p1_won) OR is_draw) * ((1 - s1) - (1 - exp1)));
  new1 := greatest(0, p1_elo + d1);
  new2 := greatest(0, p2_elo + d2);

  UPDATE public.player_ratings
    SET elo = new1,
        wins = wins + CASE WHEN (NOT is_draw AND p1_won) THEN 1 ELSE 0 END,
        losses = losses + CASE WHEN (NOT is_draw AND NOT p1_won) THEN 1 ELSE 0 END,
        updated_at = now()
    WHERE user_id = m.player1_id;

  UPDATE public.player_ratings
    SET elo = new2,
        wins = wins + CASE WHEN (NOT is_draw AND NOT p1_won) THEN 1 ELSE 0 END,
        losses = losses + CASE WHEN (NOT is_draw AND p1_won) THEN 1 ELSE 0 END,
        updated_at = now()
    WHERE user_id = m.player2_id;

  -- Coins: winner win_reward, loser loss_reward; on a draw both get loss_reward.
  INSERT INTO public.coin_wallets (user_id) VALUES (m.player1_id) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.coin_wallets (user_id) VALUES (m.player2_id) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.coin_wallets
    SET balance = balance + CASE WHEN (NOT is_draw AND p1_won) THEN win_reward ELSE loss_reward END, updated_at = now()
    WHERE user_id = m.player1_id;
  UPDATE public.coin_wallets
    SET balance = balance + CASE WHEN (NOT is_draw AND NOT p1_won) THEN win_reward ELSE loss_reward END, updated_at = now()
    WHERE user_id = m.player2_id;

  UPDATE public.matches SET rating_applied = true, coins_awarded = true, status = 'completed'
    WHERE id = p_match_id;

  caller_coins := CASE
    WHEN is_draw THEN loss_reward
    WHEN (caller_is_p1 AND p1_won) OR (NOT caller_is_p1 AND NOT p1_won) THEN win_reward
    ELSE loss_reward END;
  caller_outcome := CASE
    WHEN is_draw THEN 'draw'
    WHEN (caller_is_p1 AND p1_won) OR (NOT caller_is_p1 AND NOT p1_won) THEN 'win'
    ELSE 'loss' END;

  RETURN jsonb_build_object(
    'already_applied', false,
    'old_elo', CASE WHEN caller_is_p1 THEN p1_elo ELSE p2_elo END,
    'new_elo', CASE WHEN caller_is_p1 THEN new1 ELSE new2 END,
    'elo_change', CASE WHEN caller_is_p1 THEN d1 ELSE d2 END,
    'won', CASE WHEN is_draw THEN NULL WHEN caller_is_p1 THEN p1_won ELSE NOT p1_won END,
    'draw', is_draw,
    'outcome', caller_outcome,
    'coins_awarded', caller_coins
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_ranked_result(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_ranked_result(uuid) TO authenticated;

-- ── apply_online_result: same points tiebreaker for non-ranked coin awards ───
CREATE OR REPLACE FUNCTION public.apply_online_result(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m            public.matches%ROWTYPE;
  caller       uuid := auth.uid();
  win_reward   constant int := 10;
  loss_reward  constant int := 4;
  needed       int;
  caller_is_p1 boolean;
  p1_won       boolean;
  is_draw      boolean;
  caller_won   boolean;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF caller <> m.player1_id AND caller <> m.player2_id THEN RAISE EXCEPTION 'not a participant'; END IF;
  IF m.is_ranked IS TRUE THEN RAISE EXCEPTION 'ranked uses apply_ranked_result'; END IF;
  IF m.player2_id IS NULL THEN RAISE EXCEPTION 'match has no opponent'; END IF;

  needed := ceil(GREATEST(m.best_of, 1) / 2.0);
  IF m.status <> 'completed'
     AND m.p1_rounds_won < needed AND m.p2_rounds_won < needed THEN
    RAISE EXCEPTION 'series not finished';
  END IF;

  caller_is_p1 := (caller = m.player1_id);
  is_draw := (m.p1_rounds_won = m.p2_rounds_won) AND (m.p1_total_score = m.p2_total_score);
  p1_won  := (m.p1_rounds_won > m.p2_rounds_won)
             OR (m.p1_rounds_won = m.p2_rounds_won AND m.p1_total_score > m.p2_total_score);
  caller_won := (NOT is_draw) AND ((caller_is_p1 AND p1_won) OR (NOT caller_is_p1 AND NOT p1_won));

  IF m.coins_awarded THEN
    RETURN jsonb_build_object('already_awarded', true, 'coins_awarded', 0, 'won', caller_won, 'draw', is_draw);
  END IF;

  INSERT INTO public.coin_wallets (user_id) VALUES (m.player1_id) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.coin_wallets (user_id) VALUES (m.player2_id) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.coin_wallets
    SET balance = balance + CASE WHEN (NOT is_draw AND p1_won) THEN win_reward ELSE loss_reward END, updated_at = now()
    WHERE user_id = m.player1_id;
  UPDATE public.coin_wallets
    SET balance = balance + CASE WHEN (NOT is_draw AND NOT p1_won) THEN win_reward ELSE loss_reward END, updated_at = now()
    WHERE user_id = m.player2_id;

  UPDATE public.matches SET coins_awarded = true WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'already_awarded', false,
    'coins_awarded', CASE WHEN caller_won THEN win_reward ELSE loss_reward END,
    'won', caller_won,
    'draw', is_draw
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_online_result(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_online_result(uuid) TO authenticated;
