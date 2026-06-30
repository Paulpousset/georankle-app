-- ════════════════════════════════════════════════════════════════════════════
-- Free-for-all online custom matches (2–8 players, each for themselves).
--
-- ADDITIVE to the existing 1v1 model: 1v1 ranked/custom keep using matches.p1/p2
-- columns + finalize_round. FFA matches (matches.max_players > 2) use the new
-- match_players table + the *_ffa RPCs below. A match is identified as FFA by
-- max_players > 2; the host is slot 0.
--
-- Server-authoritative, mirroring server_authoritative.sql / economy.sql:
-- clients only write their OWN match_players score/finished flags; round wins,
-- totals, status transitions and coin awards all go through SECURITY DEFINER
-- RPCs with row locks + idempotency guards. Re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

-- Number of players an FFA match seats (2 keeps the legacy 1v1 shape).
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS max_players int NOT NULL DEFAULT 2
    CHECK (max_players BETWEEN 2 AND 8);

-- ── Per-player state for FFA matches ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.match_players (
  match_id       uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  player_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slot           int  NOT NULL,                 -- 0-based; host is slot 0
  rounds_won     int  NOT NULL DEFAULT 0,       -- server-derived
  total_score    int  NOT NULL DEFAULT 0,       -- server-derived (tiebreak)
  current_score  int  NOT NULL DEFAULT 0,       -- client writes (this round)
  finished_round boolean NOT NULL DEFAULT false,-- client writes (this round)
  joined_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, slot),
  UNIQUE (match_id, player_id)
);

CREATE INDEX IF NOT EXISTS match_players_match_idx ON public.match_players (match_id);

ALTER TABLE public.match_players ENABLE ROW LEVEL SECURITY;

-- Participants may read every row of a match they're in.
DROP POLICY IF EXISTS "read match players" ON public.match_players;
CREATE POLICY "read match players" ON public.match_players
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.match_players mp
      WHERE mp.match_id = match_players.match_id AND mp.player_id = (select auth.uid())
    )
  );

-- A player may update only their OWN row (and only the score/finished columns via
-- the grant below). rounds_won / total_score / slot are server-derived.
DROP POLICY IF EXISTS "update own match player" ON public.match_players;
CREATE POLICY "update own match player" ON public.match_players
  FOR UPDATE USING (player_id = (select auth.uid()))
  WITH CHECK (player_id = (select auth.uid()));

REVOKE UPDATE ON public.match_players FROM authenticated, anon;
GRANT UPDATE (current_score, finished_round) ON public.match_players TO authenticated;
REVOKE INSERT, DELETE ON public.match_players FROM authenticated, anon; -- joins go through the RPC

-- ── Join an FFA match: atomic slot assignment, flips to in_progress when full ──
CREATE OR REPLACE FUNCTION public.join_ffa_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m         public.matches%ROWTYPE;
  caller    uuid := auth.uid();
  n_joined  int;
  my_slot   int;
  started   boolean := false;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF m.max_players < 3 THEN RAISE EXCEPTION 'not an ffa match'; END IF;

  -- Already in? Return current slot (idempotent rejoin).
  SELECT slot INTO my_slot FROM public.match_players
    WHERE match_id = p_match_id AND player_id = caller;
  IF FOUND THEN
    SELECT count(*) INTO n_joined FROM public.match_players WHERE match_id = p_match_id;
    RETURN jsonb_build_object('slot', my_slot, 'players', n_joined,
      'started', m.status = 'in_progress', 'rejoined', true);
  END IF;

  IF m.status <> 'waiting' THEN RAISE EXCEPTION 'match not open'; END IF;

  SELECT count(*) INTO n_joined FROM public.match_players WHERE match_id = p_match_id;
  IF n_joined >= m.max_players THEN RAISE EXCEPTION 'match full'; END IF;

  my_slot := n_joined; -- next free slot (host took 0 at creation)
  INSERT INTO public.match_players (match_id, player_id, slot)
    VALUES (p_match_id, caller, my_slot);
  n_joined := n_joined + 1;

  IF n_joined >= m.max_players THEN
    UPDATE public.matches SET status = 'in_progress', updated_at = now()
      WHERE id = p_match_id;
    started := true;
  END IF;

  RETURN jsonb_build_object('slot', my_slot, 'players', n_joined,
    'started', started, 'rejoined', false);
END;
$$;

REVOKE ALL ON FUNCTION public.join_ffa_match(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.join_ffa_match(uuid) TO authenticated;

-- ── Seat the host (slot 0) when the FFA match is created ──────────────────────
CREATE OR REPLACE FUNCTION public.host_ffa_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m      public.matches%ROWTYPE;
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF caller <> m.player1_id THEN RAISE EXCEPTION 'not the host'; END IF;
  INSERT INTO public.match_players (match_id, player_id, slot)
    VALUES (p_match_id, caller, 0)
    ON CONFLICT (match_id, player_id) DO NOTHING;
  RETURN jsonb_build_object('slot', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.host_ffa_match(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.host_ffa_match(uuid) TO authenticated;

-- ── Resolve a round: top scorer(s) win it, totals accrue, advance/complete ────
CREATE OR REPLACE FUNCTION public.finalize_round_ffa(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m         public.matches%ROWTYPE;
  caller    uuid := auth.uid();
  n_joined  int;
  n_done    int;
  top       int;
  over      boolean;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.match_players
                 WHERE match_id = p_match_id AND player_id = caller) THEN
    RAISE EXCEPTION 'not a participant';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE finished_round)
    INTO n_joined, n_done
    FROM public.match_players WHERE match_id = p_match_id;

  -- Idempotency: only the caller that sees everyone finished does the work and
  -- clears the flags; later callers fall through to the already-advanced state.
  IF n_joined = 0 OR n_done < n_joined THEN
    RETURN jsonb_build_object('finalized', false,
      'current_round', m.current_round, 'status', m.status,
      'match_over', m.status = 'completed');
  END IF;

  SELECT max(current_score) INTO top FROM public.match_players WHERE match_id = p_match_id;

  UPDATE public.match_players SET
    total_score   = total_score + current_score,
    rounds_won    = rounds_won + CASE WHEN current_score = top THEN 1 ELSE 0 END,
    current_score = 0,
    finished_round = false
  WHERE match_id = p_match_id;

  over := m.current_round >= GREATEST(m.best_of, 1);

  UPDATE public.matches SET
    current_round = m.current_round + 1,
    status        = CASE WHEN over THEN 'completed' ELSE 'in_progress' END,
    updated_at    = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('finalized', true,
    'current_round', m.current_round + 1,
    'status', CASE WHEN over THEN 'completed' ELSE 'in_progress' END,
    'match_over', over);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_round_ffa(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finalize_round_ffa(uuid) TO authenticated;

-- ── Award placement coins once the FFA series completes (idempotent) ──────────
CREATE OR REPLACE FUNCTION public.apply_ffa_result(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m           public.matches%ROWTYPE;
  caller      uuid := auth.uid();
  first_coins constant int := 12;
  other_coins constant int := 5;
  caller_rank int;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF m.max_players < 3 THEN RAISE EXCEPTION 'not an ffa match'; END IF;
  IF m.status <> 'completed' THEN RAISE EXCEPTION 'series not finished'; END IF;

  IF m.coins_awarded THEN
    SELECT rnk INTO caller_rank FROM (
      SELECT player_id,
             rank() OVER (ORDER BY rounds_won DESC, total_score DESC) AS rnk
      FROM public.match_players WHERE match_id = p_match_id
    ) r WHERE player_id = caller;
    RETURN jsonb_build_object('already_awarded', true, 'place', caller_rank, 'coins_awarded', 0);
  END IF;

  -- Ensure wallets, then credit by placement (1st place → first_coins, rest → other_coins).
  INSERT INTO public.coin_wallets (user_id)
    SELECT player_id FROM public.match_players WHERE match_id = p_match_id
    ON CONFLICT (user_id) DO NOTHING;

  WITH ranked AS (
    SELECT player_id,
           rank() OVER (ORDER BY rounds_won DESC, total_score DESC) AS rnk
    FROM public.match_players WHERE match_id = p_match_id
  )
  UPDATE public.coin_wallets w
    SET balance = balance + CASE WHEN r.rnk = 1 THEN first_coins ELSE other_coins END,
        updated_at = now()
    FROM ranked r WHERE w.user_id = r.player_id;

  UPDATE public.matches SET coins_awarded = true WHERE id = p_match_id;

  SELECT rnk INTO caller_rank FROM (
    SELECT player_id,
           rank() OVER (ORDER BY rounds_won DESC, total_score DESC) AS rnk
    FROM public.match_players WHERE match_id = p_match_id
  ) r WHERE player_id = caller;

  RETURN jsonb_build_object('already_awarded', false, 'place', caller_rank,
    'coins_awarded', CASE WHEN caller_rank = 1 THEN first_coins ELSE other_coins END);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_ffa_result(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_ffa_result(uuid) TO authenticated;
