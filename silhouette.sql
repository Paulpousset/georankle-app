-- ════════════════════════════════════════════════════════════════════════════
-- « Silhouette » (silhouette) — server-side enablement.
-- Widens matches.game_mode CHECK (supersedes higherlower.sql) and the
-- complete_daily / award_solo_coins whitelists (authoritative bodies live in
-- daily.sql and economy.sql — keep in sync). Re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_game_mode_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_game_mode_check
  CHECK (game_mode = ANY (ARRAY[
    'classic'::text,
    'streak'::text,
    'versus'::text,
    'globe'::text,
    'guess'::text,
    'regions'::text,
    'challenge'::text,
    'higherlower'::text,
    'silhouette'::text
  ]));

-- complete_daily / award_solo_coins re-deployed with 'silhouette' added to
-- their IN (...) whitelists — see daily.sql / economy.sql for the bodies.
