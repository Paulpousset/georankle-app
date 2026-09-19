-- ✅ APPLIQUÉ EN PROD le 2026-09-17 via Supabase MCP
--    (migration « pinpoint_mode_all_surfaces_league_pool_v4 »).
--    Parité vérifiée après application : les 11 vecteurs ci-dessous (v1/v2/v3
--    figés + frontières v3→v4 + 2027-03-15) sont IDENTIQUES aux fixtures TS de
--    src/lib/__tests__/league.test.ts ; league_norm_score('pinpoint', 25) = 1000.
-- ════════════════════════════════════════════════════════════════════════════
-- « Point sur le Globe » (pinpoint) — un point posé sur un globe 3D SANS
-- frontières, le joueur dit dans quel pays il se trouve (DUO / CARRÉ / CASH,
-- les mauvaises réponses étant les pays les plus proches du point).
-- Présent sur TOUTES les surfaces : solo, quotidien, ligue, histoire, classé,
-- partie perso en ligne, FFA, parcours local.
--
-- Quatre bras, dans cet ordre :
--   1) matches.game_mode      + 'pinpoint' dans le CHECK
--   2) award_solo_coins       + 'pinpoint' dans la whitelist
--   3) complete_daily         + 'pinpoint' dans la whitelist
--   4) league_daily_modes     pool v4 daté (2026-11-15)
--      league_norm_score      + bras 'pinpoint' (score brut sur 25)
--
-- ⚠️ Un client à jour contre un serveur non migré lève « bad game mode »
-- (SQLSTATE P0001) ; isPermanentRpcError (src/lib/syncQueue.ts) traite P0001
-- comme définitif et DROP l'opération : le joueur perdrait en silence ses
-- pièces et son run quotidien. D'où l'ordre : SQL d'abord, client ensuite.
-- Re-jouable.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) matches.game_mode (supersède languages_mode.sql) ─────────────────────
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
    'languages'::text
  ]));

-- ── 2) award_solo_coins ─────────────────────────────────────────────────────
-- Corps identique à end_of_game.sql (la définition de référence, dont la
-- whitelist est aussi mise à jour pour rester en phase — un test la relit),
-- 'pinpoint' ajouté à la whitelist.
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
  IF p_game_mode NOT IN ('classic','streak','versus','globe','guess','regions','quiz-capital','quiz-flag','higherlower','silhouette','borders','languages','challenge','pinpoint') THEN
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
  IF p_mode NOT IN ('classic','streak','guess','globe','regions','quiz-capital','quiz-flag','higherlower','silhouette','borders','languages','challenge','pinpoint') THEN
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

-- ── 4) Tirage de ligue, pool v4 daté ────────────────────────────────────────
-- MÊME RAISON QU'EN v2/v3 (voir languages_league.sql, challenge_mode.sql) : le
-- tirage est `fnv1a(...) % array_length(pool)`. Passer le pool de 12 à 13
-- entrées transformerait tous les `% 12` en `% 13` Y COMPRIS pour les dates
-- passées, et league_leaderboard fait passer l'historique de daily_results par
-- league_daily_modes(puzzle_date) : les classements « mois » et « total » de
-- tous les joueurs seraient réécrits en silence.
--
-- v1 (10) < 2026-09-15 ≤ v2 (11) < 2026-10-15 ≤ v3 (12) < 2026-11-15 ≤ v4 (13).
-- Reste IMMUTABLE : les dates sont des littéraux, jamais current_date.
--
-- ⚠️ MIROIR EXACT de leaguePoolFor() / LEAGUE_POOL_V4_FROM dans
-- src/lib/league.ts. Les deux se modifient ensemble ou pas du tout.
CREATE OR REPLACE FUNCTION public.league_daily_modes(p_date date)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  pool   text[];
  picked text[] := ARRAY[]::text[];
  k int;
  idx int;
BEGIN
  -- v1, v2, v3 : FIGÉS à jamais. Chaque version reprend la précédente dans le
  -- MÊME ordre, les nouveautés en queue.
  IF p_date >= DATE '2026-11-15' THEN
    pool := ARRAY['globe','regions','guess','borders','silhouette',
                  'higherlower','classic','streak','quiz-capital','quiz-flag',
                  'languages','challenge','pinpoint'];
  ELSIF p_date >= DATE '2026-10-15' THEN
    pool := ARRAY['globe','regions','guess','borders','silhouette',
                  'higherlower','classic','streak','quiz-capital','quiz-flag',
                  'languages','challenge'];
  ELSIF p_date >= DATE '2026-09-15' THEN
    pool := ARRAY['globe','regions','guess','borders','silhouette',
                  'higherlower','classic','streak','quiz-capital','quiz-flag',
                  'languages'];
  ELSE
    pool := ARRAY['globe','regions','guess','borders','silhouette',
                  'higherlower','classic','streak','quiz-capital','quiz-flag'];
  END IF;

  FOR k IN 0..2 LOOP
    idx := (public.league_fnv1a(to_char(p_date, 'YYYY-MM-DD') || ':league:' || k::text)
            % array_length(pool, 1))::int + 1;
    picked := picked || pool[idx];
    pool := pool[1:idx-1] || pool[idx+1:array_length(pool, 1)];
  END LOOP;
  RETURN picked;
END;
$$;

REVOKE ALL ON FUNCTION public.league_daily_modes(date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.league_daily_modes(date) TO authenticated;

-- ── Normalisation du score de ligue ─────────────────────────────────────────
-- Le quotidien « Point sur le Globe » rapporte des POINTS bruts (DUO 1 /
-- CARRÉ 3 / CASH 5 sur 5 questions, soit 25 au maximum). Sans ce bras, la
-- branche ELSE le plafonnerait à 25/1000 : le mode pèserait quarante fois
-- moins qu'un globe au classement.
--
-- ⚠️ Le facteur 40 est COUPLÉ à la longueur du quotidien (5 questions par
-- défaut dans src/screens/PinpointGame.tsx). Changer la longueur du quotidien
-- impose de changer ce 25 en même temps.
--
-- NOTE (hors périmètre, à décider) : « Silhouette » est dans le même cas
-- (5 questions × 5 pts = 25) et tombe aujourd'hui dans la branche ELSE, donc
-- pèse 25/1000 en ligue. L'ajouter au bras `* 40` corrigerait le poids du mode
-- mais réécrirait les totaux historiques des jours Silhouette (à la hausse).
--
-- Pas de rétroactivité pour 'pinpoint' : aucun historique dans daily_results.
CREATE OR REPLACE FUNCTION public.league_norm_score(p_mode text, p_score int)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_mode = 'classic'                        THEN LEAST(GREATEST(p_score, 0), 100) * 10
    WHEN p_mode IN ('streak', 'higherlower')       THEN LEAST(GREATEST(p_score, 0), 40) * 25
    WHEN p_mode IN ('languages', 'challenge')      THEN LEAST(GREATEST(p_score, 0), 50) * 20
    WHEN p_mode = 'pinpoint'                       THEN LEAST(GREATEST(p_score, 0), 25) * 40
    ELSE LEAST(GREATEST(p_score, 0), 1000)
  END
$$;

REVOKE ALL ON FUNCTION public.league_norm_score(text, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.league_norm_score(text, int) TO authenticated;

-- ── Vérification de parité (à lancer après application) ─────────────────────
--   SELECT public.league_daily_modes('2026-07-23');  -- {quiz-capital,classic,globe}   (v1, figé)
--   SELECT public.league_daily_modes('2026-09-14');  -- {quiz-capital,regions,higherlower} (dernier v1)
--   SELECT public.league_daily_modes('2026-09-15');  -- {globe,quiz-flag,higherlower}  (premier v2)
--   SELECT public.league_daily_modes('2026-10-14');  -- {classic,regions,silhouette}   (dernier v2)
--   SELECT public.league_daily_modes('2026-10-15');  -- {regions,guess,quiz-flag}      (premier v3)
--   SELECT public.league_daily_modes('2026-11-14');  -- {streak,quiz-flag,borders}     (dernier v3)
--   SELECT public.league_daily_modes('2026-11-15');  -- {silhouette,regions,classic}   (premier v4)
--   SELECT public.league_daily_modes('2027-03-15');  -- {challenge,pinpoint,borders}   (v4)
--   SELECT public.league_norm_score('pinpoint', 25);        -- 1000
-- Les mêmes vecteurs sont figés côté TS dans src/lib/__tests__/league.test.ts.
