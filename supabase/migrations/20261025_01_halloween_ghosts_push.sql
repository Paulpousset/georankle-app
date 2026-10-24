-- 🎃 Halloween 2026 : une seule notification, le samedi 31/10 à 15 h UTC
-- (16 h Paris, 11 h New York), pour annoncer le défi « Pays fantômes ».
--
-- Cible : `daily_pending` (pas encore joué le défi du jour). Ceux qui ont déjà
-- joué ont vu la carte Halloween dans le hub ; et ce segment fait atterrir le
-- tap sur le hub du défi du jour (run-campaigns), où la carte est en tête.
--
-- Une campagne ponctuelle avec la mécanique hebdomadaire existante, sans
-- toucher aux edge functions :
--   • weekly, samedi (6), 15 h, et last_run_at posé au 25/10 : le garde-fou
--     « pas deux envois en 6 jours » l'empêche de partir un autre samedi avant
--     le 31 ;
--   • un job pg_cron à 15 h 30 le 31/10 la désactive, puis se retire lui-même ;
--   • ce même job décale le rappel quotidien de 17 h (même segment) pour ce
--     soir-là seulement : deux notifications le même après-midi, c'est le
--     bruit qui fait couper les notifications.
--
-- Rien n'est inséré si la migration passe après l'heure d'envoi (fusion
-- tardive) : pas d'annonce d'Halloween en novembre. Idempotent.

INSERT INTO public.notification_campaigns (title, body, segment, schedule, hour, weekday, enabled, last_run_at, i18n)
SELECT
  '👻 Les pays fantômes sont de sortie',
  'URSS, Yougoslavie, Zaïre… Reconnais-tu leur silhouette ? Défi spécial Halloween 🎃',
  '{"type":"daily_pending"}'::jsonb,
  'weekly', 15, 6, true, '2026-10-25 00:00:00+00',
  '{
    "fr": {"title": "👻 Les pays fantômes sont de sortie", "body": "URSS, Yougoslavie, Zaïre… Reconnais-tu leur silhouette ? Défi spécial Halloween 🎃"},
    "en": {"title": "👻 The ghost countries are out tonight", "body": "USSR, Yugoslavia, Zaire… Can you spot their shapes? Halloween special challenge 🎃"},
    "es": {"title": "👻 Los países fantasma han salido", "body": "URSS, Yugoslavia, Zaire… ¿Reconoces su silueta? Reto especial de Halloween 🎃"},
    "pt": {"title": "👻 Os países fantasmas estão à solta", "body": "URSS, Iugoslávia, Zaire… Você reconhece a silhueta deles? Desafio especial de Halloween 🎃"},
    "de": {"title": "👻 Die Geisterländer gehen um", "body": "UdSSR, Jugoslawien, Zaire … Erkennst du ihre Umrisse? Halloween-Spezial 🎃"},
    "it": {"title": "👻 I paesi fantasma sono tornati", "body": "URSS, Jugoslavia, Zaire… Riconosci la loro sagoma? Sfida speciale di Halloween 🎃"},
    "ru": {"title": "👻 Страны-призраки вышли на охоту", "body": "СССР, Югославия, Заир… Узнаешь их силуэты? Особое испытание на Хеллоуин 🎃"},
    "tr": {"title": "👻 Hayalet ülkeler ortaya çıktı", "body": "SSCB, Yugoslavya, Zaire… Siluetlerini tanıyabilir misin? Cadılar Bayramı’na özel meydan okuma 🎃"},
    "pl": {"title": "👻 Kraje widma wyszły z ukrycia", "body": "ZSRR, Jugosławia, Zair… Rozpoznasz ich kształty? Specjalne wyzwanie na Halloween 🎃"},
    "nl": {"title": "👻 De spooklanden spoken rond", "body": "Sovjet-Unie, Joegoslavië, Zaïre… Herken jij hun silhouet? Speciale Halloween-uitdaging 🎃"},
    "id": {"title": "👻 Negara-negara hantu bermunculan", "body": "Uni Soviet, Yugoslavia, Zaire… Bisakah kamu mengenali bentuknya? Tantangan spesial Halloween 🎃"},
    "vi": {"title": "👻 Các quốc gia ma đã xuất hiện", "body": "Liên Xô, Nam Tư, Zaire… Bạn có nhận ra hình bóng của chúng? Thử thách đặc biệt Halloween 🎃"},
    "th": {"title": "👻 ประเทศผีออกมาแล้ว", "body": "สหภาพโซเวียต ยูโกสลาเวีย ซาอีร์… จำรูปร่างของพวกมันได้ไหม? ภารกิจพิเศษวันฮาโลวีน 🎃"},
    "uk": {"title": "👻 Країни-привиди вийшли на полювання", "body": "СРСР, Югославія, Заїр… Впізнаєш їхні силуети? Особливий виклик на Гелловін 🎃"},
    "ro": {"title": "👻 Țările fantomă au ieșit la plimbare", "body": "URSS, Iugoslavia, Zair… Le recunoști silueta? Provocare specială de Halloween 🎃"},
    "el": {"title": "👻 Οι χώρες φαντάσματα βγήκαν βόλτα", "body": "ΕΣΣΔ, Γιουγκοσλαβία, Ζαΐρ… Αναγνωρίζεις τη σιλουέτα τους; Ειδική πρόκληση Halloween 🎃"}
  }'::jsonb
WHERE now() < '2026-10-31 15:00:00+00'
  AND NOT EXISTS (
    SELECT 1 FROM public.notification_campaigns WHERE title = '👻 Les pays fantômes sont de sortie'
  );

SELECT cron.unschedule('halloween-2026-ghosts-off')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'halloween-2026-ghosts-off');

SELECT cron.schedule(
  'halloween-2026-ghosts-off',
  '30 15 31 10 *',  -- 31/10, 15 h 30 UTC
  $job$
    UPDATE public.notification_campaigns
      SET enabled = false
      WHERE title = '👻 Les pays fantômes sont de sortie';
    -- Le rappel quotidien « défi non joué » encore à venir ce soir saute un tour
    -- (garde-fou de 23 h de run-campaigns) et repart demain à son heure.
    UPDATE public.notification_campaigns
      SET last_run_at = now()
      WHERE enabled
        AND schedule = 'daily'
        AND segment->>'type' = 'daily_pending'
        AND hour > 15;
    SELECT cron.unschedule('halloween-2026-ghosts-off');
  $job$
);
