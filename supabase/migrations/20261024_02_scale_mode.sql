-- « À l'échelle » (scale) — deux pays côte à côte, le joueur redimensionne
-- celui de droite pour qu'ils soient à la même échelle. Présent sur : solo,
-- quotidien, classé, partie perso en ligne, FFA, parcours local, histoire.
-- (Pas dans la ligue : son tirage est figé par versions datées.)
--
-- Trois bras, sur le modèle de pinpoint_mode.sql (dernière définition
-- appliquée de chacune de ces fonctions), 'scale' ajouté :
--   1) matches.game_mode   + 'scale' dans le CHECK (en ligne, classé, FFA)
--   2) award_solo_coins    + 'scale' dans la whitelist
--   3) complete_daily      + 'scale' dans la whitelist
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
    'scale'::text
  ]));

-- ── 2) award_solo_coins ─────────────────────────────────────────────────────
-- Corps identique à end_of_game.sql (la définition de référence, dont la
-- whitelist est aussi mise à jour pour rester en phase — un test la relit),
-- 'scale' ajouté à la whitelist.
CREATE OR REPLACE FUNCTION public.award_solo_coins(p_game_mode text, p_score int DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid        uuid := auth.uid();
  today      date := (now() at time zone 'utc')::date;
  cur        int;
  cap        constant int := 5;
  min_reward constant int := 2;
  max_reward constant int := 10;
  score      int;
  reward     int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_game_mode NOT IN ('classic','streak','versus','globe','guess','regions','quiz-capital','quiz-flag','higherlower','silhouette','borders','languages','challenge','pinpoint','scale') THEN
    RAISE EXCEPTION 'bad game mode';
  END IF;

  -- Normalized score is 0..1000; clamp defensively, then scale to the coin band.
  score  := GREATEST(0, LEAST(COALESCE(p_score, 0), 1000));
  reward := min_reward + round(score::numeric / 1000 * (max_reward - min_reward));

  INSERT INTO public.solo_coin_log (user_id, day, game_mode, count)
    VALUES (uid, today, p_game_mode, 0)
    ON CONFLICT (user_id, day, game_mode) DO NOTHING;

  SELECT count INTO cur FROM public.solo_coin_log
    WHERE user_id = uid AND day = today AND game_mode = p_game_mode FOR UPDATE;

  IF cur >= cap THEN
    RETURN jsonb_build_object('coins_awarded', 0, 'capped', true);
  END IF;

  UPDATE public.solo_coin_log SET count = count + 1
    WHERE user_id = uid AND day = today AND game_mode = p_game_mode;

  INSERT INTO public.coin_wallets (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.coin_wallets SET balance = balance + reward, updated_at = now() WHERE user_id = uid;

  RETURN jsonb_build_object('coins_awarded', reward, 'capped', false);
END;
$$;

REVOKE ALL ON FUNCTION public.award_solo_coins(text, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.award_solo_coins(text, int) TO authenticated;

-- ── 3) Quotidien : whitelist des modes ──────────────────────────────────────
-- Corps autoritatif : daily.sql (garder les deux en phase) ; seule la liste de
-- la ligne NOT IN change par rapport à challenge_mode.sql.
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
  IF p_mode NOT IN ('classic','streak','guess','globe','regions','quiz-capital','quiz-flag','higherlower','silhouette','borders','languages','challenge','pinpoint','scale') THEN
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
