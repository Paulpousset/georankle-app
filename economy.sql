-- ════════════════════════════════════════════════════════════════════════════
-- Avatar economy: coin wallets, cosmetic ownership, shop & equip.
-- Server-authoritative — clients READ; all balance/ownership writes go through
-- SECURITY DEFINER RPCs with row locks + idempotency guards (mirrors the
-- apply_ranked_result pattern in server_authoritative.sql).
-- Re-runnable: every statement is idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.coin_wallets (
  user_id    uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance    int  NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_cosmetics (
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id     text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS public.cosmetic_prices (
  item_id    text PRIMARY KEY,
  category   text NOT NULL,
  price      int  NOT NULL CHECK (price >= 0),
  is_default boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.solo_coin_log (
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day       date NOT NULL,
  game_mode text NOT NULL,
  count     int  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, game_mode)
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_config jsonb;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS coins_awarded boolean NOT NULL DEFAULT false;

-- ── RLS: clients read own rows only; no client write policies (RPC-only) ──────

ALTER TABLE public.coin_wallets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cosmetics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cosmetic_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solo_coin_log  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own wallet" ON public.coin_wallets;
CREATE POLICY "read own wallet" ON public.coin_wallets
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "read own cosmetics" ON public.user_cosmetics;
CREATE POLICY "read own cosmetics" ON public.user_cosmetics
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "anyone can read prices" ON public.cosmetic_prices;
CREATE POLICY "anyone can read prices" ON public.cosmetic_prices
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "read own solo log" ON public.solo_coin_log;
CREATE POLICY "read own solo log" ON public.solo_coin_log
  FOR SELECT USING (auth.uid() = user_id);

-- ── Ranked result + coins (replaces server_authoritative.sql version) ─────────
-- Same ELO logic as before, plus coin awards in the SAME rating_applied-guarded
-- transaction so coins can never be double-granted.
CREATE OR REPLACE FUNCTION public.apply_ranked_result(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m              public.matches%ROWTYPE;
  caller         uuid := auth.uid();
  k              constant int := 32;
  win_reward     constant int := 20;
  loss_reward    constant int := 8;
  needed         int;
  p1_elo         int;
  p2_elo         int;
  exp1           numeric;
  s1             numeric;
  d1             int;
  d2             int;
  new1           int;
  new2           int;
  p1_won         boolean;
  caller_is_p1   boolean;
  caller_coins   int;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF caller <> m.player1_id AND caller <> m.player2_id THEN
    RAISE EXCEPTION 'not a participant';
  END IF;
  IF m.is_ranked IS NOT TRUE THEN RAISE EXCEPTION 'match is not ranked'; END IF;
  IF m.player2_id IS NULL THEN RAISE EXCEPTION 'match has no opponent'; END IF;

  needed := ceil(GREATEST(m.best_of, 1) / 2.0);
  IF m.p1_rounds_won < needed AND m.p2_rounds_won < needed THEN
    RAISE EXCEPTION 'series not finished';
  END IF;

  caller_is_p1 := (caller = m.player1_id);

  IF m.rating_applied THEN
    SELECT elo INTO new1 FROM public.player_ratings
      WHERE user_id = CASE WHEN caller_is_p1 THEN m.player1_id ELSE m.player2_id END;
    RETURN jsonb_build_object('already_applied', true, 'new_elo', COALESCE(new1, 1000), 'coins_awarded', 0);
  END IF;

  p1_won := m.p1_rounds_won > m.p2_rounds_won;

  INSERT INTO public.player_ratings (user_id) VALUES (m.player1_id)
    ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.player_ratings (user_id) VALUES (m.player2_id)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT elo INTO p1_elo FROM public.player_ratings WHERE user_id = m.player1_id;
  SELECT elo INTO p2_elo FROM public.player_ratings WHERE user_id = m.player2_id;

  exp1 := 1.0 / (1.0 + power(10.0, (p2_elo - p1_elo) / 400.0));
  s1   := CASE WHEN p1_won THEN 1 ELSE 0 END;
  d1   := round(k * (s1 - exp1));
  d2   := round(k * ((1 - s1) - (1 - exp1)));
  new1 := greatest(0, p1_elo + d1);
  new2 := greatest(0, p2_elo + d2);

  UPDATE public.player_ratings
    SET elo = new1,
        wins = wins + CASE WHEN p1_won THEN 1 ELSE 0 END,
        losses = losses + CASE WHEN p1_won THEN 0 ELSE 1 END,
        updated_at = now()
    WHERE user_id = m.player1_id;

  UPDATE public.player_ratings
    SET elo = new2,
        wins = wins + CASE WHEN p1_won THEN 0 ELSE 1 END,
        losses = losses + CASE WHEN p1_won THEN 1 ELSE 0 END,
        updated_at = now()
    WHERE user_id = m.player2_id;

  -- Coins: winner gets win_reward, loser loss_reward.
  INSERT INTO public.coin_wallets (user_id) VALUES (m.player1_id) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.coin_wallets (user_id) VALUES (m.player2_id) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.coin_wallets
    SET balance = balance + CASE WHEN p1_won THEN win_reward ELSE loss_reward END, updated_at = now()
    WHERE user_id = m.player1_id;
  UPDATE public.coin_wallets
    SET balance = balance + CASE WHEN p1_won THEN loss_reward ELSE win_reward END, updated_at = now()
    WHERE user_id = m.player2_id;

  UPDATE public.matches SET rating_applied = true, coins_awarded = true, status = 'completed'
    WHERE id = p_match_id;

  caller_coins := CASE
    WHEN (caller_is_p1 AND p1_won) OR (NOT caller_is_p1 AND NOT p1_won) THEN win_reward
    ELSE loss_reward END;

  RETURN jsonb_build_object(
    'already_applied', false,
    'old_elo', CASE WHEN caller_is_p1 THEN p1_elo ELSE p2_elo END,
    'new_elo', CASE WHEN caller_is_p1 THEN new1 ELSE new2 END,
    'elo_change', CASE WHEN caller_is_p1 THEN d1 ELSE d2 END,
    'won', CASE WHEN caller_is_p1 THEN p1_won ELSE NOT p1_won END,
    'coins_awarded', caller_coins
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_ranked_result(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_ranked_result(uuid) TO authenticated;

-- ── Online (non-ranked) result coins ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_online_result(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m            public.matches%ROWTYPE;
  caller       uuid := auth.uid();
  win_reward   constant int := 10;
  loss_reward  constant int := 4;
  needed       int;
  caller_is_p1 boolean;
  caller_won   boolean;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF caller <> m.player1_id AND caller <> m.player2_id THEN RAISE EXCEPTION 'not a participant'; END IF;
  IF m.is_ranked IS TRUE THEN RAISE EXCEPTION 'ranked uses apply_ranked_result'; END IF;
  IF m.player2_id IS NULL THEN RAISE EXCEPTION 'match has no opponent'; END IF;

  needed := ceil(GREATEST(m.best_of, 1) / 2.0);
  IF m.p1_rounds_won < needed AND m.p2_rounds_won < needed THEN
    RAISE EXCEPTION 'series not finished';
  END IF;

  caller_is_p1 := (caller = m.player1_id);
  caller_won := CASE WHEN caller_is_p1 THEN m.p1_rounds_won > m.p2_rounds_won
                     ELSE m.p2_rounds_won > m.p1_rounds_won END;

  IF m.coins_awarded THEN
    RETURN jsonb_build_object('already_awarded', true, 'coins_awarded', 0, 'won', caller_won);
  END IF;

  INSERT INTO public.coin_wallets (user_id) VALUES (m.player1_id) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.coin_wallets (user_id) VALUES (m.player2_id) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.coin_wallets
    SET balance = balance + CASE WHEN m.p1_rounds_won > m.p2_rounds_won THEN win_reward ELSE loss_reward END, updated_at = now()
    WHERE user_id = m.player1_id;
  UPDATE public.coin_wallets
    SET balance = balance + CASE WHEN m.p2_rounds_won > m.p1_rounds_won THEN win_reward ELSE loss_reward END, updated_at = now()
    WHERE user_id = m.player2_id;

  UPDATE public.matches SET coins_awarded = true WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'already_awarded', false,
    'coins_awarded', CASE WHEN caller_won THEN win_reward ELSE loss_reward END,
    'won', caller_won
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_online_result(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_online_result(uuid) TO authenticated;

-- ── Solo coins (daily-capped, score-independent → anti-farm) ──────────────────
CREATE OR REPLACE FUNCTION public.award_solo_coins(p_game_mode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid    uuid := auth.uid();
  today  date := (now() at time zone 'utc')::date;
  cur    int;
  cap    constant int := 5;
  reward constant int := 2;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_game_mode NOT IN ('classic','streak','versus','globe','guess') THEN
    RAISE EXCEPTION 'bad game mode';
  END IF;

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

REVOKE ALL ON FUNCTION public.award_solo_coins(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.award_solo_coins(text) TO authenticated;

-- ── Purchase a cosmetic ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purchase_cosmetic(p_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid     uuid := auth.uid();
  v_price int;
  bal     int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT price INTO v_price FROM public.cosmetic_prices WHERE item_id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown item'; END IF;

  IF EXISTS (SELECT 1 FROM public.user_cosmetics WHERE user_id = uid AND item_id = p_item_id) THEN
    SELECT balance INTO bal FROM public.coin_wallets WHERE user_id = uid;
    RETURN jsonb_build_object('already_owned', true, 'new_balance', COALESCE(bal, 0));
  END IF;

  INSERT INTO public.coin_wallets (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO bal FROM public.coin_wallets WHERE user_id = uid FOR UPDATE;

  IF bal < v_price THEN RAISE EXCEPTION 'insufficient funds'; END IF;

  UPDATE public.coin_wallets SET balance = balance - v_price, updated_at = now() WHERE user_id = uid;
  INSERT INTO public.user_cosmetics (user_id, item_id) VALUES (uid, p_item_id)
    ON CONFLICT (user_id, item_id) DO NOTHING;

  RETURN jsonb_build_object('already_owned', false, 'new_balance', bal - v_price);
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_cosmetic(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.purchase_cosmetic(text) TO authenticated;

-- ── Equip an avatar config (validates ownership of every layer) ───────────────
CREATE OR REPLACE FUNCTION public.equip_cosmetics(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid  uuid := auth.uid();
  item text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  FOR item IN SELECT value->>'id' FROM jsonb_each(p_config->'layers') LOOP
    IF item IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.user_cosmetics WHERE user_id = uid AND item_id = item)
       AND NOT EXISTS (SELECT 1 FROM public.cosmetic_prices WHERE item_id = item AND is_default) THEN
      RAISE EXCEPTION 'item not owned: %', item;
    END IF;
  END LOOP;

  UPDATE public.profiles SET avatar_config = p_config, updated_at = now() WHERE id = uid;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.equip_cosmetics(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.equip_cosmetics(jsonb) TO authenticated;

-- ── Defense in depth: re-validate avatar_config ownership on direct writes ────
-- profiles' self-update RLS would otherwise let a client set avatar_config to
-- unowned item ids. This trigger enforces ownership regardless of write path.
CREATE OR REPLACE FUNCTION public.validate_avatar_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE item text;
BEGIN
  IF NEW.avatar_config IS NULL OR NEW.avatar_config IS NOT DISTINCT FROM OLD.avatar_config THEN
    RETURN NEW;
  END IF;
  FOR item IN SELECT value->>'id' FROM jsonb_each(NEW.avatar_config->'layers') LOOP
    IF item IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.user_cosmetics WHERE user_id = NEW.id AND item_id = item)
       AND NOT EXISTS (SELECT 1 FROM public.cosmetic_prices WHERE item_id = item AND is_default) THEN
      RAISE EXCEPTION 'item not owned: %', item;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- Trigger-only function: must NOT be callable as an RPC.
REVOKE ALL ON FUNCTION public.validate_avatar_config() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_avatar_config ON public.profiles;
CREATE TRIGGER trg_validate_avatar_config
  BEFORE UPDATE OF avatar_config ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_avatar_config();

-- ── Extend account deletion to the new tables ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  DELETE FROM public.matches        WHERE player1_id = uid OR player2_id = uid;
  DELETE FROM public.friends        WHERE user_id1 = uid OR user_id2 = uid;
  DELETE FROM public.scores         WHERE user_id = uid;
  DELETE FROM public.player_ratings WHERE user_id = uid;
  DELETE FROM public.coin_wallets   WHERE user_id = uid;
  DELETE FROM public.user_cosmetics WHERE user_id = uid;
  DELETE FROM public.solo_coin_log  WHERE user_id = uid;
  DELETE FROM public.profiles       WHERE id = uid;
  DELETE FROM auth.users            WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
