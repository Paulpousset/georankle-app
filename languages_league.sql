-- ✅ APPLIQUÉ EN PROD le 2026-08-16 via Supabase MCP (migration « languages_league_pool_v2 »).
-- ════════════════════════════════════════════════════════════════════════════
-- « Langues » — PHASE 5 : entrée dans le tirage des Ligues.
--
-- POURQUOI UN POOL VERSIONNÉ PAR DATE (et pas un simple ajout) :
-- le tirage est `fnv1a(...) % array_length(pool)`. Passer le pool de 10 à 11
-- entrées transforme tous les `% 10` en `% 11` — Y COMPRIS pour les dates
-- passées. Or league_leaderboard fait passer les lignes historiques de
-- daily_results par league_daily_modes(puzzle_date) : les classements « mois »
-- et « total » de TOUS les joueurs seraient réécrits en silence.
--
-- On date donc la bascule : avant 2026-09-15 le tirage v1 (10 modes) est
-- rendu à l'identique, à partir de cette date le tirage v2 (11 modes).
--
-- Effet de bord bienvenu : tant que la date n'est pas atteinte, ancien client,
-- nouveau client et serveur calculent tous le MÊME tirage v1 → le SQL et le
-- build applicatif peuvent sortir dans n'importe quel ordre, et les joueurs qui
-- tardent à se mettre à jour se rattrapent tout seuls.
--
-- ⚠️ MIROIR EXACT de leaguePoolFor() / LEAGUE_POOL_V2_FROM dans
-- src/lib/league.ts. Les deux se modifient ensemble ou pas du tout.
-- Re-jouable.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Tirage quotidien, pool versionné ─────────────────────────────────────
-- Reste IMMUTABLE : la date de bascule est un littéral, jamais current_date.
-- Passer la fonction en STABLE casserait la planification de league_leaderboard.
CREATE OR REPLACE FUNCTION public.league_daily_modes(p_date date)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  pool   text[];
  picked text[] := ARRAY[]::text[];
  k int;
  idx int;
BEGIN
  -- v1 : FIGÉ à jamais. v2 : v1 dans le MÊME ordre + les nouveautés en queue.
  IF p_date >= DATE '2026-09-15' THEN
    pool := ARRAY['globe','regions','guess','borders','silhouette',
                  'higherlower','classic','streak','quiz-capital','quiz-flag',
                  'languages'];
  ELSE
    pool := ARRAY['globe','regions','guess','borders','silhouette',
                  'higherlower','classic','streak','quiz-capital','quiz-flag'];
  END IF;

  FOR k IN 0..2 LOOP
    idx := (public.league_fnv1a(to_char(p_date, 'YYYY-MM-DD') || ':league:' || k::text)
            % array_length(pool, 1))::int + 1;
    picked := picked || pool[idx];
    pool := pool[1:idx-1] || pool[idx+1:array_length(pool, 1)];
  END LOOP;
  RETURN picked;
END;
$$;

REVOKE ALL ON FUNCTION public.league_daily_modes(date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.league_daily_modes(date) TO authenticated;

-- ── 2) Normalisation du score de ligue ──────────────────────────────────────
-- Le quotidien « Langues » rapporte des POINTS bruts (DUO 1 / CARRÉ 3 / CASH 5
-- sur 10 questions, soit 50 au maximum), pas un score sur 1000. Sans ce bras, la
-- branche ELSE le plafonnerait à 50/1000 : le mode pèserait vingt fois moins
-- qu'un globe dans le classement de ligue.
--
-- ⚠️ Le facteur 20 est COUPLÉ à LANGUAGES_QUESTIONS_SOLO = 10 (src/lib/languages.ts,
-- verrouillé par un test). Changer la longueur du quotidien impose de changer ce
-- 50 en même temps.
--
-- Pas de rétroactivité à craindre ici : il n'existe aucun historique 'languages'.
CREATE OR REPLACE FUNCTION public.league_norm_score(p_mode text, p_score int)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_mode = 'classic'                     THEN LEAST(GREATEST(p_score, 0), 100) * 10
    WHEN p_mode IN ('streak', 'higherlower')    THEN LEAST(GREATEST(p_score, 0), 40) * 25
    WHEN p_mode = 'languages'                   THEN LEAST(GREATEST(p_score, 0), 50) * 20
    ELSE LEAST(GREATEST(p_score, 0), 1000)
  END
$$;

REVOKE ALL ON FUNCTION public.league_norm_score(text, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.league_norm_score(text, int) TO authenticated;

-- ── Vérification de parité (à lancer après application) ─────────────────────
--   SELECT public.league_daily_modes('2026-07-23');  -- doit rester {quiz-capital,classic,globe}
--   SELECT public.league_daily_modes('2026-09-14');  -- dernier jour en v1
--   SELECT public.league_daily_modes('2026-09-15');  -- premier jour en v2
-- et comparer les deux dernières à leagueModesFor() côté TS
-- (src/lib/__tests__/league.test.ts fige les mêmes vecteurs).
