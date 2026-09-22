# GeoG — Plan de mise en avant piloté par Claude

> Objectif : plus d'utilisateurs, avec le moins d'actions possible de la part de Paul.
> Rédigé le 22/09/2026 à partir de l'état réel du dépôt et des constats
> d'`ANALYTICS_FUNNELS.md`, `SEO-LIVRAISON.md` et `PROFESSIONAL_TODO.md`.

---

## En une ligne

Trois niveaux. **Niveau A** : ce que je fais seul, sans rien te demander (tout ce
qui est du code, du contenu de site et des sessions Claude planifiées).
**Niveau B** : ce qui devient automatique pour toujours après **une** action de ta
part (coller une clé dans les secrets GitHub). **Niveau C** : ce qui ne s'automatise
pas honnêtement, et que je ne ferai pas semblant d'automatiser.

Le « rien faire » est tenable pour A. Pour B il faut environ 15 minutes, une
fois. Sans B, mes changements dans l'app mobile n'atteignent les joueurs que
quand tu lances `npm run ship` : il n'y a pas d'`expo-updates` dans le projet,
donc pas de mise à jour à chaud du JavaScript.

---

## Ce que disent les données avant de commencer

Ces constats orientent l'ordre des chantiers. Ils viennent du dépôt, pas d'une
intuition.

| Constat | Source | Conséquence |
|---|---|---|
| Le parrainage existe (code stable, pièces pour les deux joueurs) mais `referral_shared` n'a été émis **qu'une fois** depuis le lancement, jamais suivi d'une ouverture. | `ANALYTICS_FUNNELS.md`, sentinelle « Parrainages aboutis » | La boucle n'est pas cassée, **personne ne la trouve** : elle vit dans une carte de l'écran Amis. |
| La grille de partage façon Wordle est en place, avec lien vers `/play?code=`. | `src/lib/share.ts` | Le mécanisme viral est prêt, il faut le mettre devant les yeux à chaque fin de partie, pas seulement après le défi du jour. |
| Le bonus de série n'a **jamais** été attribué pour 1 013 défis quotidiens terminés. | sentinelle « Bonus de streak » | Soit un bug, soit non instrumenté. Une récompense de série qui ne tombe pas, c'est de la rétention perdue. |
| « Presque toutes nos installations viennent de la recherche App Store en France. » | `src/lib/reviewPrompt.ts` | Le classement store est nourri par le volume de notes et la rétention. Les deux leviers sont en jeu, pas en pub. |
| 96 pages SEO FR/EN à parité, sitemap et hreflang générés, garde-fous au build. 196 pages générées quasi vides ont été retirées après le 5e refus AdSense. | `SEO-LIVRAISON.md`, commit `aa5e5be` | L'usine à pages existe. La règle est : **jamais de page mince**. Chaque page nouvelle doit être écrite, pas assemblée. |
| L'app parle **16 langues**, le site public n'en parle que 2, les fiches store existent en ES/PT/DE/IT. | `src/types/index.ts`, `store-listing/` | Le marché non francophone est ouvert côté produit et fermé côté acquisition. |
| Liens de bio traçables (`/tiktok`, `/instagram`, `/youtube`) avec UTM et `campaign_link_opened`. | `public/go.js` | La mesure des canaux sociaux est prête, mais le `pt=` Apple est vide : les installs iOS depuis ces liens ne sont pas attribuées. |
| Campagnes push planifiées (table `notification_campaigns`, pg_cron horaire, edge function `run-campaigns`) et rappel quotidien local à 9 h. | `admin_notifications.sql`, `src/lib/notifications.ts` | La réactivation est câblée, il faut la nourrir avec de vrais messages. |
| Search Console non vérifiée, Bing non activé. | `SEO-LIVRAISON.md` § « Pour Paul » | Le SEO tourne à l'aveugle : aucun retour sur les requêtes qui amènent du monde. |

---

## Niveau A — ce que je fais seul, sans rien te demander

Chaque chantier atterrit sur une branche, passe la CI (`lint`, `site:check`,
`typecheck`, `test`), puis part sur `master`. Le web se déploie sur Vercel à
partir de `master`. Le mobile attend un `npm run ship` (voir niveau B pour le
rendre automatique).

### A1 · Rendre la boucle virale visible (semaine 1)

C'est le chantier au meilleur rapport gain / effort : tout existe, il n'est pas
exposé.

- **Bouton « Partager » sur tous les écrans de fin de partie**, pas seulement le
  défi du jour. Même grille d'émojis, même lien `/play?code=…&mode=…`, avec le
  numéro du puzzle pour que l'ami joue **la même** grille.
- **« Défie un ami »** en fin de partie solo : lien qui ouvre exactement le même
  mode avec la même graine (`?mode=` existe déjà dans `src/lib/webEntry.ts`, il
  manque la graine). L'ami joue dans le navigateur sans installer, puis voit le
  bandeau « installe l'app pour garder ta série ».
- **Le parrainage sort de l'écran Amis** : rappel après le 3e défi terminé,
  puis sur l'écran de fin de partie une fois par semaine, avec le gain en pièces
  affiché. Les 3 nouveaux points d'entrée sont instrumentés
  (`referral_shared` avec une propriété `source`).
- **Réparer ou instrumenter le bonus de série** (sentinelle à zéro) : je
  commence par un test qui reproduit, puis le correctif.

Mesure : `daily_shared / daily_completed` (taux de partage), `referral_shared`
par source, `campaign_link_opened` avec `s=daily`.

### A2 · Rétention, donc classement store (semaines 1 à 2)

- **Notification « série en danger »** : locale, sans serveur. Si le joueur a
  une série ≥ 2 et n'a pas joué à 20 h heure locale, une notification
  « Il te reste 4 h pour garder ta série de 5 🔥 ». Le rappel de 9 h existe, il
  ne cite ni la série ni le numéro du Rankle du jour : je l'enrichis.
- **Retour après absence** : à la réouverture après 7 jours ou plus, un écran
  d'accueil qui offre un petit bonus de pièces et lance le défi du jour en un
  tap. Instrumenté `comeback_shown` / `comeback_played`.
- **Demande de note** : la politique actuelle demande à partir de 3 jours de
  série. J'ajoute un deuxième moment sûr, la première victoire en classé, en
  gardant les plafonds (3 demandes max, 90 jours entre deux).
- **Campagnes push** : je livre les migrations SQL des 4 campagnes de base
  (inactifs 7 j, inactifs 30 j, nouveau défi du lundi, fin de saison classée),
  traduites via le format `i18n` déjà prévu par `notification_campaign_i18n.sql`.
  Leur mise en production est niveau B (il faut un accès à la base).

### A3 · Conversion web → app (semaine 2)

`/play` est la page la plus partagée et la destination de 46 des 96 pages du
site. Aujourd'hui elle ne pousse pas l'app.

- **Bannière iOS « Smart App Banner »** (`<meta name="apple-itunes-app">`) et
  son équivalent Android sur `/play` et `/en/play` : gratuit, natif, non intrusif.
- **Images Open Graph dynamiques** pour `/play?code=…` : la carte partagée
  montre le mode, le numéro du puzzle et la série, au lieu de l'image générique.
  Générée par une fonction Vercel, mise en cache une journée.
- **Bandeau après la partie web** : « Tu as fini le Rankle #313. Installe GeoG
  pour garder ta série et jouer en classé. » Instrumenté.
- **Remplir le `pt=` Apple** dans `public/go.js` dès que je l'ai (niveau B,
  il vient d'App Store Connect).

### A4 · Usine à contenu SEO, qualité d'abord (en continu, dès la semaine 3)

Le générateur, les garde-fous et le sitemap existent. Ce qui manque, c'est du
contenu original, régulièrement. Je ne referai pas les 196 pages minces : la
règle est **≥ 600 mots écrits, un angle propre, un tableau propre, une FAQ
tirée du texte**, en FR et en EN, sinon la page n'est pas publiée.

- **2 pages par semaine** : d'abord les requêtes que le site ne couvre pas et
  qui sont proches d'un mode existant (ex. « capitales d'Europe quiz »,
  « drapeaux difficiles », « pays par population classement »). Chaque page
  a son bouton « Jouer » avec `?mode=` et sa graine.
- **195 fiches pays**, à raison de 20 par semaine sur 10 semaines, avec les
  données réelles de `countries_stats.json` et une introduction originale de
  200 à 400 mots par fiche et par langue. Un garde-fou dans `site/lib/validate.mjs`
  refuse toute fiche sous le seuil de mots ou trop proche d'une autre.
- **Rafraîchissement** : 43 des 48 pages FR portent encore `modified: 2026-08-23`.
  Une passe mensuelle relit 8 pages, corrige, complète et redate honnêtement.
- **ES / DE / PT / IT du site** : réouverts page par page, **écrits**, pas
  assemblés, en commençant par l'accueil et les 12 pages de mode. L'app parle
  ces langues, les fiches store existent : la chaîne est cohérente.

### A5 · La machine : des sessions Claude planifiées

C'est ce qui rend « rien faire » possible dans la durée. Chaque Routine ouvre
une session neuve, fait son travail, passe la CI, pousse et s'arrête. Aucune ne
te demande quoi que ce soit ; si elle échoue, elle laisse une note dans
`GROWTH_LOG.md` et réessaie la fois suivante.

| Routine | Cadence | Ce qu'elle fait |
|---|---|---|
| **Contenu SEO** | lundi 6 h UTC | Écrit les 2 pages de la semaine (FR + EN) et 20 fiches pays, lance `site:check`, pousse, ouvre la PR et la fusionne quand la CI est verte. |
| **Rapport croissance** | vendredi 7 h UTC | Lit PostHog (niveau B) : partages, parrainages, rétention J1/J7, sources. Écrit le bilan dans `GROWTH_LOG.md` et ajuste la liste des pages à écrire. |
| **Audit technique** | 1er du mois | Lighthouse mobile sur 6 pages, sitemap, liens morts, réponses 200 sur les 96 URL. Corrige ce qui est dans le code, note le reste. |
| **Notes de version** | à chaque bump de version | Rédige `store-listing/release-notes-vX.md` en 6 langues à partir du `git log`, prêt pour `play_promote.mjs`. |

Je crée ces Routines dès que tu me dis « go ». Elles tournent dans ton
environnement Claude Code et sont visibles dans ta liste de Routines.

---

## Niveau B — une action de ta part, puis plus jamais

Chaque ligne débloque un morceau du plan pour toujours. Classées par gain.

| Secret à coller dans GitHub → Settings → Secrets | Ce que ça débloque | Temps |
|---|---|---|
| `EXPO_TOKEN` (expo.dev → Access tokens) | Un workflow GitHub `release.yml` : à chaque tag `vX.Y.Z`, build EAS iOS + Android et envoi aux stores. **Sans lui, A1, A2 et A3 côté mobile attendent ton `npm run ship`.** | 3 min |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (le fichier `google-service-account.json` que tu as déjà, gitignoré) | Notes de version et fiche Play (titre, descriptions, 6 langues) poussées par l'API à chaque release, via `scripts/play_promote.mjs` étendu. | 2 min |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY` (App Store Connect → Users and Access → Keys) | Même chose côté App Store : « Nouveautés » et fiche localisée à chaque release. Me donne aussi le `pt=` pour attribuer les installs iOS venant des liens de bio. | 5 min |
| `SUPABASE_DB_URL` (Supabase → Settings → Database, mot de passe inclus) | Un workflow applique les migrations `*.sql` à la fusion sur `master`. Débloque les campagnes push (A2) et toute évolution serveur sans passer par l'éditeur SQL. | 2 min |
| `POSTHOG_PERSONAL_API_KEY` (portées `project:read`, `insight:read`) | La Routine « Rapport croissance » lit les vrais chiffres au lieu de deviner, et le script `posthog_dashboards.mjs` tourne tout seul. | 2 min |
| Vérifier la propriété **playgeog.com** dans Search Console, puis ajouter un compte de service Google comme utilisateur, clé dans `GSC_SERVICE_ACCOUNT_JSON` | La Routine SEO voit les requêtes réelles, les pages en position 5 à 20 à pousser, les pages jamais indexées. C'est ce qui transforme l'usine à contenu en usine ciblée. | 5 min |

Une fois ces clés en place, plus rien ne te revient : je code, je publie, je
mesure, je corrige.

---

## Niveau C — ce que je ne ferai pas, et pourquoi

- **Poster automatiquement sur TikTok, Instagram, X ou Reddit.** Il faudrait
  tes comptes, les API sont fermées ou payantes, les comptes automatisés sont
  bannis, et un contenu posté par un robot sans montage ne convertit pas. Ce
  que je peux faire, c'est produire chaque semaine des scripts de vidéos et des
  visuels prêts à poster dans `marketing/`. Mais c'est toi qui postes, donc ce
  n'est pas « rien faire » : je le classe ici plutôt que de le vendre comme
  automatique.
- **Product Hunt, presse, communautés Discord.** Ça demande une personne, un
  compte et une conversation.
- **Publicité payante.** Pas sans budget décidé par toi, et pas avant que le
  parrainage et la rétention soient mesurés (sinon on achète des installs qui
  partent).
- **Notes achetées, échanges de notes, faux avis.** Non.
- **Pages générées en masse.** Cinq refus AdSense l'ont déjà dit.

---

## Calendrier sur 90 jours

| Semaine | Livraison | Déjà possible sans niveau B ? |
|---|---|---|
| 1 | A1 boucle virale + correctif série. Bannière iOS (A3). | Oui pour le web ; mobile attend un ship. |
| 2 | A2 notifications série et retour. Images OG dynamiques. | Idem. |
| 3 | Routines créées. Premières 2 pages SEO. Migrations push livrées. | Oui (Routines), push en attente de `SUPABASE_DB_URL`. |
| 4 à 12 | 2 pages + 20 fiches pays par semaine. Rapport hebdo. Site ES/DE/PT/IT réouvert progressivement. | Oui. |
| Mensuel | Audit technique, rafraîchissement de 8 pages. | Oui. |

## Ce qu'on regarde pour savoir si ça marche

| Indicateur | Aujourd'hui | Cible à 90 jours |
|---|---|---|
| Taux de partage (`daily_shared / daily_completed`) | à mesurer semaine 1 | ×3 |
| Parrainages aboutis (`referral_redeemed`) | 0 | > 0 chaque semaine, puis 5 % des nouveaux comptes |
| Rétention J7 | tableau « Rétention & habitude » | +5 points |
| Pages indexées / clics Search Console | inconnu (GSC non vérifiée) | 96 → 300 pages, clics ×3 |
| Installs organiques par semaine | App Store Connect / Play Console | ×2 |

Ces chiffres sont des objectifs de travail, pas des promesses : ils dépendent
de l'état réel des données, que je ne peux lire qu'avec le niveau B.

---

## Pour lancer

Réponds « go » : je crée les Routines et j'attaque A1 tout de suite. Si tu
colles les clés du niveau B quand tu as un quart d'heure, le reste s'enchaîne
sans toi.
