-- ════════════════════════════════════════════════════════════════════════════
-- CRITICAL FIX — infinite recursion in the match_players SELECT policy.
--
-- The original policy (multiplayer_ffa.sql) queried match_players from inside
-- its OWN USING clause. Evaluating the policy re-applied the policy → infinite
-- recursion, so EVERY client read/write of match_players failed with
-- "infinite recursion detected in policy for relation match_players".
--
-- Effect in the app: refetchPlayers() and submitScore() both hit match_players
-- directly → the FFA lobby never synced its player list and rounds never
-- advanced. This is the dominant cause of the ">2 players" breakage (the
-- server-side *_ffa RPCs are SECURITY DEFINER so they bypassed RLS and appeared
-- to work, masking the client-side failure).
--
-- Fix: a SECURITY DEFINER helper checks match membership WITHOUT re-applying
-- RLS, so the policy no longer references match_players under RLS. Re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_match_participant(p_match_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.match_players
    WHERE match_id = p_match_id AND player_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_match_participant(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_match_participant(uuid) TO authenticated;

DROP POLICY IF EXISTS "read match players" ON public.match_players;
CREATE POLICY "read match players" ON public.match_players
  FOR SELECT USING (
    player_id = (select auth.uid())            -- always see your own row (cheap)
    OR public.is_match_participant(match_id)   -- or any row of a match you're in
  );
