-- ════════════════════════════════════════════════════════════════════════════
-- FFA (3–8 player) reliability fixes.
--
-- Two lobby bugs that stranded FFA matches:
--   1. A player who claimed a seat then left the lobby never released it
--      (client DELETE is revoked and there was no leave RPC). Because the match
--      only starts when the seat count exactly reaches max_players, one such
--      ghost seat deadlocked the whole lobby — it could never fill, so nobody
--      ever advanced. `leave_ffa_match` frees the seat (and cancels the match if
--      the host leaves while still forming).
--   2. `join_ffa_match` assigned the new slot from count(*), which collides with
--      an existing slot once there is a gap (e.g. slots {0,2} left after slot 1
--      leaves → count()=2 → PK conflict). Switched to max(slot)+1.
--
-- Additive + re-runnable, same server-authoritative shape as multiplayer_ffa.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Join: gap-safe slot assignment (max(slot)+1 instead of count) ─────────────
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

  -- Next free slot = highest taken + 1 (survives gaps left by a player who left).
  SELECT COALESCE(max(slot), -1) + 1 INTO my_slot
    FROM public.match_players WHERE match_id = p_match_id;
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

-- ── Leave an FFA match while it is still forming (frees the seat) ──────────────
-- Only meaningful in the 'waiting' phase: once the match is in_progress leaving
-- is a forfeit and is handled by touch_match / forfeit_match, not here. If the
-- host leaves the lobby the match is cancelled for everyone.
CREATE OR REPLACE FUNCTION public.leave_ffa_match(p_match_id uuid)
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
  IF NOT FOUND THEN RETURN jsonb_build_object('left', false, 'cancelled', false); END IF;
  IF m.max_players < 3 THEN RAISE EXCEPTION 'not an ffa match'; END IF;

  -- Already started: nothing to release here (forfeit path owns it).
  IF m.status <> 'waiting' THEN
    RETURN jsonb_build_object('left', false, 'cancelled', false, 'status', m.status);
  END IF;

  -- Host bailing out of a forming lobby → cancel it for everyone.
  IF caller = m.player1_id THEN
    UPDATE public.matches SET status = 'cancelled', updated_at = now()
      WHERE id = p_match_id;
    DELETE FROM public.match_players WHERE match_id = p_match_id;
    RETURN jsonb_build_object('left', true, 'cancelled', true);
  END IF;

  DELETE FROM public.match_players
    WHERE match_id = p_match_id AND player_id = caller;
  RETURN jsonb_build_object('left', true, 'cancelled', false);
END;
$$;

REVOKE ALL ON FUNCTION public.leave_ffa_match(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.leave_ffa_match(uuid) TO authenticated;
