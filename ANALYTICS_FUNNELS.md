# PostHog — funnels & rétention à configurer (runbook)

Les événements sont tous émis par `src/lib/analytics.ts` (catalogue typé). Ce
document liste les insights à créer **dans le dashboard PostHog** (eu.i.posthog.com)
— ils ne peuvent pas être créés depuis le code.

## 1. Rétention

| Insight | Config PostHog |
|---|---|
| Rétention J1 / J7 / J30 | Insight → Retention · événement de départ : `signed_up` · retour : `game_started` OU `daily_opened` · périodes : Day 1, 7, 30 |
| Rétention des joueurs daily | Retention · départ : `daily_completed` · retour : `daily_completed` (jour suivant) — mesure l'efficacité du streak |

## 2. Funnel d'activation (nouveau joueur)

Insight → Funnel, fenêtre 7 jours :
1. `signed_up`
2. `game_completed` (première partie solo)
3. `match_started` (premier match en ligne)
4. `match_completed` où `result = won`

Chute attendue la plus forte entre 2 et 3 → mesurer avant/après les quêtes
(`online_play` pousse vers le online).

## 3. Funnel boutique (monétisation future)

Insight → Funnel, fenêtre 3 jours :
1. `shop_opened`
2. `shop_item_viewed` (ajouté 2026-07-02 — preview d'un item)
3. `cosmetic_purchased` OU `bundle_purchased`

À surveiller : le taux 2→3 selon `item_id` et la part du `featured_purchased`
(vitrine -30 %).

## 4. Quêtes & streak (ajoutés 2026-07-02)

| Événement | Propriétés | Usage |
|---|---|---|
| `quest_claimed` | `quest`, `coins` | Trend quotidien : % de DAU qui réclament ≥1 quête ; répartition par quête |
| `streak_bonus_awarded` | `streak`, `coins` | Compter les joueurs atteignant les paliers 7/30 j |

Funnel d'engagement quêtes : `daily_opened` → `quest_claimed` (fenêtre 1 jour).

## 5. Bots vs humains (santé du matchmaking)

Trend : `bot_match_started` / (`bot_match_started` + `match_started` où
`is_ranked = true`) — si > 50 %, la file ranked manque de joueurs aux heures
creuses → envisager d'élargir la fenêtre de matchmaking avant le fallback bot.

## 6. Alerte

PostHog → Alerts : si `daily_completed` quotidien chute de > 50 % vs moyenne
7 jours → mail. (Complète l'alerte cron `cron_run_log` déjà affichée dans
l'écran admin.)
