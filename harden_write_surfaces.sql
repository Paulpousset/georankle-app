-- ═══════════════════════════════════════════════════════════════════════════
-- harden_write_surfaces.sql — refermer les écritures directes du client
--
-- ⚠️ CE FICHIER EST UN RELEVÉ, PAS UNE MIGRATION À REJOUER.
-- Les correctifs ci-dessous ont été APPLIQUÉS EN PRODUCTION le 23/08 via
-- apply_migration, chacun vérifié par un test `SET ROLE authenticated`.
-- Les corps de RPC ont été récupérés depuis `prosrc` en prod, PAS recopiés
-- depuis les .sql du dépôt — qui se sont révélés périmés (complete_daily
-- autorisait 12 modes en prod contre 11 dans daily.sql).
--
-- Migrations appliquées, dans l'ordre :
--   1. harden_complete_daily_date_window
--   2. harden_matches_insert_and_update_guards
--   3. harden_friends_update_guard
--   4. restrict_story_progress_to_owner
--   5. harden_complete_story_level_progression
-- ═══════════════════════════════════════════════════════════════════════════


-- ✅ 1. complete_daily : date arbitraire  ─────────────────────── APPLIQUÉ
-- Boucler sur des dates passées incrémentait le streak à chaque appel et versait
-- 20 pièces tous les 7 / 100 tous les 30 → pièces illimitées, et insertion de
-- daily_results antidatés qui réécrivaient les classements de ligue.
-- Correctif : assert_daily_date_fresh(), fenêtre -3 / +1 jour.
-- ERRCODE 22007 volontaire : syncQueue.ts jette tout P0001, un joueur qui se
-- resynchronise hors-ligne aurait perdu son run en silence.
-- Vérifié : -4 j, -400 j et +30 j rejetés ; aujourd'hui, -1 j, -3 j, +1 j acceptés.

-- ✅ 2. matches : INSERT non restreint  ───────────────────────── APPLIQUÉ
-- Les grants de COLONNE ne s'appliquent qu'à UPDATE, jamais à INSERT : le grant
-- INSERT de `authenticated` portait sur les 24 colonnes (p1_rounds_won,
-- is_ranked, rating_applied, coins_awarded…) et aucun trigger n'existait.
-- Correctif : trigger BEFORE INSERT `matches_insert_guard`.
-- Vérifié : un INSERT forgé (is_ranked=true, p1_rounds_won=1, status='completed')
-- ressort en status='waiting', p1_rounds_won=0, rating_applied=false.

-- ✅ 3. matches : écriture des colonnes de l'adversaire  ──────── APPLIQUÉ
-- Correctif : trigger BEFORE UPDATE `matches_update_guard`.
-- ⚠️ Les deux triggers sont en SECURITY INVOKER (défaut) VOLONTAIREMENT : c'est
-- `current_user` qui distingue le client ('authenticated') du serveur
-- ('postgres'). En SECURITY DEFINER, current_user vaudrait toujours le
-- propriétaire et le trigger aurait bloqué finalize_round — donc la fin de
-- CHAQUE manche en ligne. Ne pas « corriger » ça.
-- Vérifié : client→colonnes adverses BLOQUÉ · client→ses colonnes OK ·
-- serveur→les deux camps OK.

-- ✅ 4. friends : UPDATE sans WITH CHECK  ─────────────────────── APPLIQUÉ
-- Sans WITH CHECK, Postgres réapplique le USING à la nouvelle ligne :
-- l'émetteur pouvait accepter sa propre demande, et n'importe qui réécrire
-- user_id2 vers une victime.
-- Correctif : trigger `friends_update_guard` (un WITH CHECK à sous-requête
-- aurait relu `friends` depuis une policy de `friends` — récursion RLS).
-- Vérifié : les deux abus BLOQUÉS, le destinataire accepte toujours.

-- ✅ 5. story_progress : lisible par tous  ────────────────────── APPLIQUÉ
-- Policy `USING (true)` sans clause TO. La justification « voir la position des
-- amis » était caduque : getFriendsPositions() lit profiles.story_max_level.
-- Correctif : SELECT restreint au propriétaire + `.eq('user_id')` ajouté dans
-- src/lib/story.ts, qui fusionnait les étoiles d'inconnus par Math.max.

-- ✅ 6. complete_story_level : aucun prérequis  ───────────────── APPLIQUÉ
-- complete_story_level(300,1000,3) posait story_max_level=300 ; une boucle
-- 1→300 versait 3000 pièces et les 9 cosmétiques exclusifs.
-- Correctif : refus si p_level > story_max_level + 1.
-- Vérifié : saut au niveau 300 BLOQUÉ, niveau suivant autorisé.


-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUI RESTE OUVERT
-- ═══════════════════════════════════════════════════════════════════════════

-- ⏳ p_score de complete_daily n'est PAS clampé — DÉLIBÉRÉMENT.
--    daily_results stocke le score NATIF de chaque mode, pas une échelle
--    commune : globe monte à 5000 (41 lignes > 1000 en prod), regions à 4000,
--    classic est un pourcentage (max 99), et score.ts documente streak comme
--    « unbounded ». Un clamp à 1000 aurait corrompu 43 lignes existantes.
--    Il faut un PLAFOND PAR MODE, qui est une décision de game design.

-- ⏳ scores : INSERT direct par le client (policy WITH CHECK auth.uid()=user_id
--    seulement, aucune borne, aucune policy DELETE). Le classement solo mondial
--    reste forgeable. Correctif = RPC submit_solo_score avec plafond par mode —
--    même décision en attente que ci-dessus.

-- ⏳ apply_bot_ranked_result croit toujours p_player_rounds_won. Le point 2
--    empêche désormais le match de naître 'completed', ce qui coupe la boucle
--    la plus simple, mais la RPC ne vérifie toujours pas que la partie a eu lieu.

-- ⏳ daily_results : SELECT `USING (true)` (tout user_id/score énumérable, y
--    compris par anon). C'est la source du classement quotidien — restreindre
--    demande de passer par une vue ou une RPC agrégée.

-- ⏳ claim_rewarded_ad / claim_coin_multiplier : aucune preuve de visionnage
--    (pas de jeton AdMob SSV). Non exploitable tant que le flag rewarded_ads
--    est OFF — à traiter AVANT de l'activer.

-- ⏳ redeem_referral : aucun anti-Sybil (100 faux comptes = 10 000 pièces).

-- ⏳ Protection des mots de passe compromis (HIBP) : toujours désactivée.
--    Dashboard → Authentication → Settings → Leaked password protection.
