-- Rééquilibrage de l'économie des pièces, après l'arrivée du Coffre du jour,
-- du Tournoi de la semaine, du Duel 20h et de l'Impossible du jour.
--
--   1) Prix des cosmétiques ≈ +50 % (les gains d'un joueur actif ont pris
--      ≈ +60 %) : 150→250, 400→600, 800→1200, 1500→2200. Le « Commun » (50)
--      reste un premier achat facile. Packs recalculés (~30 % sous la somme).
--      Gardé en phase avec RARITY_META et BUNDLES (src/data/cosmetics.ts).
--   2) Tournoi de la semaine : lots 300/200/100 puis 50 (4e–10e), et seule la
--      moitié haute du classement est payée (10 places au plus). Avec 3 à 12
--      joueurs par semaine, le top 10 payait presque tout le monde.
--      Gardé en phase avec TOURNAMENT_PRIZES / paidPlaces (src/lib/tournament.ts).
--   3) Classé contre le bot : pièces sur les 10 premiers matchs du jour
--      (l'ELO continue de bouger après). Ce n'était plafonné nulle part.
--   4) Duel 20h : bonus sur 5 duels par soir au plus.
-- Re-jouable.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Prix ──────────────────────────────────────────────────────────────────

-- Le prix suit la rareté (comme RARITY_META côté client) : re-jouable.
UPDATE public.cosmetic_prices SET price = CASE rarity
    WHEN 'common'    THEN 50
    WHEN 'uncommon'  THEN 250
    WHEN 'rare'      THEN 600
    WHEN 'epic'      THEN 1200
    WHEN 'legendary' THEN 2200
    ELSE price
  END
WHERE NOT is_default;

UPDATE public.cosmetic_bundles AS b SET price = v.price
FROM (VALUES
  ('bundle_solar',    2100),
  ('bundle_fireice',  3000),
  ('bundle_wonders',  2100),
  ('bundle_explorer',  750),
  ('bundle_retro',    2800),
  ('bundle_skies',     750),
  ('bundle_temples',  1400)
) AS v(bundle_id, price)
WHERE b.bundle_id = v.bundle_id;

-- ── 2) Tournoi de la semaine ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tournament_prize(p_rank int)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_rank = 1 THEN 300
    WHEN p_rank = 2 THEN 200
    WHEN p_rank = 3 THEN 100
    WHEN p_rank BETWEEN 4 AND 10 THEN 50
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.claim_tournament_prize()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid       uuid := auth.uid();
  last_week date := (date_trunc('week', now() at time zone 'utc'))::date - 7;
  my_rank   int;
  players   int;
  paid      int;
  prize     int;
  inserted  int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT r.rnk, r.n INTO my_rank, players FROM (
    SELECT s.user_id,
           rank() OVER (ORDER BY max(s.score) DESC) AS rnk,
           count(*) OVER () AS n
      FROM public.scores s
     WHERE s.game_mode = public.tournament_mode(last_week)
       AND s.created_at >= last_week::timestamp at time zone 'utc'
       AND s.created_at <  (last_week + 7)::timestamp at time zone 'utc'
     GROUP BY s.user_id
  ) r WHERE r.user_id = uid;

  -- Moitié haute du classement, 10 places au plus.
  paid := LEAST(10, COALESCE(players, 0) / 2);

  IF my_rank IS NULL OR my_rank > paid THEN
    RETURN jsonb_build_object('week', last_week, 'rank', my_rank, 'coins', 0,
                              'players', COALESCE(players, 0), 'paid_places', paid);
  END IF;

  prize := public.tournament_prize(my_rank);

  INSERT INTO public.tournament_prizes (user_id, week_start, rank, coins)
    VALUES (uid, last_week, my_rank, prize)
    ON CONFLICT (user_id, week_start) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted = 0 THEN
    RETURN jsonb_build_object('week', last_week, 'rank', my_rank, 'coins', 0, 'already', true);
  END IF;

  INSERT INTO public.coin_wallets (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.coin_wallets SET balance = balance + prize, updated_at = now() WHERE user_id = uid;

  RETURN jsonb_build_object('week', last_week, 'rank', my_rank, 'coins', prize);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_tournament_prize() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_tournament_prize() TO authenticated;

-- ── 3) Classé contre le bot : 10 matchs payés par jour ───────────────────────

CREATE INDEX IF NOT EXISTS idx_matches_bot_daily
  ON public.matches (player1_id, created_at)
  WHERE (game_data->>'is_bot') = 'true';

CREATE OR REPLACE FUNCTION public.apply_bot_ranked_result(p_match_id uuid, p_player_rounds_won integer, p_bot_rounds_won integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m            public.matches%ROWTYPE;
  caller       uuid := auth.uid();
  win_reward   constant int := 20;
  loss_reward  constant int := 8;
  daily_cap    constant int := 10;
  paid_today   int;
  needed       int;
  player_elo   int;
  bot_rating   int;
  exp_p        numeric;
  s_p          numeric;
  d            int;
  new_elo      int;
  player_won   boolean;
  reward       int;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF caller <> m.player1_id THEN RAISE EXCEPTION 'not the player'; END IF;
  IF m.is_ranked IS NOT TRUE THEN RAISE EXCEPTION 'match is not ranked'; END IF;
  IF COALESCE(m.game_data->>'is_bot', '') <> 'true' THEN RAISE EXCEPTION 'not a bot match'; END IF;
  IF m.player2_id IS NOT NULL THEN RAISE EXCEPTION 'bot match has an opponent'; END IF;

  needed := ceil(GREATEST(m.best_of, 1) / 2.0);

  IF p_player_rounds_won < 0 OR p_bot_rounds_won < 0
     OR p_player_rounds_won + p_bot_rounds_won > GREATEST(m.best_of, 1)
     OR (p_player_rounds_won >= needed) = (p_bot_rounds_won >= needed) THEN
    RAISE EXCEPTION 'invalid series result';
  END IF;

  IF m.rating_applied THEN
    SELECT elo INTO new_elo FROM public.player_ratings WHERE user_id = caller;
    RETURN jsonb_build_object('already_applied', true, 'new_elo', COALESCE(new_elo, 1000), 'coins_awarded', 0);
  END IF;

  INSERT INTO public.player_ratings (user_id) VALUES (caller) ON CONFLICT (user_id) DO NOTHING;
  SELECT elo INTO player_elo FROM public.player_ratings WHERE user_id = caller FOR UPDATE;

  bot_rating := COALESCE(NULLIF(m.game_data->'bot'->>'rating', '')::int, player_elo);
  bot_rating := GREATEST(100, LEAST(player_elo + 300, GREATEST(player_elo - 300, bot_rating)));

  player_won := p_player_rounds_won > p_bot_rounds_won;
  exp_p := 1.0 / (1.0 + power(10.0, (bot_rating - player_elo) / 400.0));
  s_p   := CASE WHEN player_won THEN 1 ELSE 0 END;
  d     := round(public.elo_k_factor(player_elo, player_won) * (s_p - exp_p));
  new_elo := greatest(0, player_elo + d);

  UPDATE public.player_ratings
    SET elo    = new_elo,
        wins   = wins   + CASE WHEN player_won THEN 1 ELSE 0 END,
        losses = losses + CASE WHEN player_won THEN 0 ELSE 1 END,
        updated_at = now()
    WHERE user_id = caller;

  -- Matchs contre le bot déjà payés aujourd'hui (UTC). Le verrou sur
  -- player_ratings ci-dessus sérialise les appels concurrents du joueur.
  SELECT count(*) INTO paid_today FROM public.matches
   WHERE player1_id = caller
     AND (game_data->>'is_bot') = 'true'
     AND coins_awarded
     AND id <> p_match_id
     AND created_at >= (now() at time zone 'utc')::date::timestamp at time zone 'utc';

  reward := CASE WHEN paid_today >= daily_cap THEN 0
                 WHEN player_won THEN win_reward ELSE loss_reward END;
  IF reward > 0 THEN
    INSERT INTO public.coin_wallets (user_id) VALUES (caller) ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.coin_wallets SET balance = balance + reward, updated_at = now() WHERE user_id = caller;
  END IF;

  UPDATE public.matches SET
    p1_rounds_won  = p_player_rounds_won,
    p2_rounds_won  = p_bot_rounds_won,
    rating_applied = true,
    coins_awarded  = reward > 0,
    status         = 'completed',
    updated_at     = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'already_applied', false,
    'old_elo',       player_elo,
    'new_elo',       new_elo,
    'elo_change',    d,
    'won',           player_won,
    'coins_awarded', reward,
    'capped',        paid_today >= daily_cap
  );
END;
$function$;

-- ── 4) Duel 20h : 5 bonus par soir ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_rush_bonus(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m          public.matches%ROWTYPE;
  caller     uuid := auth.uid();
  nightly_cap constant int := 5;
  claimed    int;
  needed     int;
  caller_won boolean;
  bonus      int;
  inserted   int;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO m FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF caller <> m.player1_id AND caller IS DISTINCT FROM m.player2_id THEN
    RAISE EXCEPTION 'not a participant';
  END IF;
  -- Un vrai duel entre deux joueurs, lancé pendant l'heure de pointe.
  IF m.player2_id IS NULL OR COALESCE(m.max_players, 2) > 2 THEN
    RETURN jsonb_build_object('coins', 0, 'reason', 'not_a_duel');
  END IF;
  IF extract(hour FROM (m.created_at at time zone 'utc')) <> 19 THEN
    RETURN jsonb_build_object('coins', 0, 'reason', 'outside_window');
  END IF;

  needed := ceil(GREATEST(m.best_of, 1) / 2.0);
  IF COALESCE(m.p1_rounds_won, 0) < needed AND COALESCE(m.p2_rounds_won, 0) < needed THEN
    RETURN jsonb_build_object('coins', 0, 'reason', 'not_finished');
  END IF;

  -- Plafond du soir (sérialisé par joueur pour éviter deux réclamations simultanées).
  PERFORM pg_advisory_xact_lock(hashtext('rush:' || caller::text));
  SELECT count(*) INTO claimed FROM public.rush_bonuses
   WHERE user_id = caller
     AND created_at >= (now() at time zone 'utc')::date::timestamp at time zone 'utc';
  IF claimed >= nightly_cap THEN
    RETURN jsonb_build_object('coins', 0, 'reason', 'capped');
  END IF;

  caller_won := CASE WHEN caller = m.player1_id THEN m.p1_rounds_won > m.p2_rounds_won
                     ELSE m.p2_rounds_won > m.p1_rounds_won END;
  bonus := CASE WHEN caller_won THEN 10 ELSE 4 END;

  INSERT INTO public.rush_bonuses (match_id, user_id, coins)
    VALUES (p_match_id, caller, bonus)
    ON CONFLICT (match_id, user_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted = 0 THEN
    RETURN jsonb_build_object('coins', 0, 'reason', 'already_claimed');
  END IF;

  INSERT INTO public.coin_wallets (user_id) VALUES (caller) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.coin_wallets SET balance = balance + bonus, updated_at = now() WHERE user_id = caller;

  RETURN jsonb_build_object('coins', bonus, 'won', caller_won);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_rush_bonus(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_rush_bonus(uuid) TO authenticated;
