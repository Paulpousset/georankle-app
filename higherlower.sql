-- ════════════════════════════════════════════════════════════════════════════
-- « Plus ou Moins » (higherlower) — server-side enablement.
--
-- 1. Widens matches.game_mode CHECK so higherlower matches can be created
--    (supersedes the list in regions_online.sql).
-- 2. Adds 'higherlower' to the complete_daily mode whitelist (function body
--    lives in daily.sql — keep both in sync).
-- 3. Widens the award_solo_coins whitelist to EVERY solo mode. It previously
--    only allowed the five launch modes, so regions / quiz-capital / quiz-flag
--    solo runs could never earn coins (nor count toward the solo quests) once
--    their screens start calling it. Function body lives in economy.sql.
-- Re-runnable.
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
    'higherlower'::text
  ]));

-- complete_daily / award_solo_coins: re-deployed with widened whitelists —
-- the authoritative bodies live in daily.sql and economy.sql; this migration
-- applies the same CREATE OR REPLACE with the updated IN (...) lists.
