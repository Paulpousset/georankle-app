-- ════════════════════════════════════════════════════════════════════════════
-- Repères du tableau de bord /hq (onglet Croissance) : campagnes, vidéos,
-- sorties… ajoutés à la main pour mesurer leur effet sur les téléchargements.
-- Lue et écrite uniquement par api/hq.mjs avec la clé service role : RLS
-- activée sans politique, donc rien n'est accessible aux clés anon/authenticated.
--
-- Re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.hq_markers (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  day        date        NOT NULL,
  kind       text        NOT NULL DEFAULT 'campagne' CHECK (kind IN ('campagne', 'version', 'push', 'autre')),
  label      text        NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hq_markers_day_idx ON public.hq_markers (day);

ALTER TABLE public.hq_markers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hq_markers FROM anon, authenticated;
