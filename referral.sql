-- referral.sql — Parrainage (referral) : la boucle de croissance virale.
--
-- Chaque compte a un code STABLE dérivé de son id (8 hex, ex. "A3F8C13E").
-- Un nouvel utilisateur peut « rentrer un code » UNE seule fois ; le parrain ET
-- le filleul reçoivent des coins. Suit exactement les patterns de
-- seasons_monetization.sql : SECURITY DEFINER, REVOKE anon, GRANT authenticated,
-- crédit via coin_wallets, kill-switch feature_flags.
--
-- À APPLIQUER en prod (MCP Supabase / SQL editor) puis régénérer database.ts.
-- Les signatures des 2 RPC sont déjà ajoutées à src/types/database.ts.

-- ── Table d'attribution ──────────────────────────────────────────────────────
-- referee_id en PK = chaque filleul ne peut être parrainé qu'une fois (idempotent
-- + anti-abus). CHECK empêche l'auto-parrainage.
CREATE TABLE IF NOT EXISTS public.referrals (
  referee_id  uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL    REFERENCES public.profiles(id) ON DELETE CASCADE,
  code        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_not_self CHECK (referrer_id <> referee_id)
);

CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals(referrer_id);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own referrals" ON public.referrals;
CREATE POLICY "read own referrals" ON public.referrals
  FOR SELECT USING ((select auth.uid()) IN (referrer_id, referee_id));
-- Écritures : uniquement via redeem_referral() (SECURITY DEFINER). Aucune
-- policy d'INSERT côté client, volontairement.

-- Kill-switch. Défaut ON : c'est de la croissance (pas de la dépense) — mais on
-- garde le levier pour couper si abus détecté.
INSERT INTO public.feature_flags (key, enabled) VALUES ('referrals', true)
  ON CONFLICT (key) DO NOTHING;

-- ── Code stable dérivé de l'id (8 hex majuscules) ────────────────────────────
CREATE OR REPLACE FUNCTION public.referral_code_for(p_user uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT upper(substr(md5(p_user::text), 1, 8)) $$;

-- ── Le filleul renvoie le code de son parrain (une seule fois) ───────────────
CREATE OR REPLACE FUNCTION public.redeem_referral(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid        uuid := auth.uid();
  v_referrer uuid;
  reward     constant int := 50;
  cap        constant int := 100;  -- max filleuls crédités par parrain (anti-ferme)
  v_count    int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE key = 'referrals' AND enabled) THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'disabled');
  END IF;

  -- Déjà parrainé ? (idempotent — chaque filleul une seule fois)
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referee_id = uid) THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'already_referred');
  END IF;

  -- Retrouver le parrain par son code
  SELECT id INTO v_referrer FROM public.profiles
    WHERE public.referral_code_for(id) = upper(p_code)
    LIMIT 1;
  IF v_referrer IS NULL THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'invalid_code');
  END IF;
  IF v_referrer = uid THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'self');
  END IF;

  SELECT count(*) INTO v_count FROM public.referrals WHERE referrer_id = v_referrer;

  INSERT INTO public.referrals (referee_id, referrer_id, code)
    VALUES (uid, v_referrer, upper(p_code))
    ON CONFLICT (referee_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'already_referred');
  END IF;

  -- Crédite le filleul
  INSERT INTO public.coin_wallets (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.coin_wallets SET balance = balance + reward, updated_at = now() WHERE user_id = uid;

  -- Crédite le parrain (dans la limite du cap anti-ferme)
  IF v_count < cap THEN
    INSERT INTO public.coin_wallets (user_id) VALUES (v_referrer) ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.coin_wallets SET balance = balance + reward, updated_at = now() WHERE user_id = v_referrer;
  END IF;

  RETURN jsonb_build_object('granted', true, 'coins', reward);
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_referral(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.redeem_referral(text) TO authenticated;

-- ── Info parrainage du caller (code + nombre de filleuls) ────────────────────
CREATE OR REPLACE FUNCTION public.get_referral_info()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid        uuid := auth.uid();
  v_count    int;
  v_referred boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT count(*) INTO v_count FROM public.referrals WHERE referrer_id = uid;
  SELECT EXISTS (SELECT 1 FROM public.referrals WHERE referee_id = uid) INTO v_referred;
  RETURN jsonb_build_object(
    'code', public.referral_code_for(uid),
    'count', v_count,
    'already_referred', v_referred
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_referral_info() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_referral_info() TO authenticated;
