-- ════════════════════════════════════════════════════════════════════════════
-- Daily quests: 3 rotating missions per UTC day, rewarded in coins.
--
-- Fully server-authoritative (mirrors award_solo_coins / complete_daily):
-- the quest pool, the day's selection, progress and the claim all live here —
-- progress is DERIVED from tables the client cannot forge (daily_results,
-- solo_coin_log, matches), so there is nothing for a cheater to write. The
-- client only localizes labels and renders what get_daily_quests() returns.
-- Re-runnable: every statement is idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Claims ledger ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.quest_claims (
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day        date NOT NULL,
  quest_id   text NOT NULL,
  reward     int  NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day, quest_id)
);

ALTER TABLE public.quest_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own quest claims" ON public.quest_claims;
CREATE POLICY "read own quest claims" ON public.quest_claims
  FOR SELECT USING ((select auth.uid()) = user_id);
-- Writes are RPC-only (claim_quest below).

-- ── Quest pool ────────────────────────────────────────────────────────────────
-- One source of truth for ids / rewards / targets. The client maps ids to
-- localized labels (src/lib/quests.ts) — adding a quest here plus one label
-- there is a complete new mission.

CREATE OR REPLACE FUNCTION public.quest_defs()
RETURNS TABLE (quest_id text, reward int, target int)
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  VALUES
    ('daily_1',     5,  1),  -- finish 1 daily challenge
    ('daily_3',     10, 3),  -- finish 3 daily challenges
    ('solo_2modes', 6,  2),  -- play 2 different solo modes
    ('solo_5games', 8,  5),  -- play 5 solo games
    ('online_play', 8,  1),  -- finish 1 online match
    ('online_win',  12, 1),  -- win 1 online match
    ('ranked_play', 10, 1),  -- finish 1 ranked match
    ('ranked_win',  15, 1)   -- win 1 ranked match
$$;

-- The day's 3 quests: a deterministic shuffle of the pool keyed on the date,
-- identical for every player (community feel, and nothing to store).
CREATE OR REPLACE FUNCTION public.todays_quest_ids(p_day date)
RETURNS SETOF text
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT quest_id FROM public.quest_defs()
  ORDER BY md5(p_day::text || quest_id)
  LIMIT 3
$$;

-- ── Progress ──────────────────────────────────────────────────────────────────
-- Derived exclusively from server-written tables. `updated_at` flips to now()
-- when a match completes (apply_*_result / finalize RPCs), which is what "today"
-- means for match quests. Bot matches count — they are part of the ranked queue.

CREATE OR REPLACE FUNCTION public.quest_progress(p_uid uuid, p_day date, p_quest_id text)
RETURNS int
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE cur int := 0;
BEGIN
  CASE p_quest_id
    WHEN 'daily_1', 'daily_3' THEN
      SELECT count(*) INTO cur FROM public.daily_results
        WHERE user_id = p_uid AND puzzle_date = p_day;
    WHEN 'solo_2modes' THEN
      SELECT count(DISTINCT game_mode) INTO cur FROM public.solo_coin_log
        WHERE user_id = p_uid AND day = p_day;
    WHEN 'solo_5games' THEN
      SELECT COALESCE(sum(count), 0) INTO cur FROM public.solo_coin_log
        WHERE user_id = p_uid AND day = p_day;
    WHEN 'online_play' THEN
      SELECT count(*) INTO cur FROM public.matches m
        WHERE m.status = 'completed' AND m.updated_at::date = p_day
          AND (m.player1_id = p_uid OR m.player2_id = p_uid
               OR EXISTS (SELECT 1 FROM public.match_players mp
                          WHERE mp.match_id = m.id AND mp.player_id = p_uid));
    WHEN 'online_win' THEN
      SELECT count(*) INTO cur FROM public.matches m
        WHERE m.status = 'completed' AND m.updated_at::date = p_day
          AND ((m.player1_id = p_uid AND m.p1_rounds_won > m.p2_rounds_won)
            OR (m.player2_id = p_uid AND m.p2_rounds_won > m.p1_rounds_won));
    WHEN 'ranked_play' THEN
      SELECT count(*) INTO cur FROM public.matches m
        WHERE m.status = 'completed' AND m.is_ranked AND m.updated_at::date = p_day
          AND (m.player1_id = p_uid OR m.player2_id = p_uid);
    WHEN 'ranked_win' THEN
      SELECT count(*) INTO cur FROM public.matches m
        WHERE m.status = 'completed' AND m.is_ranked AND m.updated_at::date = p_day
          AND ((m.player1_id = p_uid AND m.p1_rounds_won > m.p2_rounds_won)
            OR (m.player2_id = p_uid AND m.p2_rounds_won > m.p1_rounds_won));
    ELSE
      cur := 0;
  END CASE;
  RETURN cur;
END;
$$;

-- ── Read API ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_daily_quests()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid     uuid := auth.uid();
  today   date := (now() AT TIME ZONE 'utc')::date;
  result  jsonb := '[]'::jsonb;
  q       record;
  cur     int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  FOR q IN
    SELECT d.quest_id, d.reward, d.target
      FROM public.quest_defs() d
      WHERE d.quest_id IN (SELECT public.todays_quest_ids(today))
      ORDER BY md5(today::text || d.quest_id)
  LOOP
    cur := public.quest_progress(uid, today, q.quest_id);
    result := result || jsonb_build_object(
      'id',      q.quest_id,
      'reward',  q.reward,
      'target',  q.target,
      'current', LEAST(cur, q.target),
      'done',    cur >= q.target,
      'claimed', EXISTS (SELECT 1 FROM public.quest_claims c
                         WHERE c.user_id = uid AND c.day = today AND c.quest_id = q.quest_id)
    );
  END LOOP;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_daily_quests() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_quests() TO authenticated;

-- ── Claim ─────────────────────────────────────────────────────────────────────
-- Re-validates everything server-side; the quest_claims PK makes a double claim
-- (double tap, two devices) a no-op.

CREATE OR REPLACE FUNCTION public.claim_quest(p_quest_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid    uuid := auth.uid();
  today  date := (now() AT TIME ZONE 'utc')::date;
  def    record;
  cur    int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT d.reward, d.target INTO def
    FROM public.quest_defs() d
    WHERE d.quest_id = p_quest_id
      AND d.quest_id IN (SELECT public.todays_quest_ids(today));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_todays_quest');
  END IF;

  cur := public.quest_progress(uid, today, p_quest_id);
  IF cur < def.target THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'incomplete',
                              'current', cur, 'target', def.target);
  END IF;

  INSERT INTO public.quest_claims (user_id, day, quest_id, reward)
    VALUES (uid, today, p_quest_id, def.reward)
    ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'already_claimed');
  END IF;

  INSERT INTO public.coin_wallets (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.coin_wallets
    SET balance = balance + def.reward, updated_at = now()
    WHERE user_id = uid;

  RETURN jsonb_build_object('claimed', true, 'coins_awarded', def.reward);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_quest(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_quest(text) TO authenticated;
