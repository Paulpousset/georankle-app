# PostHog — tableaux de bord

**Ce document ne se suit plus à la main.** Les tableaux de bord et leurs
insights sont décrits dans [`scripts/posthog_dashboards.mjs`](scripts/posthog_dashboards.mjs)
et appliqués par ce script. Il rapproche par nom : le relancer met à jour
l'existant au lieu de dupliquer.

```bash
node scripts/posthog_dashboards.mjs --dry-run    # montre le plan, n'écrit rien
node scripts/posthog_dashboards.mjs              # applique
node scripts/posthog_dashboards.mjs --only "Modes de jeu"
```

Il lui faut une clé personnelle PostHog dans `.env.secrets` (gitignoré) —
portées `dashboard:write`, `insight:write`, `project:read` :

```
POSTHOG_PERSONAL_API_KEY=phx_...
```

## Les cinq tableaux de bord

| Tableau de bord | Ce qu'il répond |
|---|---|
| **Vue d'ensemble** (épinglé) | Qui joue, sur quelle surface, d'où viennent les nouveaux, et l'entonnoir lecteur d'un guide → joueur |
| **Rétention & habitude** | Est-ce qu'ils reviennent ? Rétention J1–J30, daily → daily, fidélité, streak |
| **Modes de jeu** | Ce qui est joué, où l'on abandonne, santé du matchmaking et du mode Langues |
| **Économie & monétisation** | Entonnoir boutique, achats, taux d'échec des pubs récompensées, quêtes |
| **Croissance & parrainage** | Parrainage, partages sortants, invitations de match |

## Ce qu'il faut savoir pour les lire

- **`platform` et `surface`** séparent web / iOS / Android et jeu / site de
  contenu. Ce sont des super-propriétés attachées à chaque événement. Elles sont
  `null` sur les versions natives installées avant le build qui les introduit :
  une répartition par plateforme ne devient fiable qu'après renouvellement du
  parc.
- **Les écrans du jeu** arrivent en `$pageview` avec un chemin virtuel
  (`/play/menu`, `/play/daily`) : l'URL réelle de la SPA ne change jamais, donc
  sans cela tout le jeu se réduirait à une seule ligne dans le rapport Pages.
- **Le site de contenu** (landing, guides) n'est mesuré que depuis le
  2026-08-23. Aucune comparaison avec l'avant n'a de sens.
- **Les affichages en barres** rendent `aggregated_value` et non `count` — un
  script de vérification qui somme `count` conclura à tort « aucune donnée ».

## Alerte à créer à la main

PostHog → Alerts : si `daily_completed` quotidien chute de plus de 50 % contre
la moyenne 7 jours → e-mail. (Complète l'alerte `cron_run_log` de l'écran admin.)
