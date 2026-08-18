-- ✅ APPLIQUÉ EN PROD le 2026-08-17 via Supabase MCP
--    (migration « challenge_mode_daily_and_league_pool_v3 »).
--    Parité vérifiée après application : les tirages v1/v2 (2026-07-23, 07-24,
--    2026-01-01, 09-14, 09-15, 09-20, 10-14) sont IDENTIQUES à avant — aucun
--    classement historique réécrit — et 10-15 / 2027-03-15 donnent bien le
--    tirage v3 des vecteurs figés côté TS. league_norm_score('challenge', 50) = 1000.
-- ════════════════════════════════════════════════════════════════════════════
-- « Quiz Pays » (challenge) — les quiz de subdivisions (numéros de département,
-- capitales des États américains, drapeaux des États, Länder, régions IT/ES/CA…)
-- passent du hub Défis Pays à TOUTES les surfaces : quotidien, ligue, classé,
-- partie perso en ligne, parcours local.
--
-- Le mode 'challenge' existait déjà côté matches (matchmaking 1v1 par quiz) ;
-- ce qui est nouveau ici, c'est le quotidien (donc la ligue, qui lit les
-- daily_results). Le quiz du jour est tiré du seed du jour côté client
-- (challengeForSeed, src/data/challenges.ts) — jamais d'un flag ni d'un choix
-- joueur, sinon deux joueurs d'une même ligue ne jouent pas le même défi.
--
-- Trois bras, dans cet ordre :
--   1) complete_daily  + 'challenge' dans la whitelist
--   2) league_daily_modes  pool v3 daté (2026-10-15)
--   3) league_norm_score   + bras 'challenge' (score brut sur 50)
-- Re-jouable.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Quotidien : whitelist des modes ──────────────────────────────────────
-- ⚠️ À APPLIQUER AVANT LE CLIENT. Sinon la RPC lève « bad game mode » (P0001) ;
-- isPermanentRpcError (src/lib/syncQueue.ts) traite P0001 comme définitif et
-- DROP l'opération : le joueur perd son run quotidien en silence.
-- Corps autoritatif : daily.sql (garder les deux en phase) ; seule la liste de
-- la ligne NOT IN change par rapport à languages_daily.sql.
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
  IF p_mode NOT IN ('classic','streak','guess','globe','regions','quiz-capital','quiz-flag','higherlower','silhouette','borders','languages','challenge') THEN
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

-- ── 2) Tirage de ligue, pool v3 daté ────────────────────────────────────────
-- MÊME RAISON QU'EN v2 (voir languages_league.sql) : le tirage est
-- `fnv1a(...) % array_length(pool)`. Passer le pool de 11 à 12 entrées
-- transformerait tous les `% 11` en `% 12` Y COMPRIS pour les dates passées, et
-- league_leaderboard fait passer l'historique de daily_results par
-- league_daily_modes(puzzle_date) : les classements « mois » et « total » de
-- tous les joueurs seraient réécrits en silence.
--
-- v1 (10 modes) < 2026-09-15 ≤ v2 (11 modes) < 2026-10-15 ≤ v3 (12 modes).
-- Reste IMMUTABLE : les deux dates sont des littéraux, jamais current_date.
--
-- ⚠️ MIROIR EXACT de leaguePoolFor() / LEAGUE_POOL_V2_FROM / LEAGUE_POOL_V3_FROM
-- dans src/lib/league.ts. Les deux se modifient ensemble ou pas du tout.
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
  -- v1 et v2 : FIGÉS à jamais. Chaque version reprend la précédente dans le
  -- MÊME ordre, les nouveautés en queue.
  IF p_date >= DATE '2026-10-15' THEN
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

-- ── 3) Normalisation du score de ligue ──────────────────────────────────────
-- Le quotidien « Quiz Pays » rapporte des POINTS bruts (DUO 1 / CARRÉ 3 /
-- CASH 5 sur 10 questions, soit 50 au maximum), exactement comme « Langues ».
-- Sans ce bras, la branche ELSE le plafonnerait à 50/1000 : le mode pèserait
-- vingt fois moins qu'un globe au classement.
--
-- ⚠️ Le facteur 20 est COUPLÉ à CHALLENGE_QUESTIONS_SOLO = 10
-- (src/data/challenges.ts, verrouillé par un test). Changer la longueur du
-- quotidien impose de changer ce 50 en même temps.
--
-- Pas de rétroactivité : aucun historique 'challenge' dans daily_results.
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
--   SELECT public.league_norm_score('challenge', 50);       -- 1000
-- Les mêmes vecteurs sont figés côté TS dans src/lib/__tests__/league.test.ts.
