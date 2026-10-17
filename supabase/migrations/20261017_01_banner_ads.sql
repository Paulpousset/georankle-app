-- Mobile ads kill-switches (2026-10-17), both created OFF.
--  · banner_ads: anchored AdMob banner at the bottom of the main menu and
--    results screens (mobile only, never in a game).
--  · interstitial_ads_v2: interstitial on game exit, at most one per 12 min of
--    play. A NEW key on purpose: older JS bundles read 'interstitial_ads' and
--    would serve Google TEST ads, so that old key stays OFF.
-- The AdMob SDK is already in the 5.7.0 binary, so this ships by OTA; flipping
-- `enabled` is the whole activation procedure.

INSERT INTO public.feature_flags (key, enabled) VALUES
  ('banner_ads', false),
  ('interstitial_ads_v2', false)
ON CONFLICT (key) DO NOTHING;
