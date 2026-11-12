-- H5 Games Ads (2026-11-03). Allume les ad breaks web (pub récompensée +
-- interstitiel entre deux parties, Ad Placement API) sur playgeog.com/play
-- SANS les rails display : utile si Google accepte le jeu dans le programme
-- H5 Games Ads avant d'approuver le site AdSense. 'web_ads' continue de tout
-- allumer (ad breaks + rails). Créé à false : passer `enabled` à true depuis
-- l'éditeur SQL est toute la procédure (effet en ~5 min, cache des flags).
--
-- ⚠️ L'interstitiel suit aussi 'interstitial_ads_v2' (le flag des
-- interstitiels mobiles) et la pub récompensée 'rewarded_ads'.

INSERT INTO public.feature_flags (key, enabled) VALUES
  ('h5_games_ads', false)
ON CONFLICT (key) DO NOTHING;
