-- ════════════════════════════════════════════════════════════════════════════
-- Match reconnection + forfeit window.
--
-- Lets a player rejoin an in-progress match after a disconnect / backing out to
-- the menu (the client remembers the match id locally — src/lib/activeMatch.ts),
-- and lets the player who stayed claim the win once the absent player has been
-- inactive past a grace window.
--
-- `last_activity_at` is bumped by the round-finalisation RPCs (clients also touch
-- it on score sync). A present player calls forfeit_match once it has gone stale.
-- Re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();

-- Let clients keep the activity clock fresh while they're in the match. This is
-- the only server-authoritative column we deliberately allow clients to bump, and
-- only to now() via this helper (not a raw UPDATE grant).
CREATE OR REPLACE FUNCTION public.touch_match(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.matches
    SET last_activity_at = now()
    WHERE id = p_match_id
      AND status = 'in_progress'
      AND (player1_id = caller OR player2_id = caller
           OR EXISTS (SELECT 1 FROM public.match_players mp
                      WHERE mp.match_id = id AND mp.player_id = caller));
END;
$$;

REVOKE ALL ON FUNCTION public.touch_match(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.touch_match(uuid) TO authenticated;

-- ── Forfeit: the present player wins once the match has been idle past the window
-- The grace window guards against a player force-quitting to deny the opponent a
-- result: forfeit only succeeds after `p_window_seconds` (default 120s) of no
-- activity, by which point a connected player would have bumped last_activity_at.
-- 1v1: the caller's rounds_won is set to the win target and status → completed so
-- the normal apply_*_result RPC grants the result. FFA: the match is simply
-- closed (standings already reflect rounds played).
CREATE OR REPLACE FUNCTION public.forfeit_match(p_match_id uuid, p_window_seconds int DEFAULT 120)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m       public.matches%ROWTYPE;
  caller  uuid := auth.uid();
  needed  int;
  is_ffa  boolean;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;

  is_ffa := m.max_players > 2;

  IF NOT (m.player1_id = caller OR m.player2_id = caller
          OR EXISTS (SELECT 1 FROM public.match_players mp
                     WHERE mp.match_id = p_match_id AND mp.player_id = caller)) THEN
    RAISE EXCEPTION 'not a participant';
  END IF;

  IF m.status <> 'in_progress' THEN
    RETURN jsonb_build_object('forfeited', false, 'reason', 'not in progress', 'status', m.status);
  END IF;

  IF now() - m.last_activity_at < make_interval(secs => greatest(p_window_seconds, 30)) THEN
    RETURN jsonb_build_object('forfeited', false, 'reason', 'still active');
  END IF;

  IF is_ffa THEN
    UPDATE public.matches SET status = 'completed', updated_at = now() WHERE id = p_match_id;
    RETURN jsonb_build_object('forfeited', true, 'ffa', true, 'status', 'completed');
  END IF;

  -- 1v1: award the series to the caller.
  needed := ceil(GREATEST(m.best_of, 1) / 2.0);
  IF caller = m.player1_id THEN
    UPDATE public.matches SET p1_rounds_won = needed, status = 'completed', updated_at = now()
      WHERE id = p_match_id;
  ELSE
    UPDATE public.matches SET p2_rounds_won = needed, status = 'completed', updated_at = now()
      WHERE id = p_match_id;
  END IF;

  RETURN jsonb_build_object('forfeited', true, 'ffa', false, 'status', 'completed', 'winner', caller);
END;
$$;

REVOKE ALL ON FUNCTION public.forfeit_match(uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.forfeit_match(uuid, int) TO authenticated;

-- Bump last_activity_at from the existing finalisation RPCs so the clock tracks
-- real progress. (CREATE OR REPLACE in server_authoritative.sql / multiplayer_ffa.sql
-- already SET updated_at; the next deploy of those files can also set
-- last_activity_at = now() in the same UPDATE. Until then, touch_match covers it.)
