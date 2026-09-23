-- Campagnes push planifiées de réactivation (run-campaigns, pg_cron horaire).
--
-- Deux campagnes, volontairement peu : la campagne « défi du jour non joué »
-- (17 h UTC, créée le 2026-09-10) touche déjà quiconque n'a pas joué, et le
-- rappel local de 9 h existe. Chaque envoi de plus est du bruit, et le bruit
-- fait couper les notifications.
--
--   1. Absents depuis 14 jours — mercredi 18 h UTC. La cible n'a pas été vue
--      depuis deux semaines : la campagne « défi non joué » les a déjà perdus.
--   2. Jamais joué en ligne — samedi 10 h UTC. Le classé est le mode le plus
--      rétentif ; ceux qui ne l'ont jamais essayé sont invités quand ils ont
--      du temps.
--
-- Idempotent : un titre déjà présent n'est pas réinséré.

INSERT INTO public.notification_campaigns (title, body, segment, schedule, hour, weekday, enabled, i18n)
SELECT
  'Ton globe t’attend 🌍',
  'Deux semaines sans jouer : les défis du jour t’attendent, et ta série peut repartir.',
  '{"type":"inactive","days":14}'::jsonb,
  'weekly', 18, 3, true,
  '{
    "fr": {"title": "Ton globe t’attend 🌍", "body": "Deux semaines sans jouer : les défis du jour t’attendent, et ta série peut repartir."},
    "en": {"title": "Your globe is waiting 🌍", "body": "Two weeks away: today’s challenges are waiting, and your streak can start again."},
    "es": {"title": "Tu globo te espera 🌍", "body": "Dos semanas sin jugar: los retos del día te esperan y tu racha puede volver a empezar."},
    "pt": {"title": "O teu globo espera por ti 🌍", "body": "Duas semanas sem jogar: os desafios do dia esperam por ti e a tua sequência pode recomeçar."},
    "de": {"title": "Dein Globus wartet 🌍", "body": "Zwei Wochen ohne Spiel: Die Tagesherausforderungen warten, und deine Serie kann neu starten."},
    "it": {"title": "Il tuo globo ti aspetta 🌍", "body": "Due settimane senza giocare: le sfide del giorno ti aspettano e la tua serie può ripartire."}
  }'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_campaigns WHERE title = 'Ton globe t’attend 🌍'
);

INSERT INTO public.notification_campaigns (title, body, segment, schedule, hour, weekday, enabled, i18n)
SELECT
  'Ton premier duel t’attend ⚔️',
  'Tu n’as jamais joué en ligne : affronte un joueur de ton niveau en mode classé.',
  '{"type":"activity","filter":"never_online"}'::jsonb,
  'weekly', 10, 6, true,
  '{
    "fr": {"title": "Ton premier duel t’attend ⚔️", "body": "Tu n’as jamais joué en ligne : affronte un joueur de ton niveau en mode classé."},
    "en": {"title": "Your first duel awaits ⚔️", "body": "You’ve never played online: face a player at your level in ranked mode."},
    "es": {"title": "Tu primer duelo te espera ⚔️", "body": "Nunca has jugado en línea: enfréntate a un jugador de tu nivel en modo clasificatorio."},
    "pt": {"title": "O teu primeiro duelo espera por ti ⚔️", "body": "Nunca jogaste online: enfrenta um jogador do teu nível no modo ranqueado."},
    "de": {"title": "Dein erstes Duell wartet ⚔️", "body": "Du hast noch nie online gespielt: Tritt im Ranglistenmodus gegen jemanden auf deinem Niveau an."},
    "it": {"title": "Il tuo primo duello ti aspetta ⚔️", "body": "Non hai mai giocato online: sfida un giocatore del tuo livello in modalità classificata."}
  }'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_campaigns WHERE title = 'Ton premier duel t’attend ⚔️'
);
