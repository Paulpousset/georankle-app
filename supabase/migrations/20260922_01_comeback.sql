-- Bonus de retour : un joueur absent 7 jours ou plus reçoit des pièces à sa
-- réouverture, une fois par fenêtre de 7 jours. Même patron que claim_quest :
-- SECURITY DEFINER, ledger idempotent, crédit inline dans coin_wallets,
-- kill-switch feature_flags.
--
-- Le client (src/lib/comeback.ts) appelle claim_comeback() AVANT
-- touch_last_seen() : la fonction lit profiles.last_seen pour mesurer
-- l'absence, puis le rafraîchit elle-même, donc deux appels concurrents ne
-- créditent pas deux fois (verrou de ligne sur profiles).

CREATE TABLE IF NOT EXISTS public.comeback_claims (
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  days_away  int NOT NULL,
  coins      int NOT NULL,
  PRIMARY KEY (user_id, claimed_at)
);

ALTER TABLE public.comeback_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own comeback claims" ON public.comeback_claims;
CREATE POLICY "read own comeback claims" ON public.comeback_claims
  FOR SELECT USING ((select auth.uid()) = user_id);
-- Écritures : uniquement via claim_comeback().

INSERT INTO public.feature_flags (key, enabled) VALUES ('comeback_bonus', true)
  ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_comeback()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid        uuid := auth.uid();
  min_days   constant int := 7;
  reward     constant int := 30;
  seen       timestamptz;
  days       int;
  last_claim timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF NOT COALESCE((SELECT enabled FROM public.feature_flags WHERE key = 'comeback_bonus'), false) THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'disabled');
  END IF;

  -- Verrou : deux appareils qui rouvrent en même temps se sérialisent ici.
  SELECT last_seen INTO seen FROM public.profiles WHERE id = uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('granted', false, 'reason', 'no_profile'); END IF;

  -- Première visite jamais enregistrée : rien à récompenser, on date le profil.
  IF seen IS NULL THEN
    UPDATE public.profiles SET last_seen = now() WHERE id = uid;
    RETURN jsonb_build_object('granted', false, 'reason', 'first_visit');
  END IF;

  days := floor(extract(epoch FROM (now() - seen)) / 86400)::int;
  IF days < min_days THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'not_away', 'days_away', days);
  END IF;

  SELECT max(claimed_at) INTO last_claim FROM public.comeback_claims WHERE user_id = uid;
  IF last_claim IS NOT NULL AND last_claim > now() - (min_days || ' days')::interval THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'already_claimed');
  END IF;

  INSERT INTO public.comeback_claims (user_id, days_away, coins) VALUES (uid, days, reward);

  INSERT INTO public.coin_wallets (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.coin_wallets
    SET balance = balance + reward, updated_at = now()
    WHERE user_id = uid;

  -- L'absence est consommée : le prochain appel voit un profil vu à l'instant.
  UPDATE public.profiles SET last_seen = now() WHERE id = uid;

  RETURN jsonb_build_object('granted', true, 'coins', reward, 'days_away', days);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_comeback() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_comeback() TO authenticated;
