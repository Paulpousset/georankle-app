-- Backend performance hardening (Supabase project `GeoGames` / `exwfggaytrywnfzcqpel`)
-- Re-runnable companion to the P1–P3 plan in SECURITY_HARDENING.md.
-- Applied as migrations: perf_index_unindexed_fkeys, perf_rls_initplan_select_auth_uid.
-- Safe to re-run: indexes use IF NOT EXISTS; ALTER POLICY is idempotent.

-- ---------------------------------------------------------------------------
-- P1 — Index every foreign key flagged by advisor `unindexed_foreign_keys`.
-- friends.user_id1 is already covered by the leading column of the composite
-- unique index friends_user_id1_user_id2_key, so only user_id2 needs one.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_friends_user_id2
  ON public.friends(user_id2);
CREATE INDEX IF NOT EXISTS idx_matches_player1
  ON public.matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_matches_player2
  ON public.matches(player2_id);
CREATE INDEX IF NOT EXISTS idx_scores_user
  ON public.scores(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_campaigns_created_by
  ON public.notification_campaigns(created_by);
CREATE INDEX IF NOT EXISTS idx_notification_log_campaign
  ON public.notification_log(campaign_id);

-- ---------------------------------------------------------------------------
-- P2 — Stop per-row re-evaluation of auth.uid() in RLS (advisor
-- auth_rls_initplan). Wrapping the call in a scalar subquery makes the planner
-- evaluate it once (initplan) instead of once per row. Semantics are identical.
-- ALTER POLICY is atomic and metadata-only: no window where the policy is absent.
-- ---------------------------------------------------------------------------

-- coin_wallets
ALTER POLICY "read own wallet" ON public.coin_wallets
  USING ((select auth.uid()) = user_id);

-- friends
ALTER POLICY "Users can delete friends" ON public.friends
  USING (((select auth.uid()) = user_id1) OR ((select auth.uid()) = user_id2));
ALTER POLICY "Users can insert friendship requests" ON public.friends
  WITH CHECK ((select auth.uid()) = user_id1);
ALTER POLICY "Users can update their friendship status" ON public.friends
  USING (((select auth.uid()) = user_id1) OR ((select auth.uid()) = user_id2));
ALTER POLICY "Users can view their friends" ON public.friends
  USING (((select auth.uid()) = user_id1) OR ((select auth.uid()) = user_id2));

-- matches
ALTER POLICY "Anyone can view public or their own matches" ON public.matches
  USING ((is_public = true) OR ((select auth.uid()) = player1_id) OR ((select auth.uid()) = player2_id));
ALTER POLICY "Users can create matches" ON public.matches
  WITH CHECK (((select auth.uid()) = player1_id) OR ((select auth.uid()) = player2_id));
ALTER POLICY "Users can update matches they are in or join public ones" ON public.matches
  USING (((select auth.uid()) = player1_id) OR ((select auth.uid()) = player2_id)
         OR ((is_public = true) AND (status = 'waiting'::text) AND (player2_id IS NULL)));

-- profiles
ALTER POLICY "Users can insert their own profile" ON public.profiles
  WITH CHECK ((select auth.uid()) = id);
ALTER POLICY "Users can update own profile" ON public.profiles
  USING ((select auth.uid()) = id);

-- scores
ALTER POLICY "Users can insert their own scores" ON public.scores
  WITH CHECK ((select auth.uid()) = user_id);

-- solo_coin_log
ALTER POLICY "read own solo log" ON public.solo_coin_log
  USING ((select auth.uid()) = user_id);

-- user_cosmetics
ALTER POLICY "read own cosmetics" ON public.user_cosmetics
  USING ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- P3 — Unused index: NO ACTION (see SECURITY_HARDENING.md). The only index the
-- advisor flags as unused is cron_run_log_job_time_idx, created in B5 today; it
-- backs the hourly cron-staleness alert query and is unused only because that
-- query has not run yet. idx_profiles_last_seen (named in the original draft) is
-- actually in use (idx_scan > 0) and is kept. The six P1 indexes above will also
-- transiently appear as "unused" until the first FK lookup hits them.
-- ---------------------------------------------------------------------------
