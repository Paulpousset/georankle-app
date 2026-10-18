-- ════════════════════════════════════════════════════════════════════════════
-- Mise à jour obligatoire : version minimale de l'app, par plateforme.
-- Au lancement (et à chaque retour au premier plan), l'app lit sa ligne ; si la
-- version installée est plus ancienne, un écran bloquant renvoie vers le store.
-- Lisible par tous (anon compris : le contrôle passe avant toute connexion),
-- écrite uniquement par api/hq.mjs avec la clé service role (onglet Déploiements
-- du HQ). '0.0.0' = aucune contrainte.
--
-- Re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_min_version (
  platform    text        PRIMARY KEY CHECK (platform IN ('ios', 'android')),
  min_version text        NOT NULL DEFAULT '0.0.0' CHECK (min_version ~ '^\d{1,4}(\.\d{1,4}){0,2}$'),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_min_version ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_min_version FROM anon, authenticated;
GRANT SELECT ON public.app_min_version TO anon, authenticated;

DROP POLICY IF EXISTS app_min_version_read ON public.app_min_version;
CREATE POLICY app_min_version_read ON public.app_min_version FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.app_min_version (platform, min_version) VALUES
  ('ios', '0.0.0'),
  ('android', '0.0.0')
ON CONFLICT (platform) DO NOTHING;
