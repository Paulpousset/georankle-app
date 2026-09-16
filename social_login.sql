-- Connexion sociale Apple / Google (2026-09-05). Les boutons « Continuer avec
-- Apple / Google » de l'écran Auth sont gatés sur ces deux flags, créés OFF :
-- on ne les allume qu'une fois les consoles configurées (App ID Apple +
-- provider Supabase pour l'un ; clients OAuth Google Cloud + provider Supabase
-- + EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID pour l'autre). Flipper `enabled` depuis
-- l'éditeur SQL est toute la procédure d'activation (aucun build nécessaire),
-- et chaque flag s'active indépendamment de l'autre.

INSERT INTO public.feature_flags (key, enabled) VALUES
  ('social_login_apple', false),
  ('social_login_google', false)
ON CONFLICT (key) DO NOTHING;
