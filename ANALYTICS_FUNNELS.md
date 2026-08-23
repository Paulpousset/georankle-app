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

Ces règles viennent d'un contrôle de chaque tuile contre les données réelles,
pas de la lecture du catalogue d'événements. Les ignorer produit des tableaux
qui s'affichent sans erreur mais ne montrent rien.

- **Ne pas répartir sur `platform`.** La super-propriété n'est renseignée que
  sur 0,2 % des événements : elle n'existe que depuis le build du 2026-08-23 et
  tout le parc natif installé l'ignore. Utiliser **`$os`**, renseigné à 100 %
  depuis toujours. Attention : avant le 2026-08-23 le web utilisait le SDK
  natif, donc un OS de bureau (Mac OS, Windows, Linux) y désigne un joueur web.
- **Le natif n'émet pas `$pageview`.** Il émet `$screen`, et nomme l'écran
  `$screen_name` ; le web émet `$pageview` avec `screen`. Une tuile qui ne
  regarde que l'un des deux voit 4 vues au lieu de 13 000 — la tuile « Écrans
  du jeu les plus vus » les réunit en HogQL.
- **Un événement du catalogue n'est pas un événement émis.** `challenge_started`,
  `streak_bonus_awarded`, `referral_link_opened`, `referral_redeemed` et
  `language_audio_fallback` n'existent pas dans les données. Vérifier avant de
  bâtir un insight dessus.
- **Les écrans du jeu** arrivent en `$pageview` avec un chemin virtuel
  (`/play/menu`, `/play/daily`) : l'URL réelle de la SPA ne change jamais, donc
  sans cela tout le jeu se réduirait à une seule ligne dans le rapport Pages.
- **Le site de contenu** (landing, guides) n'est mesuré que depuis le
  2026-08-23. Aucune comparaison avec l'avant n'a de sens.
- **Les affichages en barres** rendent `aggregated_value` et non `count` — un
  script de vérification qui somme `count` conclura à tort « aucune donnée ».

## Les sentinelles

Trois tuiles sont censées rester à zéro. Leur vide est l'information :

| Tuile | Ce que son silence signifie |
|---|---|
| Bonus de streak attribués | Jamais attribué, pour 1 013 défis quotidiens terminés. Soit la récompense de série ne se déclenche pas, soit elle n'est pas instrumentée — à trancher. |
| Parrainages aboutis | `referral_shared` n'a été émis qu'une fois (2026-08-17), jamais suivi d'une ouverture. La boucle n'est pas cassée : personne ne la trouve. |
| Mode Langues, repli audio | Normal tant que le mode reste derrière son drapeau. |

## Dérive

Le script rapproche par nom : renommer une tuile en crée donc une nouvelle et
laisse l'ancienne accrochée. Il détache automatiquement toute tuile absente de
la définition (détachée, pas supprimée — elle reste dans la liste des insights).

## Alerte à créer à la main

PostHog → Alerts : si `daily_completed` quotidien chute de plus de 50 % contre
la moyenne 7 jours → e-mail. (Complète l'alerte `cron_run_log` de l'écran admin.)
