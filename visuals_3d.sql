-- Visuels 3D (2026-07-24) : kill-switches du chantier "visuels pro".
--   avatar_3d     : avatars cosmétiques = couches 3D pré-rendues (compositeur
--                   WorldAvatar3D) + preview boutique/éditeur en 3D temps réel.
--                   Sans le pack d'assets rendu (assets/cosmetics/), le client
--                   retombe de lui-même sur le SVG — le flag peut rester OFF
--                   tant que le rendu Blender n'est pas shippé.
--   globe_3d      : globes de gameplay (Trouve le pays, Frontières) en WebGL
--                   three.js (Terre photoréaliste jour / nuit selon le thème).
--                   OFF = builder Canvas 2D historique.
--   menu_globe_3d : globe décoratif du menu principal en 3D temps réel (monté
--                   en différé). OFF = rendu statique/SVG actuel.
-- Créés OFF ; flipper `enabled` depuis l'éditeur SQL est TOUTE la procédure
-- d'activation (aucun build requis). Le client fail-closed (featureFlags.ts).

INSERT INTO public.feature_flags (key, enabled) VALUES
  ('avatar_3d', false),
  ('globe_3d', false),
  ('menu_globe_3d', false)
ON CONFLICT (key) DO NOTHING;
