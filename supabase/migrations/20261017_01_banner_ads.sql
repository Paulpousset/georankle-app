-- Banner ads kill-switch (2026-10-17). Anchored AdMob banner at the bottom of
-- the main menu and results screens (mobile only). Created OFF; flipping
-- `enabled` from the SQL editor is the whole activation procedure (no build
-- needed once a build carrying the banner is live).

INSERT INTO public.feature_flags (key, enabled) VALUES
  ('banner_ads', false)
ON CONFLICT (key) DO NOTHING;
