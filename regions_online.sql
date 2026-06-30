-- Online "Défis Pays" modes — the map game (`regions`) and the CARRÉ/DUO/CASH
-- country quizzes (`challenge`).
--
-- The matches.game_mode CHECK constraint originally allowed only the five launch
-- modes (classic / streak / versus / globe / guess). Widen it so:
--   • a `regions` match (country + division level chosen at create time, stored
--     in game_data) can be persisted — both as a casual/custom round and inside a
--     ranked sequence; and
--   • a `challenge` match (a country quiz: game_data.challengeId + seed + count)
--     can be persisted.
-- Idempotent and reversible — it only ADDS values to the allowed set; no row is
-- touched and existing modes keep working.
--
-- Apply to the GeoGames project (ref: exwfggaytrywnfzcqpel) BEFORE shipping the
-- client build that exposes the online regions / challenge modes. Without it,
-- creating either match fails the CHECK.

ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_game_mode_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_game_mode_check
  CHECK (game_mode = ANY (ARRAY[
    'classic'::text,
    'streak'::text,
    'versus'::text,
    'globe'::text,
    'guess'::text,
    'regions'::text,
    'challenge'::text
  ]));
