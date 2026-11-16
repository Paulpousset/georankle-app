-- « L'Impossible du jour » : une question très dure par mode, chaque jour UTC,
-- la même pour tout le monde (générée par le client à partir d'une graine
-- date + mode, comme le défi du jour), avec un classement de la journée.
--
-- Une seule tentative par (joueur, jour, mode) : l'insert ne remplace jamais
-- une réponse déjà envoyée (ON CONFLICT DO NOTHING), donc rejouer ne sert à
-- rien. Écritures RPC uniquement ; la table n'est pas lisible directement, le
-- classement et les taux de réussite passent par des fonctions agrégées.
-- Re-jouable.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.impossible_results (
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  puzzle_date date NOT NULL,
  game_mode   text NOT NULL,
  correct     boolean NOT NULL,
  answer_ms   int  NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, puzzle_date, game_mode)
);

CREATE INDEX IF NOT EXISTS impossible_results_day_idx
  ON public.impossible_results (puzzle_date, game_mode);

ALTER TABLE public.impossible_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own impossible results" ON public.impossible_results;
CREATE POLICY "read own impossible results" ON public.impossible_results
  FOR SELECT USING (auth.uid() = user_id);

-- ── submit_impossible : enregistre la réponse (une seule fois) ───────────────
-- Renvoie le taux de réussite du jour pour ce mode (« seuls 4 % ont trouvé »).
-- Une bonne réponse rapporte 10 pièces, un sans-faute sur les 6 modes 50 de
-- plus, versés une seule fois puisque l'insert ne passe qu'une fois.
CREATE OR REPLACE FUNCTION public.submit_impossible(
  p_date    date,
  p_mode    text,
  p_correct boolean,
  p_ms      int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid      uuid := auth.uid();
  inserted int;
  players  int;
  winners  int;
  perfect  int;
  bonus    int := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_mode NOT IN ('quiz-flag','quiz-capital','silhouette','higherlower','borders','classic') THEN
    RAISE EXCEPTION 'bad game mode';
  END IF;
  -- Le jour en cours (ou la veille, pour une synchro hors ligne tardive).
  IF p_date NOT IN (current_date, current_date - 1) THEN
    RAISE EXCEPTION 'bad date';
  END IF;

  INSERT INTO public.impossible_results (user_id, puzzle_date, game_mode, correct, answer_ms)
    VALUES (uid, p_date, p_mode, p_correct, LEAST(GREATEST(COALESCE(p_ms, 0), 0), 600000))
    ON CONFLICT (user_id, puzzle_date, game_mode) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;

  IF inserted = 1 AND p_correct THEN
    bonus := 10;
    SELECT count(*) INTO perfect FROM public.impossible_results
      WHERE user_id = uid AND puzzle_date = p_date AND correct;
    IF perfect = 6 THEN bonus := bonus + 50; END IF;
    INSERT INTO public.coin_wallets (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.coin_wallets
      SET balance = balance + bonus, updated_at = now()
      WHERE user_id = uid;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE correct)
    INTO players, winners
    FROM public.impossible_results
    WHERE puzzle_date = p_date AND game_mode = p_mode;

  RETURN jsonb_build_object(
    'recorded', inserted = 1,
    'players',  players,
    'winners',  winners,
    'coins',    bonus
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_impossible(date, text, boolean, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_impossible(date, text, boolean, int) TO authenticated;

-- ── impossible_leaderboard : classement du jour ──────────────────────────────
-- Bonnes réponses d'abord, puis temps cumulé des bonnes réponses.
CREATE OR REPLACE FUNCTION public.impossible_leaderboard(p_date date, p_limit int DEFAULT 50)
RETURNS TABLE (
  user_id       uuid,
  username      text,
  avatar_config jsonb,
  correct       int,
  answered      int,
  total_ms      int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.user_id,
         p.username,
         p.avatar_config::jsonb,
         count(*) FILTER (WHERE r.correct)::int                      AS correct,
         count(*)::int                                                AS answered,
         COALESCE(sum(r.answer_ms) FILTER (WHERE r.correct), 0)::int  AS total_ms
    FROM public.impossible_results r
    JOIN public.profiles p ON p.id = r.user_id
   WHERE r.puzzle_date = p_date
   GROUP BY r.user_id, p.username, p.avatar_config
   ORDER BY correct DESC, total_ms ASC, min(r.created_at) ASC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

GRANT EXECUTE ON FUNCTION public.impossible_leaderboard(date, int) TO anon, authenticated;

-- ── impossible_day_stats : taux de réussite par mode (bulle + écran) ─────────
CREATE OR REPLACE FUNCTION public.impossible_day_stats(p_date date)
RETURNS TABLE (game_mode text, players int, winners int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT game_mode, count(*)::int, count(*) FILTER (WHERE correct)::int
    FROM public.impossible_results
   WHERE puzzle_date = p_date
   GROUP BY game_mode;
$$;

GRANT EXECUTE ON FUNCTION public.impossible_day_stats(date) TO anon, authenticated;
