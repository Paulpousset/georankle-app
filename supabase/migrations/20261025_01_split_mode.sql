-- « Partage équitable » (split) — une carte, ses grandes villes et leur
-- population ; le joueur trace un ou deux traits pour couper cette population
-- en parts égales. Solo seulement pour l'instant (ni quotidien, ni en ligne) :
-- seul award_solo_coins a besoin du mode. Le classement solo passe par un
-- INSERT direct dans `scores`, sans liste blanche.
--
-- award_solo_coins : corps identique à 20261024_02_scale_mode.sql (dernière
-- définition appliquée), 'split' ajouté à la whitelist. end_of_game.sql, la
-- définition de référence qu'un test relit, est mise à jour de même.
--
-- ⚠️ Un client à jour contre un serveur non migré lève « bad game mode »
-- (P0001) et la file de synchro DROP l'opération : appliquée par migrate.yml à
-- la fusion sur master, AVANT de livrer le client.
-- Re-jouable.
-- ════════════════════════════════════════════════════════════════════════════

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
  IF p_game_mode NOT IN ('classic','streak','versus','globe','guess','regions','quiz-capital','quiz-flag','higherlower','silhouette','borders','languages','challenge','pinpoint','scale','split') THEN
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

