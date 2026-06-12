-- ════════════════════════════════════════════════════════════════════════════
-- Server-authoritative integrity layer (applied to Supabase project GeoGames).
-- These objects make ranked ELO and account deletion tamper-proof from clients.
-- Re-runnable: every statement is idempotent (CREATE OR REPLACE / IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Idempotency guard for ELO application ────────────────────────────────────
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS rating_applied boolean NOT NULL DEFAULT false;

-- ── Lock down player_ratings: clients READ only; all writes go through the RPC ─
DROP POLICY IF EXISTS "Users can insert own rating" ON public.player_ratings;
DROP POLICY IF EXISTS "Users can update own rating" ON public.player_ratings;
-- "Anyone can view ratings" (SELECT) is intentionally kept.

-- ── Server-authoritative ELO ─────────────────────────────────────────────────
-- Computes ratings for BOTH players from the match's server-tracked round
-- counts, inside a single row-locked, idempotent transaction. The client can
-- no longer set its own ELO; it only triggers this and reads the result.
CREATE OR REPLACE FUNCTION public.apply_ranked_result(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m              public.matches%ROWTYPE;
  caller         uuid := auth.uid();
  k              constant int := 32;
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
    RETURN jsonb_build_object('already_applied', true, 'new_elo', COALESCE(new1, 1000));
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
  d1   := round(k * (s1 - exp1));
  d2   := round(k * ((1 - s1) - (1 - exp1)));
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

  UPDATE public.matches SET rating_applied = true, status = 'completed'
    WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'already_applied', false,
    'old_elo', CASE WHEN caller_is_p1 THEN p1_elo ELSE p2_elo END,
    'new_elo', CASE WHEN caller_is_p1 THEN new1 ELSE new2 END,
    'elo_change', CASE WHEN caller_is_p1 THEN d1 ELSE d2 END,
    'won', CASE WHEN caller_is_p1 THEN p1_won ELSE NOT p1_won END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_ranked_result(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_ranked_result(uuid) TO authenticated;

-- ── Account deletion (App Store Guideline 5.1.1(v)) ──────────────────────────
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  DELETE FROM public.matches        WHERE player1_id = uid OR player2_id = uid;
  DELETE FROM public.friends        WHERE user_id1 = uid OR user_id2 = uid;
  DELETE FROM public.scores         WHERE user_id = uid;
  DELETE FROM public.player_ratings WHERE user_id = uid;
  DELETE FROM public.profiles       WHERE id = uid;
  DELETE FROM auth.users            WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

-- ── Security advisor fixes ───────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, public;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
