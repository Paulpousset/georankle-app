-- ════════════════════════════════════════════════════════════════════════════
-- Seasons + monetization scaffolding (2026-07-05).
--
-- SEASONS: quarterly ranked seasons. `close_season` (ADMIN-ONLY, run manually
-- from SQL or a future admin button) pays every rated player a coin reward by
-- final tier, soft-resets ELO toward 1200, and marks the season closed —
-- idempotent via the seasons.closed flag + season_rewards ledger.
--
-- MONETIZATION (decision 2026-07-02: build but keep DISABLED and INVISIBLE):
-- * feature_flags — server kill-switches, both rows created OFF. The client
--   AND the RPCs check them, so flipping a row is the only activation step.
-- * iap_grants + grant_iap_coins — coin-pack credit path for the RevenueCat
--   webhook (service-role only, idempotent per store transaction id).
-- * ad_claims + claim_rewarded_ad — rewarded-ad coins, flag-gated server-side,
--   capped per day. TODO before enabling: AdMob server-side verification (SSV)
--   so the claim can't be called without actually watching an ad.
-- Re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Seasons ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.seasons (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  closed     boolean NOT NULL DEFAULT false
);

ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read seasons" ON public.seasons;
CREATE POLICY "read seasons" ON public.seasons FOR SELECT USING (true);

-- Season 1 (once).
INSERT INTO public.seasons (name, starts_at, ends_at)
SELECT 'Saison 1', '2026-07-01T00:00:00Z', '2026-09-30T23:59:59Z'
WHERE NOT EXISTS (SELECT 1 FROM public.seasons);

CREATE TABLE IF NOT EXISTS public.season_rewards (
  season_id  int  NOT NULL REFERENCES public.seasons(id),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier       text NOT NULL,
  elo        int  NOT NULL,
  coins      int  NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, user_id)
);

ALTER TABLE public.season_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own season rewards" ON public.season_rewards;
CREATE POLICY "read own season rewards" ON public.season_rewards
  FOR SELECT USING ((select auth.uid()) = user_id);

-- Close a season: reward by tier, soft-reset ELO, mark closed. ADMIN-ONLY.
CREATE OR REPLACE FUNCTION public.close_season(p_season_id int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s        record;
  r        record;
  tier     text;
  reward   int;
  rewarded int := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;

  SELECT * INTO s FROM public.seasons WHERE id = p_season_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'season not found'; END IF;
  IF s.closed THEN
    RETURN jsonb_build_object('closed', false, 'reason', 'already_closed');
  END IF;

  FOR r IN SELECT user_id, elo FROM public.player_ratings LOOP
    tier := public.rank_tier_from_elo(r.elo);
    reward := CASE tier
      WHEN 'bronze'   THEN 20
      WHEN 'silver'   THEN 40
      WHEN 'gold'     THEN 80
      WHEN 'platinum' THEN 150
      WHEN 'diamond'  THEN 250
      WHEN 'master'   THEN 400
      ELSE 20
    END;

    INSERT INTO public.season_rewards (season_id, user_id, tier, elo, coins)
      VALUES (p_season_id, r.user_id, tier, r.elo, reward)
      ON CONFLICT DO NOTHING;
    IF FOUND THEN
      INSERT INTO public.coin_wallets (user_id) VALUES (r.user_id) ON CONFLICT (user_id) DO NOTHING;
      UPDATE public.coin_wallets
        SET balance = balance + reward, updated_at = now()
        WHERE user_id = r.user_id;
      rewarded := rewarded + 1;
    END IF;

    -- Soft reset: halve the distance to 1200 (both directions).
    UPDATE public.player_ratings
      SET elo = 1200 + (r.elo - 1200) / 2, updated_at = now()
      WHERE user_id = r.user_id;
  END LOOP;

  UPDATE public.seasons SET closed = true WHERE id = p_season_id;
  RETURN jsonb_build_object('closed', true, 'players_rewarded', rewarded);
END;
$$;

REVOKE ALL ON FUNCTION public.close_season(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.close_season(int) TO authenticated; -- body re-checks is_admin()

-- ── Feature flags (server kill-switches) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feature_flags (
  key        text PRIMARY KEY,
  enabled    boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read feature flags" ON public.feature_flags;
CREATE POLICY "read feature flags" ON public.feature_flags FOR SELECT USING (true);
-- Writes: service role / SQL editor only (no client policy on purpose).

INSERT INTO public.feature_flags (key, enabled) VALUES
  ('iap', false),
  ('rewarded_ads', false)
ON CONFLICT (key) DO NOTHING;

-- ── IAP coin packs (RevenueCat webhook credit path) ──────────────────────────

CREATE TABLE IF NOT EXISTS public.iap_grants (
  transaction_id text PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id     text NOT NULL,
  coins          int  NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.iap_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own iap grants" ON public.iap_grants;
CREATE POLICY "read own iap grants" ON public.iap_grants
  FOR SELECT USING ((select auth.uid()) = user_id);

-- Credits a purchased coin pack. SERVICE-ROLE ONLY — called by the
-- revenuecat-webhook edge function after it authenticated the event; a client
-- must never be able to invoke this. Idempotent per store transaction id.
CREATE OR REPLACE FUNCTION public.grant_iap_coins(
  p_user uuid,
  p_product text,
  p_transaction_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  coins int;
BEGIN
  coins := CASE p_product
    WHEN 'coins_300'  THEN 300
    WHEN 'coins_800'  THEN 800
    WHEN 'coins_2000' THEN 2000
    ELSE 0
  END;
  IF coins = 0 THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'unknown_product');
  END IF;

  INSERT INTO public.iap_grants (transaction_id, user_id, product_id, coins)
    VALUES (p_transaction_id, p_user, p_product, coins)
    ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'duplicate');
  END IF;

  INSERT INTO public.coin_wallets (user_id) VALUES (p_user) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.coin_wallets
    SET balance = balance + coins, updated_at = now()
    WHERE user_id = p_user;

  RETURN jsonb_build_object('granted', true, 'coins', coins);
END;
$$;

REVOKE ALL ON FUNCTION public.grant_iap_coins(uuid, text, text) FROM public, anon, authenticated;

-- ── Rewarded ads (flag-gated, daily-capped) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ad_claims (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day     date NOT NULL,
  count   int  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.ad_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own ad claims" ON public.ad_claims;
CREATE POLICY "read own ad claims" ON public.ad_claims
  FOR SELECT USING ((select auth.uid()) = user_id);

-- Claim the reward for a watched ad. Refuses while the 'rewarded_ads' flag is
-- OFF (server-side gate — flipping the flag is the activation switch).
-- TODO before enabling: route this through AdMob SSV so a claim requires a
-- real ad impression; until then the flag stays off.
CREATE OR REPLACE FUNCTION public.claim_rewarded_ad()
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
  reward constant int := 5;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE key = 'rewarded_ads' AND enabled) THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'disabled');
  END IF;

  INSERT INTO public.ad_claims (user_id, day, count)
    VALUES (uid, today, 0)
    ON CONFLICT (user_id, day) DO NOTHING;

  SELECT count INTO cur FROM public.ad_claims
    WHERE user_id = uid AND day = today FOR UPDATE;
  IF cur >= cap THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'capped');
  END IF;

  UPDATE public.ad_claims SET count = count + 1
    WHERE user_id = uid AND day = today;

  INSERT INTO public.coin_wallets (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.coin_wallets
    SET balance = balance + reward, updated_at = now()
    WHERE user_id = uid;

  RETURN jsonb_build_object('granted', true, 'coins', reward);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_rewarded_ad() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_rewarded_ad() TO authenticated;

-- Advisor pass: covering indexes for the user_id FKs + one-per-query auth.uid()
-- in the policies above (see advisor_pass_rls_initplan_and_fk_indexes migration).
CREATE INDEX IF NOT EXISTS iap_grants_user_idx ON public.iap_grants (user_id);
CREATE INDEX IF NOT EXISTS season_rewards_user_idx ON public.season_rewards (user_id);
