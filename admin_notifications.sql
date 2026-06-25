-- ═══════════════════════════════════════════════════════════════════════════
-- Admin push notifications
-- ═══════════════════════════════════════════════════════════════════════════
-- Adds:
--   • profiles.is_admin   — gate for the in-app admin panel + edge functions
--   • profiles.last_seen  — activity tracking so we can target inactive users
--   • notification_campaigns — scheduled (recurring) broadcasts
--   • notification_log       — audit of every broadcast actually sent
--   • touch_last_seen() RPC  — cheap self-update called on app open
--   • is_admin() helper      — used by RLS policies below
--   • pg_cron job            — fires the run-campaigns edge function hourly
--
-- Run this once against the project (Supabase SQL editor or `supabase db push`).
-- Then grant yourself admin:
--   UPDATE public.profiles SET is_admin = true WHERE id = '<your-user-id>';
--
-- Deploy the edge functions (the CLI bundles _shared/ automatically):
--   supabase functions deploy admin-broadcast
--   supabase functions deploy run-campaigns --no-verify-jwt
-- run-campaigns is invoked by pg_cron with x-cron-secret (no Supabase JWT), so
-- it MUST be deployed with --no-verify-jwt; admin-broadcast keeps JWT auth on.
-- run-campaigns reads its expected secret from public.app_secrets (see bottom),
-- so no CRON_SECRET function env var is needed.

-- ── Profile columns ───────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles (last_seen);

-- ── is_admin() helper ─────────────────────────────────────────────────────────
-- SECURITY DEFINER so RLS policies can check the caller's admin flag without the
-- caller needing direct read access to every profile row.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false);
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ── touch_last_seen() RPC ─────────────────────────────────────────────────────
-- Called by the app on launch / foreground. SECURITY DEFINER keeps the write
-- self-scoped (auth.uid()) without opening a broad UPDATE policy on profiles.
CREATE OR REPLACE FUNCTION public.touch_last_seen()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET last_seen = now() WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.touch_last_seen() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.touch_last_seen() TO authenticated;

-- ── Scheduled campaigns ───────────────────────────────────────────────────────
-- A campaign is a recurring broadcast. `segment` is the same JSON the manual
-- sender uses (see _shared/broadcast.ts). Schedule is coarse on purpose: a
-- daily/weekly cadence fired at a given UTC hour, checked hourly by pg_cron.
CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  body        text NOT NULL,
  segment     jsonb NOT NULL,                       -- { type: 'everyone' | 'inactive' | 'users' | 'activity', ... }
  schedule    text NOT NULL DEFAULT 'weekly',       -- 'daily' | 'weekly'
  hour        int  NOT NULL DEFAULT 9,              -- 0–23, UTC
  weekday     int,                                  -- 0–6 (0 = Sunday), NULL for daily
  enabled     boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_by  uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Send audit log ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  body        text NOT NULL,
  segment     jsonb NOT NULL,
  recipients  int  NOT NULL DEFAULT 0,              -- tokens matched by the segment
  sent        int  NOT NULL DEFAULT 0,              -- tokens Expo accepted
  source      text NOT NULL DEFAULT 'manual',       -- 'manual' | 'campaign'
  campaign_id uuid REFERENCES public.notification_campaigns (id) ON DELETE SET NULL,
  sent_by     uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_created ON public.notification_log (created_at DESC);

-- ── RLS: admin-only ───────────────────────────────────────────────────────────
-- The edge functions use the service role (bypasses RLS); these policies only
-- gate what the app client can do directly (campaign CRUD + reading history).
ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage campaigns" ON public.notification_campaigns;
CREATE POLICY "admins manage campaigns" ON public.notification_campaigns
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admins read log" ON public.notification_log;
CREATE POLICY "admins read log" ON public.notification_log
  FOR SELECT USING (public.is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- Scheduled campaigns: pg_cron fires run-campaigns once an hour.
-- ═══════════════════════════════════════════════════════════════════════════
-- Auth between pg_cron and the (verify_jwt=false) function is a shared secret
-- stored in app_secrets — readable only by the service role, so the function
-- can read it while anon/authenticated cannot. pg_cron reads the same value at
-- run time, so the secret never appears in the cron.job definition.

-- Service-role-only secret store.
CREATE TABLE IF NOT EXISTS public.app_secrets (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_secrets FROM anon, authenticated;
GRANT SELECT ON public.app_secrets TO service_role;

-- Insert your own long random secret (e.g. `openssl rand -hex 32`). Done via a
-- separate non-migration statement in practice so it stays out of git history:
--   INSERT INTO public.app_secrets (key, value) VALUES ('cron_secret', '<random>')
--     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Outbound-HTTP + scheduler extensions.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('run-notification-campaigns')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'run-notification-campaigns');

SELECT cron.schedule(
  'run-notification-campaigns',
  '0 * * * *',  -- top of every hour (UTC)
  $job$
    SELECT net.http_post(
      url     := 'https://exwfggaytrywnfzcqpel.supabase.co/functions/v1/run-campaigns',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT value FROM public.app_secrets WHERE key = 'cron_secret')
      ),
      body    := '{}'::jsonb
    );
  $job$
);
