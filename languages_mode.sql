-- ✅ APPLIQUÉ EN PROD le 2026-08-16 via Supabase MCP (migration « languages_mode »).
-- ════════════════════════════════════════════════════════════════════════════
-- « Langues » (languages) — activation côté serveur, PHASE 1 (solo écrit).
--
-- Élargit :
--   1. le CHECK matches.game_mode (supersède borders_mode.sql) ;
--   2. la whitelist de award_solo_coins (corps autoritatif : coin_multiplier.sql,
--      plus récent qu'economy.sql — garder les deux en phase) ;
--   3. les feature flags du mode.
--
-- ⚠️ À APPLIQUER AVANT DE SHIPPER LE CLIENT. Un client à jour contre un serveur
-- non migré lève « bad game mode » (SQLSTATE P0001) ; isPermanentRpcError
-- (src/lib/syncQueue.ts) considère P0001 comme définitif et DROP l'opération —
-- le joueur perd silencieusement ses pièces.
--
-- Le reste du mode est dans ses propres fichiers, tous appliqués eux aussi :
--   · languages_daily.sql   complete_daily + 'languages'
--   · languages_audio.sql   bucket storage game-audio + policy de lecture
--   · languages_league.sql  league_daily_modes v2 daté + league_norm_score
-- Re-jouable.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) matches.game_mode ────────────────────────────────────────────────────
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
    'borders'::text,
    'languages'::text
  ]));

-- ── 2) award_solo_coins ─────────────────────────────────────────────────────
-- Corps identique à coin_multiplier.sql, 'languages' ajouté à la whitelist.
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
  IF p_game_mode NOT IN ('classic','streak','versus','globe','guess','regions','quiz-capital','quiz-flag','higherlower','silhouette','borders','languages') THEN
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

-- ── 3) Feature flags ────────────────────────────────────────────────────────
--   languages_mode  : masque la tuile du mode partout dans l'UI.
--   languages_audio : n'éteint QUE la variante audio, pour pouvoir retirer une
--                     voix ratée sans retirer le mode.
-- Créés OFF ; flipper `enabled` est TOUTE la procédure d'activation (aucun
-- build requis). Le client fail-closed (src/lib/featureFlags.ts).
--
-- ⚠️ Ces flags ne gardent QUE de l'UI. Les tirages déterministes (quotidien,
-- ligue) ne doivent JAMAIS en dépendre : un flag fail-closed hors-ligne
-- changerait les questions d'un seul joueur et désynchroniserait la partie.
INSERT INTO public.feature_flags (key, enabled) VALUES
  ('languages_mode', false),
  ('languages_audio', false)
ON CONFLICT (key) DO NOTHING;
