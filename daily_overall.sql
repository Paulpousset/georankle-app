-- ════════════════════════════════════════════════════════════════════════════
-- Classement général du Défi du Jour : tous les dailies d'une journée UTC
-- combinés, et des pièces pour le podium une fois la journée finie
-- (1er +20, 2e +10, 3e +5).
--
-- Normalisation : daily_results garde le score NATIF de chaque mode (globe
-- jusqu'à 5000, quiz ~25, streak < 10, classic en %), donc une somme brute
-- ferait de Globe Géo le seul mode qui compte. Chaque mode vaut 1000 points
-- au plus : (score / meilleur score du jour dans ce mode) × 1000. Relatif au
-- jour, donc aucun plafond par mode à maintenir quand un mode est ajouté.
-- Égalités : plus de modes joués, puis premier arrivé (created_at n'est pas
-- réécrit par l'upsert de complete_daily), puis user_id pour rester stable.
--
-- Versement : cron pg_cron 00:10 UTC → award_daily_overall_catchup(), qui paie
-- les 3 derniers jours pas encore payés (rattrape un cron manqué). Idempotent :
-- une date déjà présente dans daily_overall_awards n'est jamais repayée.
-- Kill-switch : feature_flags.daily_overall_rewards.
-- Re-runnable : chaque instruction est idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Podiums payés ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.daily_overall_awards (
  puzzle_date date NOT NULL,
  rank        int  NOT NULL CHECK (rank BETWEEN 1 AND 3),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  total       int  NOT NULL,
  coins       int  NOT NULL,
  -- Le gagnant a-t-il vu la notification in-app ? (claim_daily_overall_notices)
  seen        boolean NOT NULL DEFAULT false,
  awarded_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (puzzle_date, rank)
);

CREATE INDEX IF NOT EXISTS daily_overall_awards_user_idx
  ON public.daily_overall_awards (user_id) WHERE NOT seen;

-- Lecture publique (c'est un podium public, comme daily_results) ; écritures
-- uniquement par les fonctions ci-dessous.
ALTER TABLE public.daily_overall_awards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read daily overall awards" ON public.daily_overall_awards;
CREATE POLICY "public read daily overall awards" ON public.daily_overall_awards
  FOR SELECT USING (true);

INSERT INTO public.feature_flags (key, enabled) VALUES ('daily_overall_rewards', true)
  ON CONFLICT (key) DO NOTHING;

-- ── Classement d'une journée (source unique du calcul) ───────────────────────

CREATE OR REPLACE FUNCTION public.daily_overall_standings(p_date date)
RETURNS TABLE (user_id uuid, total int, modes_played int, rank int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH best AS (
    SELECT game_mode, max(score) AS top
      FROM public.daily_results
     WHERE puzzle_date = p_date
     GROUP BY game_mode
  ), pts AS (
    SELECT r.user_id,
           sum(CASE WHEN b.top > 0
                    THEN round(1000.0 * GREATEST(r.score, 0) / b.top)
                    ELSE 0 END)::int AS total,
           count(*)::int             AS modes_played,
           max(r.created_at)         AS last_at
      FROM public.daily_results r
      JOIN best b USING (game_mode)
     WHERE r.puzzle_date = p_date
     GROUP BY r.user_id
  )
  SELECT pts.user_id, pts.total, pts.modes_played,
         (row_number() OVER (ORDER BY pts.total DESC, pts.modes_played DESC,
                                      pts.last_at ASC, pts.user_id))::int
    FROM pts;
$$;

REVOKE ALL ON FUNCTION public.daily_overall_standings(date) FROM public, anon, authenticated;

-- ── Lecture client : top 100 + profil + pièces gagnées ───────────────────────
-- Pièces jointes par user_id (pas par rang) : un résultat hors-ligne rattrapé
-- après le versement (fenêtre -3 j de complete_daily) peut décaler les rangs,
-- le badge reste sur celui qui a été payé.

CREATE OR REPLACE FUNCTION public.daily_overall_leaderboard(p_date date)
RETURNS TABLE (
  user_id       uuid,
  username      text,
  avatar_config jsonb,
  avatar_url    text,
  total         int,
  modes_played  int,
  rank          int,
  coins         int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.user_id, p.username, p.avatar_config, p.avatar_url,
         s.total, s.modes_played, s.rank, a.coins
    FROM public.daily_overall_standings(p_date) s
    JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN public.daily_overall_awards a
      ON a.puzzle_date = p_date AND a.user_id = s.user_id
   ORDER BY s.rank
   LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.daily_overall_leaderboard(date) FROM public;
GRANT EXECUTE ON FUNCTION public.daily_overall_leaderboard(date) TO anon, authenticated;

-- ── Versement du podium d'une journée terminée ──────────────────────────────

CREATE OR REPLACE FUNCTION public.award_daily_overall(p_date date)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prizes constant int[] := ARRAY[20, 10, 5];
  r      record;
  paid   int := 0;
BEGIN
  IF p_date >= (now() AT TIME ZONE 'utc')::date THEN
    RAISE EXCEPTION 'day not over';
  END IF;
  IF NOT COALESCE((SELECT enabled FROM public.feature_flags WHERE key = 'daily_overall_rewards'), false) THEN
    RETURN 0;
  END IF;

  -- Deux exécutions concurrentes (cron + appel manuel) ne paient pas deux fois.
  PERFORM pg_advisory_xact_lock(hashtext('daily_overall:' || p_date::text));
  IF EXISTS (SELECT 1 FROM public.daily_overall_awards WHERE puzzle_date = p_date) THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT s.user_id, s.total, s.rank
      FROM public.daily_overall_standings(p_date) s
     WHERE s.rank <= 3 AND s.total > 0
     ORDER BY s.rank
  LOOP
    INSERT INTO public.daily_overall_awards (puzzle_date, rank, user_id, total, coins)
      VALUES (p_date, r.rank, r.user_id, r.total, prizes[r.rank]);
    INSERT INTO public.coin_wallets (user_id) VALUES (r.user_id) ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.coin_wallets
       SET balance = balance + prizes[r.rank], updated_at = now()
     WHERE user_id = r.user_id;
    paid := paid + 1;
  END LOOP;

  RETURN paid;
END;
$$;

REVOKE ALL ON FUNCTION public.award_daily_overall(date) FROM public, anon, authenticated;

-- Premier jour payé : le jour de la mise en service (pas de rétroactif).
CREATE OR REPLACE FUNCTION public.award_daily_overall_catchup()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  first_day constant date := DATE '2026-09-29';
  today     date := (now() AT TIME ZONE 'utc')::date;
  d         date;
  paid      int := 0;
BEGIN
  FOR d IN SELECT generate_series(GREATEST(today - 3, first_day), today - 1, INTERVAL '1 day')::date LOOP
    paid := paid + public.award_daily_overall(d);
  END LOOP;
  RETURN paid;
END;
$$;

REVOKE ALL ON FUNCTION public.award_daily_overall_catchup() FROM public, anon, authenticated;

-- ── Notification in-app : lit ET marque vus les podiums du joueur ────────────

CREATE OR REPLACE FUNCTION public.claim_daily_overall_notices()
RETURNS TABLE (puzzle_date date, rank int, coins int)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.daily_overall_awards a
     SET seen = true
   WHERE a.user_id = auth.uid() AND NOT a.seen
  RETURNING a.puzzle_date, a.rank, a.coins;
$$;

REVOKE ALL ON FUNCTION public.claim_daily_overall_notices() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_daily_overall_notices() TO authenticated;

-- ── Cron : chaque nuit à 00:10 UTC ───────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('award-daily-overall')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'award-daily-overall');

SELECT cron.schedule(
  'award-daily-overall',
  '10 0 * * *',
  $job$ SELECT public.award_daily_overall_catchup(); $job$
);
