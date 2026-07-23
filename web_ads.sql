-- Web ads kill-switch (2026-07-22). The web client (AdSense: rewarded /
-- interstitial ad breaks + desktop side rails) is gated on this flag IN
-- ADDITION to the existing 'rewarded_ads' / 'interstitial_ads' flags, so web
-- goes live only once the AdSense site (playgeog.com) is approved —
-- independently of the mobile AdMob rollout. Created OFF; flipping `enabled`
-- from the SQL editor is the whole activation procedure (no build needed).

INSERT INTO public.feature_flags (key, enabled) VALUES
  ('web_ads', false)
ON CONFLICT (key) DO NOTHING;
