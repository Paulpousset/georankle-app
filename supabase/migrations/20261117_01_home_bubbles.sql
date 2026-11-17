-- Bulles de l'Accueil, suite de 20261116_01_impossible_daily.sql :
--   1) Coffre du jour   : une ouverture par jour UTC, la série J1→J7 fait
--                         grossir les pièces ; un jour manqué la remet à J1.
--   2) Duel 20h         : chaque soir de 19h à 20h UTC (20h–21h à Paris en
--                         hiver), un duel en ligne fini rapporte une seconde
--                         fois ses pièces (bonus réclamé par chaque joueur).
--   3) Tournoi semaine  : un mode solo par semaine (lundi 00h UTC), classement
--                         sur le meilleur score de la semaine dans `scores`,
--                         lots en pièces réclamés la semaine suivante.
-- Tout est server-authoritative (SECURITY DEFINER), idempotent, re-jouable.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Coffre du jour ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.daily_chests (
  user_id    uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_claim date NOT NULL,
  streak     int  NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_chests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own chest" ON public.daily_chests;
CREATE POLICY "read own chest" ON public.daily_chests
  FOR SELECT USING (auth.uid() = user_id);

-- Pièces du jour N du cycle (1..7). Gardé en phase avec CHEST_REWARDS
-- (src/lib/chest.ts).
CREATE OR REPLACE FUNCTION public.chest_reward(p_day int)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (ARRAY[10, 15, 20, 25, 30, 40, 75])[((GREATEST(p_day, 1) - 1) % 7) + 1];
$$;

CREATE OR REPLACE FUNCTION public.claim_daily_chest()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid      uuid := auth.uid();
  today    date := (now() at time zone 'utc')::date;
  row_     public.daily_chests%ROWTYPE;
  streak_  int;
  reward   int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO row_ FROM public.daily_chests WHERE user_id = uid FOR UPDATE;
  IF FOUND AND row_.last_claim = today THEN
    RETURN jsonb_build_object('claimed', false, 'streak', row_.streak, 'coins', 0);
  END IF;

  streak_ := CASE WHEN FOUND AND row_.last_claim = today - 1 THEN row_.streak + 1 ELSE 1 END;
  reward  := public.chest_reward(streak_);

  INSERT INTO public.daily_chests (user_id, last_claim, streak, updated_at)
    VALUES (uid, today, streak_, now())
    ON CONFLICT (user_id) DO UPDATE
      SET last_claim = EXCLUDED.last_claim, streak = EXCLUDED.streak, updated_at = now();

  INSERT INTO public.coin_wallets (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.coin_wallets SET balance = balance + reward, updated_at = now() WHERE user_id = uid;

  RETURN jsonb_build_object('claimed', true, 'streak', streak_, 'coins', reward);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_daily_chest() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_daily_chest() TO authenticated;

-- ── 2) Duel 20h ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rush_bonuses (
  match_id   uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coins      int  NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);
ALTER TABLE public.rush_bonuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own rush bonuses" ON public.rush_bonuses;
CREATE POLICY "read own rush bonuses" ON public.rush_bonuses
  FOR SELECT USING (auth.uid() = user_id);

-- Heure de pointe : [19:00, 20:00[ UTC. Gardé en phase avec RUSH_START_UTC
-- (src/lib/rush.ts).
CREATE OR REPLACE FUNCTION public.claim_rush_bonus(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m          public.matches%ROWTYPE;
  caller     uuid := auth.uid();
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

-- ── 3) Tournoi de la semaine ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_scores_mode_created
  ON public.scores (game_mode, created_at);

-- Le mode de la semaine qui commence le lundi p_week. Gardé en phase avec
-- TOURNAMENT_MODES (src/lib/tournament.ts) : même liste, même époque.
CREATE OR REPLACE FUNCTION public.tournament_mode(p_week date)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (ARRAY['silhouette','higherlower','guess','borders','streak','pinpoint','scale','split'])
         [(((p_week - date '2024-01-01') / 7) % 8 + 8) % 8 + 1];
$$;

CREATE OR REPLACE FUNCTION public.tournament_leaderboard(p_week date, p_limit int DEFAULT 50)
RETURNS TABLE (user_id uuid, username text, best int, games int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.user_id, p.username, max(s.score)::int AS best, count(*)::int AS games
    FROM public.scores s
    JOIN public.profiles p ON p.id = s.user_id
   WHERE s.game_mode = public.tournament_mode(p_week)
     AND s.created_at >= p_week::timestamp at time zone 'utc'
     AND s.created_at <  (p_week + 7)::timestamp at time zone 'utc'
   GROUP BY s.user_id, p.username
   ORDER BY best DESC, games ASC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

GRANT EXECUTE ON FUNCTION public.tournament_leaderboard(date, int) TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.tournament_prizes (
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  rank       int  NOT NULL,
  coins      int  NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_start)
);
ALTER TABLE public.tournament_prizes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own tournament prizes" ON public.tournament_prizes;
CREATE POLICY "read own tournament prizes" ON public.tournament_prizes
  FOR SELECT USING (auth.uid() = user_id);

-- Lot de la semaine écoulée : 1er 500, 2e 300, 3e 200, 4e–10e 100 pièces.
-- Les ex æquo partagent le rang (rank()). Idempotent : un lot par semaine.
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
  prize     int;
  inserted  int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT r.rnk INTO my_rank FROM (
    SELECT s.user_id, rank() OVER (ORDER BY max(s.score) DESC) AS rnk
      FROM public.scores s
     WHERE s.game_mode = public.tournament_mode(last_week)
       AND s.created_at >= last_week::timestamp at time zone 'utc'
       AND s.created_at <  (last_week + 7)::timestamp at time zone 'utc'
     GROUP BY s.user_id
  ) r WHERE r.user_id = uid;

  IF my_rank IS NULL OR my_rank > 10 THEN
    RETURN jsonb_build_object('week', last_week, 'rank', my_rank, 'coins', 0);
  END IF;

  prize := CASE my_rank WHEN 1 THEN 500 WHEN 2 THEN 300 WHEN 3 THEN 200 ELSE 100 END;

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
