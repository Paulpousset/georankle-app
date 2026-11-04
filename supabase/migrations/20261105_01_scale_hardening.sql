-- Montée en charge : ce qui devenait lent puis FAUX avec plus de joueurs.
--
-- PostgREST coupe toute réponse au réglage « Max rows » (1000 par défaut),
-- sans erreur. Plusieurs écrans et la fonction de notifications lisaient des
-- tables entières pour agréger côté client : au-delà de 1000 lignes, le
-- résultat était silencieusement tronqué. Tout ce qui agrège passe ici en SQL.
--
--   1) best_scores        meilleur score par (joueur, mode), tenu à jour par
--                         trigger ; le classement solo lit 1 ligne par joueur
--   2) online_mode_leaderboard / online_mode_stats
--                         victoires/parties en ligne agrégées côté base
--   3) broadcast_recipients_*  segments de notifications (service_role seul)
--   4) index du lobby et des matchs terminés
--   5) pg_cron : annule les matchs « waiting » abandonnés (> 2 h)
--
-- Appliquée dans une transaction par scripts/migrate.sh : pas de CREATE INDEX
-- CONCURRENTLY possible. Les tables concernées sont encore petites, le verrou
-- d'écriture pendant la création des index dure quelques secondes au plus.
-- Re-jouable.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) best_scores ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.best_scores (
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_mode  text NOT NULL,
  score      numeric NOT NULL,  -- même valeur que scores.score, quel que soit son type
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_mode)
);

CREATE INDEX IF NOT EXISTS best_scores_leaderboard_idx
  ON public.best_scores (game_mode, score DESC);

ALTER TABLE public.best_scores ENABLE ROW LEVEL SECURITY;

-- Lecture publique, comme public.scores. Aucune écriture client : seul le
-- trigger (SECURITY DEFINER) écrit.
DROP POLICY IF EXISTS "Best scores are viewable by everyone" ON public.best_scores;
CREATE POLICY "Best scores are viewable by everyone"
  ON public.best_scores FOR SELECT TO anon, authenticated USING (true);

REVOKE ALL ON public.best_scores FROM anon, authenticated;
GRANT SELECT ON public.best_scores TO anon, authenticated;

-- Classique : les anciennes lignes stockaient des points bruts (> 100) avant
-- le passage en efficacité (0–100) ; le client les ignorait déjà, on fait pareil.
CREATE OR REPLACE FUNCTION public.scores_keep_best()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.game_mode = 'classic' AND NEW.score > 100 THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.best_scores AS b (user_id, game_mode, score, updated_at)
  VALUES (NEW.user_id, NEW.game_mode, NEW.score, now())
  ON CONFLICT (user_id, game_mode) DO UPDATE
    SET score = EXCLUDED.score, updated_at = now()
    WHERE EXCLUDED.score > b.score;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.scores_keep_best() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS scores_keep_best ON public.scores;
CREATE TRIGGER scores_keep_best
  AFTER INSERT ON public.scores
  FOR EACH ROW EXECUTE FUNCTION public.scores_keep_best();

-- Reprise de l'historique (le trigger couvre tout ce qui arrive ensuite).
INSERT INTO public.best_scores (user_id, game_mode, score)
SELECT s.user_id, s.game_mode, max(s.score)
  FROM public.scores s
  JOIN public.profiles p ON p.id = s.user_id
 WHERE NOT (s.game_mode = 'classic' AND s.score > 100)
 GROUP BY s.user_id, s.game_mode
ON CONFLICT (user_id, game_mode) DO UPDATE
  SET score = GREATEST(public.best_scores.score, EXCLUDED.score);

-- ── 2) Classements et stats en ligne ────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_matches_completed_mode
  ON public.matches (game_mode)
  WHERE status = 'completed';

-- Taux de victoire par joueur sur un mode (matchs 1v1 terminés). Même règle
-- que l'ancien calcul client : victoire = plus de manches gagnées, une égalité
-- compte comme partie jouée sans victoire. Tri : taux arrondi puis victoires.
CREATE OR REPLACE FUNCTION public.online_mode_leaderboard(p_mode text, p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id       uuid,
  username      text,
  avatar_config jsonb,
  wins          int,
  total         int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH sides AS (
    SELECT m.player1_id AS uid,
           (coalesce(m.p1_rounds_won, 0) > coalesce(m.p2_rounds_won, 0))::int AS won
      FROM public.matches m
     WHERE m.game_mode = p_mode AND m.status = 'completed'
       AND m.player1_id IS NOT NULL AND m.player2_id IS NOT NULL
    UNION ALL
    SELECT m.player2_id,
           (coalesce(m.p2_rounds_won, 0) > coalesce(m.p1_rounds_won, 0))::int
      FROM public.matches m
     WHERE m.game_mode = p_mode AND m.status = 'completed'
       AND m.player1_id IS NOT NULL AND m.player2_id IS NOT NULL
  ), agg AS (
    SELECT uid, sum(won)::int AS wins, count(*)::int AS total
      FROM sides GROUP BY uid
  )
  SELECT a.uid, p.username, p.avatar_config::jsonb, a.wins, a.total
    FROM agg a
    LEFT JOIN public.profiles p ON p.id = a.uid
   ORDER BY round(a.wins * 100.0 / a.total) DESC, a.wins DESC
   LIMIT least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

REVOKE ALL ON FUNCTION public.online_mode_leaderboard(text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.online_mode_leaderboard(text, int) TO anon, authenticated;

-- Victoires / parties par mode pour un joueur (profil, écran de recherche).
CREATE OR REPLACE FUNCTION public.online_mode_stats(p_user_id uuid)
RETURNS TABLE (
  game_mode text,
  wins      int,
  total     int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.game_mode,
         count(*) FILTER (WHERE
           CASE WHEN m.player1_id = p_user_id
                THEN coalesce(m.p1_rounds_won, 0) > coalesce(m.p2_rounds_won, 0)
                ELSE coalesce(m.p2_rounds_won, 0) > coalesce(m.p1_rounds_won, 0)
           END)::int,
         count(*)::int
    FROM public.matches m
   WHERE (m.player1_id = p_user_id OR m.player2_id = p_user_id)
     AND m.status = 'completed'
   GROUP BY m.game_mode;
$$;

REVOKE ALL ON FUNCTION public.online_mode_stats(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.online_mode_stats(uuid) TO anon, authenticated;

-- ── 3) Segments de notifications (Edge Functions, service_role) ─────────────
-- Paginées côté fonction avec .order('id').range(...).

CREATE OR REPLACE FUNCTION public.broadcast_recipients_played_mode(p_mode text)
RETURNS TABLE (id uuid, push_token text, push_lang text, daily_streak int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.push_token, p.push_lang, p.daily_streak
    FROM public.profiles p
   WHERE p.push_token IS NOT NULL
     AND (
       EXISTS (SELECT 1 FROM public.scores s WHERE s.user_id = p.id AND s.game_mode = p_mode)
       OR EXISTS (SELECT 1 FROM public.daily_results d WHERE d.user_id = p.id AND d.game_mode = p_mode)
       OR EXISTS (SELECT 1 FROM public.matches m
                   WHERE m.game_mode = p_mode AND (m.player1_id = p.id OR m.player2_id = p.id))
     );
$$;

CREATE OR REPLACE FUNCTION public.broadcast_recipients_never_online()
RETURNS TABLE (id uuid, push_token text, push_lang text, daily_streak int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.push_token, p.push_lang, p.daily_streak
    FROM public.profiles p
   WHERE p.push_token IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.player1_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.player2_id = p.id);
$$;

REVOKE ALL ON FUNCTION public.broadcast_recipients_played_mode(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.broadcast_recipients_never_online() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_recipients_played_mode(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.broadcast_recipients_never_online() TO service_role;

-- ── 4) Lobby ────────────────────────────────────────────────────────────────
-- Listes de parties publiques (Matchmaking, CustomMatchmaking,
-- ChallengeMatchmaking) : mode + waiting + plus récentes d'abord.

CREATE INDEX IF NOT EXISTS idx_matches_lobby
  ON public.matches (game_mode, created_at DESC)
  WHERE status = 'waiting';

-- ── 5) Ménage des matchs abandonnés ─────────────────────────────────────────
-- Le client annule son attente en quittant l'écran, mais pas quand l'app est
-- tuée : ces lignes restaient « waiting » pour toujours, polluaient les lobbies
-- et faisaient réapparaître de vieilles invitations à chaque connexion.

CREATE OR REPLACE FUNCTION public.cancel_stale_waiting_matches()
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH done AS (
    UPDATE public.matches
       SET status = 'cancelled'
     WHERE status = 'waiting'
       AND coalesce(updated_at, created_at) < now() - interval '2 hours'
    RETURNING 1
  )
  SELECT count(*)::int FROM done;
$$;

REVOKE ALL ON FUNCTION public.cancel_stale_waiting_matches() FROM public, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('cancel-stale-waiting-matches')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cancel-stale-waiting-matches');
END $$;

SELECT cron.schedule(
  'cancel-stale-waiting-matches',
  '*/15 * * * *',
  $job$ SELECT public.cancel_stale_waiting_matches(); $job$
);
