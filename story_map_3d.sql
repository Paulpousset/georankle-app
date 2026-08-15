-- Carte Histoire 3D (2026-07-25) : kill-switch du fond de carte pré-rendu.
--   story_map_3d : les bandes de biomes de StoryMap = images webp rendues dans
--                  Blender (assets/story/band_*.webp) + médaillons sprites 3D.
--                  OFF = painter SVG historique (drawFeature/drawScatter).
-- Créé OFF ; flipper `enabled` depuis l'éditeur SQL est TOUTE la procédure
-- d'activation (aucun build requis). Le client fail-closed (featureFlags.ts).

INSERT INTO public.feature_flags (key, enabled) VALUES
  ('story_map_3d', false)
ON CONFLICT (key) DO NOTHING;
