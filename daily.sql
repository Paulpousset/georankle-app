-- ════════════════════════════════════════════════════════════════════════════
-- Daily Challenge: one seeded puzzle per UTC day per solo mode + a global streak.
-- Server-authoritative — clients READ their own results; streak advancement and
-- score writes go through the SECURITY DEFINER `complete_daily` RPC (mirrors the
-- award_solo_coins / apply_*_result pattern in economy.sql).
-- Re-runnable: every statement is idempotent.
-- daily_results cascades on profile delete, so delete_user_account needs no change.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.daily_results (
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  puzzle_date date NOT NULL,
  game_mode   text NOT NULL,
  score       int  NOT NULL,
  share_grid  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, puzzle_date, game_mode)
);

-- Global daily streak lives on the profile (one streak across all modes).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_streak      int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_best_streak int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_last_date   date;

-- ── RLS: public read powers the per-mode daily leaderboard (mirrors the
-- "Scores are viewable by everyone" policy on public.scores); writes are
-- RPC-only via complete_daily. ────────────────────────────────────────────────

ALTER TABLE public.daily_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own daily results" ON public.daily_results;
DROP POLICY IF EXISTS "public read daily results" ON public.daily_results;
CREATE POLICY "public read daily results" ON public.daily_results
  FOR SELECT USING (true);

-- Helpful index for the daily leaderboard query (date + mode, best score first).
CREATE INDEX IF NOT EXISTS daily_results_leaderboard_idx
  ON public.daily_results (puzzle_date, game_mode, score DESC);

-- ── complete_daily: upsert result (keep best) + advance the global streak ─────
-- Streak rules match the client (src/lib/daily.ts computeStreak):
--   last == today      → unchanged   (already played something today)
--   last == yesterday  → +1
--   otherwise          → reset to 1
CREATE OR REPLACE FUNCTION public.complete_daily(
  p_date  date,
  p_mode  text,
  p_score int,
  p_grid  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid         uuid := auth.uid();
  last_date   date;
  cur_streak  int;
  best_streak int;
  new_streak  int;
  cnt         int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_mode NOT IN ('classic','streak','guess','globe','regions','quiz-capital','quiz-flag') THEN
    RAISE EXCEPTION 'bad game mode';
  END IF;

  -- Upsert the result, keeping the best score for the day/mode.
  INSERT INTO public.daily_results (user_id, puzzle_date, game_mode, score, share_grid)
    VALUES (uid, p_date, p_mode, p_score, p_grid)
    ON CONFLICT (user_id, puzzle_date, game_mode) DO UPDATE
      SET score      = GREATEST(daily_results.score, EXCLUDED.score),
          share_grid = EXCLUDED.share_grid;

  -- Lock the profile row to advance the streak atomically.
  SELECT daily_last_date, daily_streak, daily_best_streak
    INTO last_date, cur_streak, best_streak
    FROM public.profiles WHERE id = uid FOR UPDATE;

  cur_streak  := COALESCE(cur_streak, 0);
  best_streak := COALESCE(best_streak, 0);

  IF last_date = p_date THEN
    new_streak := cur_streak;            -- already counted today
  ELSIF last_date = p_date - 1 THEN
    new_streak := cur_streak + 1;
  ELSE
    new_streak := 1;
  END IF;

  UPDATE public.profiles
    SET daily_streak      = new_streak,
        daily_best_streak = GREATEST(best_streak, new_streak),
        daily_last_date   = p_date
    WHERE id = uid;

  SELECT count(*) INTO cnt FROM public.daily_results
    WHERE user_id = uid AND puzzle_date = p_date;

  RETURN jsonb_build_object(
    'streak',      new_streak,
    'best_streak', GREATEST(best_streak, new_streak),
    'today_count', cnt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_daily(date, text, int, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_daily(date, text, int, text) TO authenticated;
