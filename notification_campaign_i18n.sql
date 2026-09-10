-- Rappel quotidien « défi du jour » : copie par langue + placeholder {streak}
-- pour les campagnes push planifiées (supabase/functions/run-campaigns).
-- APPLIQUÉ en prod le 2026-09-10 (migration `notification_campaign_i18n`).
--
-- Forme : {"fr": {"title": "...", "body": "...", "body_streak": "... {streak} ..."}, "en": {...}}
-- `{streak}` = profiles.daily_streak ; body_streak est utilisé quand la série > 0 ;
-- langue choisie via profiles.push_lang, repli en → fr → title/body de la ligne.
alter table public.notification_campaigns add column if not exists i18n jsonb;
comment on column public.notification_campaigns.i18n is
  'Per-language {title, body, body_streak}; {streak} placeholder = profiles.daily_streak. Falls back to title/body.';

-- Nouveau segment côté fonction : {"type":"daily_pending"} = joueurs avec un
-- push_token qui n'ont pas encore joué le défi du jour (jour UTC).
-- Campagne créée le 2026-09-10 (id a496efe1-7bdb-4986-9e2e-c1352e2b3644), 17 h UTC, fr/en/es/pt/de/it.
-- La tester à blanc : POST /functions/v1/run-campaigns?dry=1 avec l'en-tête x-cron-secret.
