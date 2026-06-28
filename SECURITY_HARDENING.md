# Backend security hardening (Supabase project `GeoGames` / `exwfggaytrywnfzcqpel`)

Status of the B1–B5 plan. Applied changes are versioned as migrations; the SQL
also lives in the re-runnable `*.sql` files in this folder.

---

## B1 — Ranked / online anti-cheat · HIGH · ✅ DONE

`apply_ranked_result` / `apply_online_result` (both `SECURITY DEFINER`) were
already well-built: they re-check the caller is a participant, that the series
is finished, derive the winner **server-side** from `matches.p1_rounds_won /
p2_rounds_won`, guard idempotency with `rating_applied` / `coins_awarded`, and
take a `FOR UPDATE` row lock.

The real hole was their **inputs**: `authenticated` held a table-wide `UPDATE`
grant on `public.matches`, so a participant could
`UPDATE matches SET p1_rounds_won = 99` (claim a win) or reset
`rating_applied = false` / `coins_awarded = false` and re-call the RPC to **farm
ELO + coins without limit**.

**Fix** (migration `harden_matches_column_grants`, also in
`server_authoritative.sql`): revoke the table-wide `UPDATE` and re-grant only the
columns the client legitimately writes:

```sql
REVOKE UPDATE ON public.matches FROM authenticated, anon;
GRANT UPDATE (status, player2_id, updated_at, current_round,
              p1_current_score, p2_current_score,
              p1_finished_round, p2_finished_round)
  ON public.matches TO authenticated;
```

`p1_rounds_won`, `p2_rounds_won`, `rating_applied`, `coins_awarded`, `is_ranked`,
`best_of`, `game_data`, … are now server-only. The `SECURITY DEFINER` RPCs run as
the table owner and bypass column grants, so server-side writes still work. The
client never wrote those columns (verified: the only client `UPDATE`s on
`matches` are join `{player2_id,status}`, cancel `{status}`, and live in-round
score sync) — so no gameplay regression.

**Verification** (all pass, run via SQL against prod, no data mutated):

| Test | Expected | Result |
|---|---|---|
| `anon` executes `apply_ranked_result` | denied | ✅ |
| non-participant calls `apply_ranked_result` | `not a participant` | ✅ |
| `authenticated` updates `p1_rounds_won` | denied | ✅ |
| `authenticated` resets `rating_applied` | denied | ✅ |
| `authenticated` resets `coins_awarded` | denied | ✅ |
| `authenticated` flips `is_ranked` | denied | ✅ |
| `authenticated` updates `status` (join/cancel) | allowed | ✅ |

`complete_daily` bounds the mode (`p_mode IN (...)`) but trusts `p_score` from the
client — same posture as solo scores (see **B3**); fine because daily rewards are
streak-based, not score-based.

> Note: the advisor lint *"Signed-In Users Can Execute SECURITY DEFINER
> Function"* on these RPCs is **expected and intentional** — they are designed to
> be called by authenticated users and self-check the caller. Not a finding.

---

## B2 — Leaked-password protection (HaveIBeenPwned) · MEDIUM · ⚠️ MANUAL (1 click)

Cannot be toggled via SQL/MCP — it is a GoTrue auth-config flag. No management
token / Supabase CLI is available in this environment, so **you** must do it:

**Dashboard → Authentication → Sign In / Providers → Password →** enable
**"Leaked password protection"** (Save).
Or via the Management API with a personal access token:

```bash
curl -X PATCH "https://api.supabase.com/v1/projects/exwfggaytrywnfzcqpel/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password_hibp_enabled": true}'
```

Doc: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

---

## B3 — Solo score integrity · MEDIUM · ✅ DECISION: TOLERATE

`ClassicGame` / `StreakGame` insert their own `scores` rows directly; the value
is not re-derived server-side, so a modified client can inflate a personal best /
efficiency leaderboard.

**Decision: tolerate.** Coins come **only** from `award_solo_coins`, which is
daily-capped (5×/mode/day, +2 each) regardless of score — that cap is the real
anti-farm guard and is already in place. Inflating a solo score therefore has
**zero economy impact**; it is cosmetic (personal best / leaderboard) only.

**If competitive integrity ever matters** (e.g. score-based rewards): route score
writes through a `submit_solo_score(mode, round_summary)` RPC that recomputes the
score from a server-seeded/signed round summary, mirroring `award_solo_coins`.
Until then, not worth the complexity.

---

## B4 — `pg_net` in `public` schema · LOW · ⛔ DEFERRED (unsafe to move)

The advisor wants `pg_net` out of `public`. **It can't be moved safely:**

- `pg_net` is **non-relocatable** (`pg_extension.extrelocatable = false`), so
  `ALTER EXTENSION pg_net SET SCHEMA extensions` errors.
- The only alternative is `DROP EXTENSION pg_net; CREATE EXTENSION …`, which tears
  down the `net` schema and its functions.
- The **live hourly campaigns cron** (`cron.job` id 1) calls `net.http_post(...)`.
  Dropping `pg_net` breaks that cron immediately, for a LOW-severity cosmetic lint.

Supabase installs `pg_net` in `public` by design; this lint is effectively a
known low-risk item for `pg_net` specifically. **Left as-is on purpose.** Revisit
only if Supabase ships a supported relocation path.

---

## B5 — Cron secret + monitoring · HIGH (operational) · ✅ DONE

- **Secret present:** `public.app_secrets` has `cron_secret` (64-char value). The
  `cron.job` (id 1, hourly `0 * * * *`) passes it as the `x-cron-secret` header;
  `run-campaigns` (verify_jwt=false) compares it against `app_secrets`. ✅
- **Monitoring added:** new table `public.cron_run_log` (admin-read RLS). The
  `run-campaigns` edge function (v3) now writes one best-effort row per
  invocation — `ok` (with `{ran, results}`), `forbidden` (bad/missing secret), or
  `error` (handler crash). Logging is wrapped so it can never break delivery.
  Smoke-tested: a wrong-secret POST returned 403 and logged
  `forbidden / bad_secret` (sent nothing).

**Alert query** — fire if no successful run in the last ~90 min (cron is hourly):

```sql
select not exists (
  select 1 from public.cron_run_log
  where job = 'run-campaigns' and status = 'ok'
    and created_at > now() - interval '90 minutes'
) as campaigns_cron_stale;
```

Wire this to a scheduled check / Sentry cron-monitor / uptime alert. (Client-side
Sentry is already configured via `EXPO_PUBLIC_SENTRY_DSN`; the edge function has
no DSN yet — the `cron_run_log` table is the current source of truth.)

### Deployment checklist for the campaigns cron

1. Insert the shared secret (once per environment):
   ```sql
   insert into public.app_secrets(key, value)
   values ('cron_secret', encode(gen_random_bytes(32), 'hex'))
   on conflict (key) do nothing;
   ```
2. Schedule the hourly job (uses the secret from `app_secrets`):
   ```sql
   select cron.schedule('run-campaigns', '0 * * * *', $$
     select net.http_post(
       url     := 'https://exwfggaytrywnfzcqpel.supabase.co/functions/v1/run-campaigns',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-cron-secret', (select value from public.app_secrets where key = 'cron_secret')
       ),
       body    := '{}'::jsonb
     );
   $$);
   ```
3. Deploy `run-campaigns` with `verify_jwt = false` (it does its own secret auth).
4. Confirm an `ok` row lands in `public.cron_run_log` after the next tick.

---

# 2. Backend — Performance (Postgres)

Re-runnable SQL: `perf_hardening.sql`. Applied as migrations
`perf_index_unindexed_fkeys` and `perf_rls_initplan_select_auth_uid`.

## P1 — Foreign keys without a covering index · MEDIUM · ✅ DONE

Advisor `unindexed_foreign_keys` flagged 6 FKs. Added a covering btree index for
each:

| Table | FK column | Index |
|---|---|---|
| `friends` | `user_id2` | `idx_friends_user_id2` |
| `matches` | `player1_id` | `idx_matches_player1` |
| `matches` | `player2_id` | `idx_matches_player2` |
| `scores` | `user_id` | `idx_scores_user` |
| `notification_campaigns` | `created_by` | `idx_notification_campaigns_created_by` |
| `notification_log` | `campaign_id` | `idx_notification_log_campaign` |

`friends.user_id1` was **not** indexed separately — it is already covered by the
leading column of the composite unique index `friends_user_id1_user_id2_key`,
which is why the advisor only flagged `user_id2`. Re-running the advisor confirms
all 6 `unindexed_foreign_keys` lints are cleared.

## P2 — RLS `auth.uid()` re-evaluated per row · MEDIUM · ✅ DONE

Advisor `auth_rls_initplan` flagged 13 policies (profiles, scores, friends,
matches, coin_wallets, user_cosmetics, solo_coin_log) that called bare
`auth.uid()` — re-evaluated once per scanned row. Fixed via `ALTER POLICY`
(atomic, metadata-only, no drop/recreate window), wrapping the call so the
planner evaluates it once as an initplan:

```sql
auth.uid()  →  (select auth.uid())
```

Only the function call was wrapped; every comparison column and branch (including
the `matches` public-join branch `is_public AND status='waiting' AND
player2_id IS NULL`) is byte-for-byte preserved, so policy semantics are
identical. The two `qual = true` public-read policies (`profiles`, `scores`) call
no auth function and were left untouched. Re-running the advisor confirms all 13
`auth_rls_initplan` lints are cleared.

## P3 — Unused index · LOW · ✅ NO ACTION (resolved by inspection)

The original draft named `idx_profiles_last_seen`, but that index is **in use**
(`idx_scan > 0`) and is kept. The only index the advisor currently reports as
unused is `cron_run_log_job_time_idx` — created in **B5 today**; it backs the
hourly cron-staleness alert and reads as unused only because that query hasn't
run yet. **No drop.** Note: the 6 new P1 indexes also transiently appear under the
`unused_index` lint until the first FK lookup hits them — expected, not a finding.
