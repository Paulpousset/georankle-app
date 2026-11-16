-- Rappel quotidien parti à personne 7 jours sur 21 (27/10 → 15/11) : l'appel
-- Expo échouait en entier et l'erreur était avalée. La fonction partagée
-- `broadcast.ts` réessaie désormais, puis consigne l'erreur Expo ici.
--
-- ⚠️ À appliquer AVANT de déployer les fonctions admin-broadcast et
-- run-campaigns mises à jour : sinon leur insert dans notification_log échoue
-- (colonne inconnue) et l'envoi n'est plus journalisé.
-- Re-jouable.

alter table public.notification_log add column if not exists error text;

comment on column public.notification_log.error is
  'Échec Expo qui a survécu aux nouvelles tentatives (null = tout est parti).';
