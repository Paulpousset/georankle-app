-- « Partage équitable » (split) partout : quotidien, classé, partie perso en
-- ligne, FFA, défier un ami, parcours local, histoire (en plus du solo de
-- 20261025_01_split_mode.sql). (Pas dans la ligue : son tirage est figé par
-- versions datées.)
--
-- Deux bras, sur le modèle de 20261024_02_scale_mode.sql (dernière définition
-- appliquée de chacune de ces fonctions), 'split' ajouté :
--   1) matches.game_mode   + 'split' dans le CHECK (en ligne, classé, FFA)
--   2) complete_daily      + 'split' dans la whitelist
-- award_solo_coins connaît déjà 'split' (20261025_01_split_mode.sql).
--
-- ⚠️ Un client à jour contre un serveur non migré lève « bad game mode »
-- (P0001) et la file de synchro DROP l'opération : appliquée par migrate.yml à
-- la fusion sur master, AVANT de livrer le client.
-- Re-jouable.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_game_mode_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_game_mode_check
  CHECK (game_mode = ANY (ARRAY[
    'classic'::text,
    'streak'::text,
    'versus'::text,
    'globe'::text,
    'guess'::text,
    'regions'::text,
    'challenge'::text,
    'higherlower'::text,
    'silhouette'::text,
    'pinpoint'::text,
    'borders'::text,
    'languages'::text,
    'scale'::text,
    'split'::text
  ]));

-- ── 2) Quotidien : whitelist des modes ──────────────────────────────────────
-- Corps autoritatif : daily.sql (garder les deux en phase) ; seule la liste de
-- la ligne NOT IN change par rapport à 20261024_02_scale_mode.sql.
CREATE OR REPLACE FUNCTION public.complete_daily(
  p_date  date,
  p_mode  text,
  p_score int,
  p_grid  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid         uuid := auth.uid();
  last_date   date;
  cur_streak  int;
  best_streak int;
  new_streak  int;
  cnt         int;
  bonus       int := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_mode NOT IN ('classic','streak','guess','globe','regions','quiz-capital','quiz-flag','higherlower','silhouette','borders','languages','challenge','pinpoint','scale','split') THEN
    RAISE EXCEPTION 'bad game mode';
  END IF;

  -- Upsert the result, keeping the best score for the day/mode.
  INSERT INTO public.daily_results (user_id, puzzle_date, game_mode, score, share_grid)
    VALUES (uid, p_date, p_mode, p_score, p_grid)
    ON CONFLICT (user_id, puzzle_date, game_mode) DO UPDATE
      SET score      = GREATEST(daily_results.score, EXCLUDED.score),
          share_grid = EXCLUDED.share_grid;

  -- Lock the profile row to advance the streak atomically.
  SELECT daily_last_date, daily_streak, daily_best_streak
    INTO last_date, cur_streak, best_streak
    FROM public.profiles WHERE id = uid FOR UPDATE;

  cur_streak  := COALESCE(cur_streak, 0);
  best_streak := COALESCE(best_streak, 0);

  IF last_date = p_date THEN
    new_streak := cur_streak;            -- already counted today
  ELSIF last_date = p_date - 1 THEN
    new_streak := cur_streak + 1;
  ELSE
    new_streak := 1;
  END IF;

  -- Milestone bonus, only on the completion that advanced the streak today.
  IF last_date IS DISTINCT FROM p_date THEN
    IF new_streak % 30 = 0 THEN
      bonus := 100;
    ELSIF new_streak % 7 = 0 THEN
      bonus := 20;
    END IF;
  END IF;

  UPDATE public.profiles
    SET daily_streak      = new_streak,
        daily_best_streak = GREATEST(best_streak, new_streak),
        daily_last_date   = p_date
    WHERE id = uid;

  IF bonus > 0 THEN
    INSERT INTO public.coin_wallets (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.coin_wallets
      SET balance = balance + bonus, updated_at = now()
      WHERE user_id = uid;
  END IF;

  SELECT count(*) INTO cnt FROM public.daily_results
    WHERE user_id = uid AND puzzle_date = p_date;

  RETURN jsonb_build_object(
    'streak',       new_streak,
    'best_streak',  GREATEST(best_streak, new_streak),
    'today_count',  cnt,
    'streak_bonus', bonus
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_daily(date, text, int, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_daily(date, text, int, text) TO authenticated;
