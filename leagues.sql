-- ════════════════════════════════════════════════════════════════════════════
-- leagues.sql — Ligues entre amis (groupes privés type "Phrazle/Wordle groups").
--
-- Un joueur crée une ligue et partage son code d'invitation ; chaque jour, 3
-- modes sont tirés au sort de façon DÉTERMINISTE (même tirage pour tout le
-- monde, même algorithme FNV-1a que src/lib/league.ts — les deux doivent rester
-- synchronisés). Les membres jouent les défis quotidiens existants
-- (daily_results, RPC complete_daily inchangée) ; la ligue ne fait qu'AGRÉGER
-- ces scores en classements Jour / Mois / Total.
--
-- Patterns suivis : referral.sql / daily.sql — écritures via RPC SECURITY
-- DEFINER uniquement, RLS lecture-seule, REVOKE anon, search_path épinglé.
-- Re-runnable : chaque statement est idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leagues (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 30),
  owner_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invite_code text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.league_members (
  league_id  uuid NOT NULL REFERENCES public.leagues(id)  ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, user_id)
);

-- get_my_leagues() filtre par user_id ; la PK couvre déjà le sens league→users.
CREATE INDEX IF NOT EXISTS league_members_user_idx ON public.league_members(user_id);

-- ── Helper anti-récursion RLS (même leçon que ffa_rls_recursion_fix.sql) ─────
CREATE OR REPLACE FUNCTION public.is_league_member(p_league uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.league_members
    WHERE league_id = p_league AND user_id = p_user
  )
$$;

REVOKE ALL ON FUNCTION public.is_league_member(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_league_member(uuid, uuid) TO authenticated;

-- ── RLS : lecture réservée aux membres ; écritures via RPC uniquement ─────────

ALTER TABLE public.leagues        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read their leagues" ON public.leagues;
CREATE POLICY "members read their leagues" ON public.leagues
  FOR SELECT USING (public.is_league_member(id, (select auth.uid())));

DROP POLICY IF EXISTS "members read fellow members" ON public.league_members;
CREATE POLICY "members read fellow members" ON public.league_members
  FOR SELECT USING (public.is_league_member(league_id, (select auth.uid())));

-- ── Tirage déterministe des 3 modes du jour ──────────────────────────────────
-- FNV-1a 32 bits, IDENTIQUE à seedFor/leagueHash côté client (bigint mod 2^32
-- ≡ arithmétique signée 32 bits de Math.imul + >>> 0). Entrées ASCII only.
CREATE OR REPLACE FUNCTION public.league_fnv1a(p_input text)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  h bigint := 2166136261;  -- 0x811c9dc5
  i int;
BEGIN
  FOR i IN 1..length(p_input) LOOP
    h := h # ascii(substring(p_input FROM i FOR 1));
    h := (h * 16777619) % 4294967296;  -- * 0x01000193 mod 2^32
  END LOOP;
  RETURN h;
END;
$$;

REVOKE ALL ON FUNCTION public.league_fnv1a(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.league_fnv1a(text) TO authenticated;

-- L'ORDRE du pool est FIGÉ à jamais (miroir exact de LEAGUE_MODE_POOL dans
-- src/lib/league.ts) — le changer casserait la parité client/serveur sur tout
-- l'historique. Tirage : 3 passes de Fisher-Yates partiel seedé par la date.
CREATE OR REPLACE FUNCTION public.league_daily_modes(p_date date)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  pool   text[] := ARRAY['globe','regions','guess','borders','silhouette',
                         'higherlower','classic','streak','quiz-capital','quiz-flag'];
  picked text[] := ARRAY[]::text[];
  k int;
  idx int;
BEGIN
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

-- ── Normalisation des scores quotidiens sur 0-1000 ───────────────────────────
-- Les modes n'ont pas la même échelle (classic = %, streak/higherlower =
-- longueur de série, le reste est déjà sur 0-1000) : sans normalisation le
-- cumul de ligue sur-pondérerait certains modes.
CREATE OR REPLACE FUNCTION public.league_norm_score(p_mode text, p_score int)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_mode = 'classic'                     THEN LEAST(GREATEST(p_score, 0), 100) * 10
    WHEN p_mode IN ('streak', 'higherlower')    THEN LEAST(GREATEST(p_score, 0), 40) * 25
    ELSE LEAST(GREATEST(p_score, 0), 1000)
  END
$$;

REVOKE ALL ON FUNCTION public.league_norm_score(text, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.league_norm_score(text, int) TO authenticated;

-- ── create_league : créer + devenir owner/membre ─────────────────────────────
CREATE OR REPLACE FUNCTION public.create_league(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid         uuid := auth.uid();
  v_name      text := btrim(coalesce(p_name, ''));
  v_id        uuid;
  v_code      text;
  max_leagues constant int := 20;  -- adhésions max par joueur (anti-spam)
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF char_length(v_name) < 1 OR char_length(v_name) > 30 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_name');
  END IF;
  IF (SELECT count(*) FROM public.league_members WHERE user_id = uid) >= max_leagues THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_many_leagues');
  END IF;

  -- Code aléatoire 8 hex ; boucle de secours sur l'unicité (collision ~jamais).
  FOR i IN 1..5 LOOP
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.leagues WHERE invite_code = v_code);
  END LOOP;

  INSERT INTO public.leagues (name, owner_id, invite_code)
    VALUES (v_name, uid, v_code)
    RETURNING id INTO v_id;
  INSERT INTO public.league_members (league_id, user_id) VALUES (v_id, uid);

  RETURN jsonb_build_object('ok', true, 'league_id', v_id, 'name', v_name, 'code', v_code);
END;
$$;

REVOKE ALL ON FUNCTION public.create_league(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_league(text) TO authenticated;

-- ── join_league : rejoindre par code d'invitation ────────────────────────────
CREATE OR REPLACE FUNCTION public.join_league(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid         uuid := auth.uid();
  v_league    uuid;
  v_name      text;
  v_count     int;
  max_members constant int := 50;
  max_leagues constant int := 20;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT id, name INTO v_league, v_name
    FROM public.leagues WHERE invite_code = upper(btrim(coalesce(p_code, '')));
  IF v_league IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;
  IF EXISTS (SELECT 1 FROM public.league_members WHERE league_id = v_league AND user_id = uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_member',
                              'league_id', v_league, 'name', v_name);
  END IF;
  IF (SELECT count(*) FROM public.league_members WHERE user_id = uid) >= max_leagues THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_many_leagues');
  END IF;
  SELECT count(*) INTO v_count FROM public.league_members WHERE league_id = v_league;
  IF v_count >= max_members THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'full');
  END IF;

  INSERT INTO public.league_members (league_id, user_id)
    VALUES (v_league, uid)
    ON CONFLICT (league_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'league_id', v_league, 'name', v_name);
END;
$$;

REVOKE ALL ON FUNCTION public.join_league(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.join_league(text) TO authenticated;

-- ── leave_league : quitter (transfert d'owner, suppression si vide) ──────────
CREATE OR REPLACE FUNCTION public.leave_league(p_league uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid       uuid := auth.uid();
  v_owner   uuid;
  v_next    uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  DELETE FROM public.league_members WHERE league_id = p_league AND user_id = uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_member');
  END IF;

  SELECT owner_id INTO v_owner FROM public.leagues WHERE id = p_league;
  IF v_owner = uid THEN
    -- L'owner part : promeut le plus ancien membre restant, sinon supprime.
    SELECT user_id INTO v_next FROM public.league_members
      WHERE league_id = p_league ORDER BY joined_at ASC LIMIT 1;
    IF v_next IS NULL THEN
      DELETE FROM public.leagues WHERE id = p_league;
      RETURN jsonb_build_object('ok', true, 'deleted', true);
    END IF;
    UPDATE public.leagues SET owner_id = v_next WHERE id = p_league;
  END IF;

  RETURN jsonb_build_object('ok', true, 'deleted', false);
END;
$$;

REVOKE ALL ON FUNCTION public.leave_league(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.leave_league(uuid) TO authenticated;

-- ── get_my_leagues : mes ligues + nb de membres (une seule requête) ──────────
CREATE OR REPLACE FUNCTION public.get_my_leagues()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(sub) ORDER BY sub.created_at DESC)
    FROM (
      SELECT l.id, l.name, l.invite_code AS code, l.owner_id, l.created_at,
             (SELECT count(*) FROM public.league_members m
               WHERE m.league_id = l.id)::int AS member_count
      FROM public.league_members lm
      JOIN public.leagues l ON l.id = lm.league_id
      WHERE lm.user_id = uid
    ) sub
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_leagues() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_leagues() TO authenticated;

-- ── league_leaderboard : classement Jour / Mois / Total ──────────────────────
-- Agrège les daily_results des membres, restreints aux 3 modes tirés pour
-- CHAQUE date (league_daily_modes), scores normalisés 0-1000. LEFT JOIN pour
-- que chaque membre apparaisse même à 0 point (la liste des membres EST le
-- classement). 'total' démarre à la création de la ligue.
CREATE OR REPLACE FUNCTION public.league_leaderboard(p_league uuid, p_period text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid       uuid := auth.uid();
  v_start   date;
  v_end     date := current_date;
  v_created date;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.is_league_member(p_league, uid) THEN
    RAISE EXCEPTION 'not a member';
  END IF;

  SELECT created_at::date INTO v_created FROM public.leagues WHERE id = p_league;
  v_start := CASE p_period
    WHEN 'day'   THEN current_date
    WHEN 'month' THEN date_trunc('month', current_date)::date
    WHEN 'total' THEN v_created
  END;
  IF v_start IS NULL THEN RAISE EXCEPTION 'bad period'; END IF;
  -- Jamais avant la création de la ligue : sans ce clamp, « mois » comptait les
  -- daily joués avant que la ligue existe (et dépassait « total »).
  v_start := GREATEST(v_start, v_created);

  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(sub) ORDER BY sub.total DESC, sub.username ASC)
    FROM (
      SELECT lm.user_id,
             p.username,
             p.avatar_config,
             p.avatar_url,
             COALESCE(SUM(public.league_norm_score(dr.game_mode, dr.score)), 0)::int AS total,
             COUNT(dr.score)::int AS played
      FROM public.league_members lm
      JOIN public.profiles p ON p.id = lm.user_id
      LEFT JOIN public.daily_results dr
        ON dr.user_id = lm.user_id
       AND dr.puzzle_date BETWEEN v_start AND v_end
       AND dr.game_mode = ANY (public.league_daily_modes(dr.puzzle_date))
      WHERE lm.league_id = p_league
      GROUP BY lm.user_id, p.username, p.avatar_config, p.avatar_url
    ) sub
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.league_leaderboard(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.league_leaderboard(uuid, text) TO authenticated;
