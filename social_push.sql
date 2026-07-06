-- ════════════════════════════════════════════════════════════════════════════
-- Social pushes: recipient language.
--
-- Push texts are built server-side (notify-invite / notify-friend-request edge
-- functions), which can't see the sender's UI language — so the RECIPIENT's
-- preferred language is stored on their profile. Written by the client when the
-- user toggles language (LanguageContext); defaults to French (app default).
-- Re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_lang text NOT NULL DEFAULT 'fr'
  CHECK (push_lang IN ('fr', 'en'));
