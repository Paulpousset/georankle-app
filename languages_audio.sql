-- ✅ APPLIQUÉ EN PROD le 2026-08-16 via Supabase MCP (migration « languages_audio_bucket »).
-- ════════════════════════════════════════════════════════════════════════════
-- « Langues » — PHASE 2 : stockage des extraits parlés.
--
-- Crée le bucket public `game-audio` (nom générique : il accueillera d'autres
-- contenus sonores — hymnes, accents…) et sa policy de LECTURE seule.
--
-- Arborescence : game-audio/languages/v<version>/<code>/<id>.<hash>.mp3
-- Le nom de fichier contient le hash du texte, donc corriger une phrase produit
-- un nouveau fichier : aucun cache (disque, CDN, navigateur) ne peut servir un
-- extrait périmé — c'est ce qui autorise le Cache-Control d'un an posé à
-- l'upload par scripts/gen_language_audio.mjs.
--
-- Aucune policy INSERT/UPDATE/DELETE : les uploads passent exclusivement par le
-- service_role du script de génération. Le client ne fait que LIRE.
-- Re-jouable.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('game-audio', 'game-audio', true, 1048576, ARRAY['audio/mpeg'])
ON CONFLICT (id) DO UPDATE SET
  public             = true,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "game audio public read" ON storage.objects;
CREATE POLICY "game audio public read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'game-audio');

-- Rappel d'activation : générer les extraits, les ÉCOUTER langue par langue
-- (un accent faux rend la bonne réponse objectivement fausse), vérifier avec
-- `node scripts/check_language_audio.mjs`, PUIS seulement :
--   UPDATE public.feature_flags SET enabled = true WHERE key = 'languages_audio';
