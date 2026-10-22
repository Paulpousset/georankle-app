-- ════════════════════════════════════════════════════════════════════════════
-- Heure dorée : des créneaux où chaque pub récompensée rapporte plus.
--
-- Pendant un créneau, le bouton « regarder une pub » donne `multiplier` fois
-- ses pièces (5 → 15 par défaut) et le plafond quotidien de pubs passe de 5 à
-- `ad_cap` (10 par défaut). Le plafond plus haut vaut aussi pour le doubleur de
-- fin de partie, mais pas son gain (×2 / ×4 restent tels quels, la base pouvant
-- monter à 50 pièces).
--
-- Deux sortes de créneaux dans la même table :
--   · hebdomadaire : weekday (0 = dimanche, comme notification_campaigns) +
--     hour, en UTC, comme les campagnes push, pour que la notif tombe pile au
--     début du créneau ;
--   · ponctuel : starts_at (lancé depuis le HQ, « maintenant pendant 1 h »).
--
-- Lue et écrite par api/hq.mjs avec la clé service role : RLS activée sans
-- politique. Les joueurs passent par golden_hour_status().
--
-- Re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.golden_hours (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  weekday      smallint CHECK (weekday BETWEEN 0 AND 6),
  hour         smallint CHECK (hour BETWEEN 0 AND 23),
  starts_at    timestamptz,
  duration_min int  NOT NULL DEFAULT 120 CHECK (duration_min BETWEEN 15 AND 360),
  multiplier   int  NOT NULL DEFAULT 3   CHECK (multiplier BETWEEN 2 AND 5),
  ad_cap       int  NOT NULL DEFAULT 10  CHECK (ad_cap BETWEEN 5 AND 20),
  campaign_id  uuid REFERENCES public.notification_campaigns (id) ON DELETE SET NULL,
  enabled      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Soit hebdomadaire (jour + heure), soit ponctuel (starts_at), jamais les deux.
  CONSTRAINT golden_hours_kind CHECK (
    (starts_at IS NULL AND weekday IS NOT NULL AND hour IS NOT NULL)
    OR (starts_at IS NOT NULL AND weekday IS NULL AND hour IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS golden_hours_campaign_idx ON public.golden_hours (campaign_id);

ALTER TABLE public.golden_hours ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.golden_hours FROM anon, authenticated;

-- Les occurrences autour de p_now : un créneau hebdo est déplié sur la semaine
-- précédente, en cours et suivante (un créneau du dimanche soir déborde sur le
-- lundi, et le prochain peut être la semaine d'après).
CREATE OR REPLACE FUNCTION public.golden_hour_windows(p_now timestamptz)
RETURNS TABLE (starts timestamptz, ends timestamptz, multiplier int, ad_cap int)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT s.starts, s.starts + make_interval(mins => g.duration_min), g.multiplier, g.ad_cap
  FROM public.golden_hours g
  CROSS JOIN LATERAL (
    SELECT g.starts_at AS starts WHERE g.starts_at IS NOT NULL
    UNION ALL
    SELECT (date_trunc('week', p_now AT TIME ZONE 'utc')
              + w * interval '7 days'
              + ((g.weekday + 6) % 7) * interval '1 day'   -- date_trunc('week') = lundi
              + g.hour * interval '1 hour') AT TIME ZONE 'utc'
    FROM generate_series(-1, 1) AS w
    WHERE g.weekday IS NOT NULL
  ) s
  WHERE g.enabled;
$$;

REVOKE ALL ON FUNCTION public.golden_hour_windows(timestamptz) FROM public, anon, authenticated;

-- Le créneau qui compte pour une réclamation. Trois minutes de grâce après la
-- fin : une pub lancée à 19 h 59 se termine après 20 h et doit rester dorée.
CREATE OR REPLACE FUNCTION public.golden_hour_now(p_grace interval DEFAULT interval '3 minutes')
RETURNS TABLE (multiplier int, ad_cap int, ends timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.multiplier, w.ad_cap, w.ends
  FROM public.golden_hour_windows(now()) w
  WHERE now() >= w.starts AND now() < w.ends + p_grace
  ORDER BY w.multiplier DESC, w.ad_cap DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.golden_hour_now(interval) FROM public, anon, authenticated;

-- Ce que l'app affiche : le créneau en cours (sans la grâce) et le prochain.
CREATE OR REPLACE FUNCTION public.golden_hour_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur  record;
  nxt  record;
BEGIN
  SELECT * INTO cur FROM public.golden_hour_now(interval '0');
  SELECT w.starts, w.multiplier INTO nxt
    FROM public.golden_hour_windows(now()) w
    WHERE w.starts > now()
    ORDER BY w.starts
    LIMIT 1;
  RETURN jsonb_build_object(
    'active',          cur.multiplier IS NOT NULL,
    'multiplier',      COALESCE(cur.multiplier, 1),
    'ad_cap',          COALESCE(cur.ad_cap, 5),
    'ends_at',         cur.ends,
    'next_starts_at',  nxt.starts,
    'next_multiplier', nxt.multiplier
  );
END;
$$;

REVOKE ALL ON FUNCTION public.golden_hour_status() FROM public;
GRANT EXECUTE ON FUNCTION public.golden_hour_status() TO anon, authenticated;

-- ── claim_rewarded_ad : gain et plafond suivent l'Heure dorée ────────────────
-- Identique à seasons_monetization.sql hormis cap / reward.
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
  gh     record;
  cap    int := 5;
  reward int := 5;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE key = 'rewarded_ads' AND enabled) THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'disabled');
  END IF;

  SELECT * INTO gh FROM public.golden_hour_now();
  IF gh.multiplier IS NOT NULL THEN
    cap    := gh.ad_cap;
    reward := reward * gh.multiplier;
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

  RETURN jsonb_build_object('granted', true, 'coins', reward, 'golden', gh.multiplier IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_rewarded_ad() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_rewarded_ad() TO authenticated;

-- ── claim_coin_multiplier : seul le plafond suit l'Heure dorée ───────────────
-- Identique à coin_multiplier.sql hormis cap.
CREATE OR REPLACE FUNCTION public.claim_coin_multiplier(p_base int, p_stage int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid       uuid := auth.uid();
  today     date := (now() at time zone 'utc')::date;
  cur       int;
  cap       int := 5;
  max_base  constant int := 50;   -- hard clamp so a tampered client can't inflate
  base      int;
  grant_amt int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE key = 'rewarded_ads' AND enabled) THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'disabled');
  END IF;
  IF p_stage NOT IN (1, 2) THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'bad_stage');
  END IF;

  base := GREATEST(0, LEAST(COALESCE(p_base, 0), max_base));
  IF base = 0 THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'no_base');
  END IF;

  -- Increment: stage 1 → base (total reaches ×2), stage 2 → base×2 (total ×4).
  grant_amt := base * (CASE WHEN p_stage = 1 THEN 1 ELSE 2 END);

  cap := COALESCE((SELECT g.ad_cap FROM public.golden_hour_now() g), cap);

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
    SET balance = balance + grant_amt, updated_at = now()
    WHERE user_id = uid;

  RETURN jsonb_build_object('granted', true, 'coins', grant_amt);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_coin_multiplier(int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_coin_multiplier(int, int) TO authenticated;

-- ── Premier créneau : samedi 17 h UTC (18 h à Paris en hiver), 2 h, ×3 ───────
-- Avec sa notification, envoyée par run-campaigns au début du créneau.
DO $$
DECLARE
  cid uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.golden_hours) THEN RETURN; END IF;

  INSERT INTO public.notification_campaigns (title, body, segment, schedule, hour, weekday, enabled, i18n)
  VALUES (
    'Heure dorée ✨',
    'Pendant 2 h, chaque pub rapporte 3 fois plus de pièces. C’est maintenant !',
    '{"type":"everyone"}'::jsonb,
    'weekly', 17, 6, true,
    '{
      "fr": {"title": "Heure dorée ✨", "body": "Pendant 2 h, chaque pub rapporte 3 fois plus de pièces. C’est maintenant !"},
      "en": {"title": "Golden hour ✨", "body": "For 2 hours, every ad pays 3 times the coins. It’s on now!"},
      "es": {"title": "Hora dorada ✨", "body": "Durante 2 h, cada anuncio da el triple de monedas. ¡Es ahora!"},
      "pt": {"title": "Hora dourada ✨", "body": "Durante 2 h, cada anúncio dá o triplo de moedas. É agora!"},
      "de": {"title": "Goldene Stunde ✨", "body": "2 Stunden lang bringt jede Werbung dreimal so viele Münzen. Jetzt!"},
      "it": {"title": "Ora d’oro ✨", "body": "Per 2 ore, ogni pubblicità vale il triplo delle monete. È adesso!"}
    }'::jsonb
  )
  RETURNING id INTO cid;

  INSERT INTO public.golden_hours (weekday, hour, duration_min, multiplier, ad_cap, campaign_id)
  VALUES (6, 17, 120, 3, 10, cid);
END;
$$;
