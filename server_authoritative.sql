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

-- ── B1 anti-cheat: server-authoritative columns on matches are not client-writable ─
-- apply_ranked_result / apply_online_result trust matches.p1_rounds_won /
-- p2_rounds_won to decide the winner and rating_applied / coins_awarded as
-- idempotency guards. A broad table-level UPDATE grant let any participant
-- inflate the round counts to claim a ranked win, or reset the guards to
-- re-trigger the RPC and farm ELO + coins. The client never writes these
-- columns (join = {player2_id,status}, cancel = {status}, live in-round sync =
-- {current_round, p*_current_score, p*_finished_round}); restrict client UPDATE
-- to exactly that whitelist. The SECURITY DEFINER RPCs run as the table owner
-- and bypass column grants, so server-side writes keep working. Idempotent.
REVOKE UPDATE ON public.matches FROM authenticated, anon;
GRANT UPDATE (
  status,
  player2_id,
  updated_at,
  current_round,
  p1_current_score,
  p2_current_score,
  p1_finished_round,
  p2_finished_round
) ON public.matches TO authenticated;

-- ── B1 follow-up: server-authoritative round finalisation ────────────────────
-- The lockdown above removed the client's ability to write p1_rounds_won /
-- p2_rounds_won, but nothing server-side advanced them — apply_ranked_result /
-- apply_online_result only READ those counts. Net effect: every online/ranked
-- series stayed at rounds_won = 0, so the award RPCs always raised 'series not
-- finished' and no coins / ELO were ever granted. (The host's completion UPDATE
-- now 403s because it touches the de-granted rounds_won columns.)
--
-- finalize_round closes the gap. Once both players have submitted their score
-- for the current round (p*_finished_round = true), it derives the round winner
-- from the per-round scores the clients legitimately write, increments the
-- winner's rounds_won, resets the per-round state, advances current_round, and
-- flips status to 'completed' when a player reaches the required wins. Both
-- clients call it; it is row-locked and idempotent — the first caller clears
-- the finished flags so any later caller no-ops. SECURITY DEFINER, so it writes
-- the locked-down columns the client cannot. Re-runnable.
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

  -- Idempotency guard: only the caller that observes both submissions does the
  -- work and clears the flags; a concurrent / later caller falls through and
  -- just reports the already-advanced state.
  IF NOT (m.p1_finished_round AND m.p2_finished_round) THEN
    RETURN jsonb_build_object(
      'finalized',     false,
      'p1_rounds_won', m.p1_rounds_won,
      'p2_rounds_won', m.p2_rounds_won,
      'current_round', m.current_round,
      'status',        m.status,
      'match_over',    m.status = 'completed'
    );
  END IF;

  p1_win  := m.p1_current_score > m.p2_current_score;
  is_draw := m.p1_current_score = m.p2_current_score;
  new1    := m.p1_rounds_won + CASE WHEN p1_win THEN 1 ELSE 0 END;
  new2    := m.p2_rounds_won + CASE WHEN (NOT p1_win AND NOT is_draw) THEN 1 ELSE 0 END;
  over    := new1 >= needed OR new2 >= needed;

  UPDATE public.matches SET
    p1_rounds_won     = new1,
    p2_rounds_won     = new2,
    current_round     = m.current_round + 1,
    p1_current_score  = 0,
    p2_current_score  = 0,
    p1_finished_round = false,
    p2_finished_round = false,
    status            = CASE WHEN over THEN 'completed' ELSE 'in_progress' END,
    updated_at        = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'finalized',     true,
    'p1_rounds_won', new1,
    'p2_rounds_won', new2,
    'current_round', m.current_round + 1,
    'status',        CASE WHEN over THEN 'completed' ELSE 'in_progress' END,
    'match_over',    over
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_round(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finalize_round(uuid) TO authenticated;
