# Journal de croissance

> Tenu par les Routines Claude (voir `PLAN_PROMOTION.md`, niveau A5). Chaque
> entrée est datée ; les plus récentes en haut. Les chiffres viennent de
> PostHog quand la clé est disponible, sinon de ce qui est mesurable sans elle.

## File d'attente éditoriale (Routine « Contenu SEO »)

Les sujets, par ordre de priorité. La Routine prend les deux premiers non
cochés chaque lundi, les écrit en FR et EN (≥ 600 mots originaux, un tableau
propre, une FAQ, un bouton « Jouer » vers le mode concerné), puis les coche.

**Règle absolue : jamais de page mince.** Le site a perdu 196 pages générées
quasi vides après cinq refus AdSense (commit `aa5e5be`). Une page qui ne peut
pas être écrite sérieusement n'est pas publiée.

- [x] Quiz capitales d'Europe (29/09 : 45 pays dans le jeu, pas 44 ; angle « méthode par blocs », la liste existait déjà) — les 44 capitales, pièges (Suisse, Pays-Bas, Australie hors périmètre), méthode de mémorisation par blocs
- [x] Les drapeaux les plus difficiles du monde (29/09 : angle notoriété, les sosies restent dans le guide existant) — lesquels, pourquoi (paires, tricolores), comment les distinguer
- [x] Classement des pays par population (05/10 : angle concentration et paliers de mémorisation ; la partie « d'ici 2050 » est SAUTÉE, le dépôt ne contient aucune projection et aucun chiffre n'est inventé) — le top 30 avec les chiffres du jeu, ce qui change d'ici 2050
- [x] Classement des pays par superficie (05/10 : angle concentration, surprises, projection de Mercator) — top 30, les surprises (Kazakhstan, Algérie, RDC)
- [ ] Pays les plus petits du monde (12/10 : SAUTÉ — le guide micro-États contient déjà le tableau des 15 plus petits pays et leur histoire ; une page de plus ne ferait que le paraphraser, à rouvrir avec un angle propre, par ex. écart entre classement par superficie et par population) — micro-États et leur histoire, lien vers le guide micro-États
- [x] Capitales d'Afrique (12/10 : la liste et les capitales déplacées existaient déjà dans l'atlas ; angle « blocs de révision + neuf pays aux noms jumeaux ») — 54 pays, les capitales qui ne sont pas la plus grande ville
- [x] Capitales d'Asie (12/10 : angle « blocs + onze capitales à statut particulier », tableau `capital-set` ; Nusantara non retenue, le jeu garde Jakarta) — 48 pays, les capitales déplacées (Nur-Sultan/Astana, Naypyidaw, Nusantara)
- [x] Capitales d'Amérique du Sud (19/10 : angle « trois blocs + villes qui ne sont pas capitales », l'atlas couvrait déjà Sucre/Brasília) — 12 pays, Sucre/La Paz, Brasília
- [x] Drapeaux d'Afrique (19/10 : l'atlas en images existait ; angle « quatre familles » avec tableaux `flag-set`, 35 pays sur 54, les 19 autres volontairement non classés) — couleurs panafricaines, comment reconnaître les familles
- [x] Drapeaux nordiques (26/10 : angle « une règle sur la couleur du fond », tableaux `flag-set` et `capital-set` nordic ; Féroé et Åland hors périmètre) — la croix scandinave et ses variantes
- [x] Combien de pays en Europe (26/10 : de 42 à 51 selon la définition, décomptes calculés par `europe-count` ; le Kosovo, absent du jeu, est le seul chiffre ajouté à la main et signalé comme tel) — le débat (44 à 51), la liste du jeu
- [ ] Pays qui ont deux capitales (ou plus) — Bolivie, Afrique du Sud, Pays-Bas, Malaisie…
- [ ] Le jeu du globe : apprendre à situer les pays d'Asie centrale
- [ ] Frontières : les pays qui touchent le plus de voisins (Chine, Russie, Brésil)
- [ ] Devinez le pays : comment lire les indices (superficie, population, PIB) comme un géographe

### Fiches pays (195, à raison de 10 à 20 par semaine)

**Avancement : 50 / 195** (26/10 : Ukraine, Pologne, Ouzbékistan, Malaisie, Arabie Saoudite, Mozambique, Ghana, Pérou, Madagascar, Côte d’Ivoire, rangs 41 à 50 ; prochaine fournée : le Népal, 51ᵉ). Avant : 40 / 195 (19/10 : Ouganda, Espagne, Algérie, Irak, Argentine, Afghanistan, Canada, Yémen, Maroc, Angola, rangs 31 à 40 ; prochaine fournée : le Ghana ou le suivant par la population, 41ᵉ). Avant : 30 / 195 (12/10 : Royaume-Uni, Tanzanie, France, Afrique du Sud, Italie, Kenya, Birmanie, Colombie, Corée du Sud, Soudan, rangs 21 à 30 ; prochaine fournée : l'Ouganda, 31ᵉ). Avant : 20 / 195 (05/10 : Mexique, Japon, Égypte, Philippines, RD Congo, Viêt Nam, Iran, Turquie, Allemagne, Thaïlande, ranks 11 à 20 ; prochaine fournée : le Royaume-Uni, 21ᵉ). Avancement du 29/09 : 10 / 195 (29/09, les 10 pays les plus peuplés : Inde, Chine, États-Unis, Indonésie, Pakistan, Nigéria, Brésil, Bangladesh, Russie, Éthiopie). Gabarit livré : `COUNTRY_PAGES` dans `routes.mjs`, textes dans `site/content/<langue>/country-<cca3>.html`, garde-fou `checkCountryPages` (≥ 200 mots écrits, ≤ 25 % de phrases communes entre fiches). Prochaine fournée : le Mexique (11ᵉ par la population) et suivants. Le gabarit décrit ci-dessous a servi de base (`site/lib/routes.mjs`
kind `country`, URL `/pays/<slug>/` et `/en/country/<slug>/`, données lues dans
`assets/countries_stats.json`, tableau des voisins, drapeau, capitale, bouton
« Jouer » vers Devinez le pays) puis livre les 10 premières, par ordre de
population décroissante. Chaque fiche porte 200 à 400 mots ORIGINAUX par
langue ; un garde-fou dans `site/lib/validate.mjs` refuse toute fiche sous le
seuil.

## Entrées

### 2026-10-23 — rapport hebdo (sans PostHog)

- Pas de `POSTHOG_PERSONAL_API_KEY` dans la session : aucun indicateur produit mesuré. `playgeog.com` est bloqué par le réseau de la session (403 sur CONNECT) : sitemap et PageSpeed non mesurés, pas de nouvel essai.

| Mesurable sans clé | Valeur (vs 16/10) |
|---|---|
| Commits sur 7 jours | 13 (14), dernier : 22/10 |
| Pages ajoutées dans `site/content` | 0 (116 fichiers, inchangé) |
| Cases cochées de la file éditoriale | 0 / 15 |
| Taux partage/complétion, parrainages, rétention | non mesuré |

Faits saillants :
1. Semaine centrée monétisation : interstitiels (toutes les 12 puis 6 min, aussi entre parties enchaînées), écran « pause pub 3-2-1», bannières menu/résultats, filtres et graphiques pubs dans le /hq ; notes v5.7.0.
2. Côté jeu : Israël redessiné sur le globe, zoom des Régions, écran de fin unifié pour Capitales et Drapeaux. Risque à surveiller : la fréquence accrue des pubs peut peser sur la rétention, invisible sans PostHog.
3. Quatrième semaine consécutive sans page SEO : la Routine « Contenu SEO » ne livre rien (0 case cochée, 116 fichiers inchangés).

Décision : (a) réparer la Routine « Contenu SEO » en priorité (4 lundis sans livraison) ; (b) fournir `POSTHOG_PERSONAL_API_KEY` et autoriser `playgeog.com` à cette Routine, sinon impossible de vérifier l'effet des pubs toutes les 6 min sur la rétention J1/J7 ; (c) file éditoriale non réordonnée, aucune donnée ne le justifie.

### 2026-10-16 — rapport hebdo (sans PostHog)

- Pas de `POSTHOG_PERSONAL_API_KEY` dans la session : aucun indicateur produit mesuré. `playgeog.com` est bloqué par le réseau de la session (403 sur CONNECT) : sitemap et PageSpeed non mesurés, pas de nouvel essai.

| Mesurable sans clé | Valeur (vs 09/10) |
|---|---|
| Commits sur 7 jours | 13 (31), dernier : 15/10 |
| Pages ajoutées dans `site/content` | 0 (116 fichiers, inchangé) |
| Cases cochées de la file éditoriale | 0 / 15 |
| Taux partage/complétion, parrainages, rétention | non mesuré |

Faits saillants :
1. Semaine centrée outillage interne : onglets Vidéos et Croissance du /hq, rotation des vidéos sociales du soir, favicon du site, notes v5.7.0 ; côté jeu, plus de score solo en match en ligne pour Rankle, Plus ou moins et Série.
2. Troisième semaine consécutive sans page SEO : la Routine « Contenu SEO » ne livre rien (aucune case cochée, 116 fichiers inchangés).
3. Les indicateurs A1/A2 (`solo_shared`, `referral_shared`, `install_cta_pressed`, `comeback_granted`) restent sans information, faute d'accès PostHog.

Décision : (a) priorité à la réparation de la Routine « Contenu SEO » (3 lundis sans livraison) ; (b) fournir `POSTHOG_PERSONAL_API_KEY` et autoriser `playgeog.com` dans l'environnement de cette Routine, sinon ce rapport reste aveugle ; (c) file éditoriale non réordonnée, aucune donnée ne le justifie.

### 2026-10-09 — rapport hebdo (sans PostHog)

- Pas de `POSTHOG_PERSONAL_API_KEY` dans la session : aucun indicateur produit mesuré. `playgeog.com` est bloqué par le réseau de la session (403 sur CONNECT) : sitemap et PageSpeed non mesurés, pas de nouvel essai.

| Mesurable sans clé | Valeur (vs 02/10) |
|---|---|
| Commits sur 7 jours | 31 (10), dernier : 08/10 |
| Pages ajoutées dans `site/content` | 0 (116 fichiers, inchangé) |
| Cases cochées de la file éditoriale | 0 / 15 |
| Taux partage/complétion, parrainages, rétention | non mesuré |

Faits saillants :
1. Semaine dominée par l'automatisation des vidéos sociales (tournage, montage, publication TikTok/Instagram/YouTube) ; côté produit : v5.7.0, correctif Globe 3D, corrections Sentry.
2. Deuxième semaine sans aucune page SEO publiée : la Routine « Contenu SEO » ne livre toujours rien (aucune case cochée, 116 fichiers inchangés).
3. Les indicateurs A1/A2 (`solo_shared`, `referral_shared`, `install_cta_pressed`, `comeback_granted`) restent sans information, faute d'accès PostHog.

Décision : (a) vérifier que la Routine « Contenu SEO » tourne bien le lundi (clé, droits, échecs silencieux) ; (b) fournir `POSTHOG_PERSONAL_API_KEY` à cette Routine pour mesurer l'effet des vidéos sociales sur les installs ; (c) file éditoriale non réordonnée, aucune donnée ne le justifie.

### 2026-10-26 — Contenu SEO de la semaine

- Base : les PR #6, #15, #33 et #55 (SEO des 29/09 au 19/10) sont encore ouvertes et empilées ; la branche fusionne #55 (qui contient les trois autres) pour réutiliser le gabarit `country` et ne reprend aucun de leurs sujets. À fusionner d'un bloc, ou dans l'ordre #6, #15, #33, #55 puis celle-ci.
- Pages : `/guides/drapeaux-nordiques/` et `/guides/combien-de-pays-en-europe/` + EN (`/en/guides/nordic-flags/`, `/en/guides/how-many-countries-in-europe/`) ; nouveaux tableaux `europe-count` (scénarios et blocs), `flag-set:nordic`, `capital-set:nordic` et `capital-set:europe-borderline`. Ajoutées au sommaire des guides et à deux pages sœurs chacune (drapeaux : `guide-flags`, `atlas-flags-europe` ; Europe : `atlas-countries-europe`, `guide-countries-count`).
- 10 fiches pays de plus (rangs 41 à 50 par la population), FR + EN. Total : 50.
- Rafraîchissement : `atlas-countries-europe` (proportion de pays enclavés corrigée : l'Europe est devant l'Afrique, pas derrière ; liste des quatre micro-États précisée) et `atlas-flags-europe` (le blason n'est pas porté par la Tchéquie ; ordre des couleurs de la Serbie et de la Croatie ; croix norvégienne et islandaise décrites), FR + EN, `modified` passé au 26/10.
- Sauté : « Pays les plus petits du monde » reste en attente d'un angle propre (voir la file).

### 2026-10-19 — Contenu SEO de la semaine

- Base : les PR #6, #15 et #33 (SEO des 29/09, 05/10, 12/10) sont encore ouvertes et empilées ; la branche part de #33 (gabarit `country`) et ne reprend aucun de leurs sujets. À fusionner dans l'ordre #6, #15, #33, puis celle-ci.
- Pages : `/guides/quiz-capitales-d-amerique-du-sud/` et `/guides/familles-de-drapeaux-africains/` + EN (`/en/guides/south-america-capitals-quiz/`, `/en/guides/african-flag-families/`) ; nouveaux tableaux `flag-set` (4 familles) et 3 ensembles `capital-set` pour l'Amérique du Sud. Ajoutées au sommaire des guides et à 4 pages sœurs (atlas drapeaux d'Afrique, atlas capitales d'Amérique du Sud, guides drapeaux et capitales).
- 10 fiches pays de plus (rangs 31 à 40 par la population), FR + EN. Total : 40.
- Rafraîchissement : aucune page n'a un `modified` de plus de 60 jours (la plus ancienne date du 23/08, soit 57 jours), rien relu ni redaté.
- Sauté : « Pays les plus petits du monde » reste en attente d'un angle propre (voir la file).

### 2026-10-12 — Contenu SEO de la semaine

- Base : les PR #6 (29/09) et #15 (05/10) sont encore ouvertes, #15 contient #6 ; la branche part de #15 pour réutiliser le gabarit `country` et ne reprend aucun de leurs sujets. À fusionner dans l'ordre #15 puis celle-ci.
- Pages : `/guides/quiz-capitales-d-afrique/` et `/guides/quiz-capitales-d-asie/` + EN (`/en/guides/africa-capitals-quiz/`, `/en/guides/asia-capitals-quiz/`) ; nouveau tableau `capital-set` et libellés de sous-régions africaines et asiatiques pour `capital-blocks`.
- Sauté : « Pays les plus petits du monde » (redite du guide micro-États, voir la file).
- 10 fiches pays de plus (rangs 21 à 30 par la population), FR + EN. Total : 30.
- Rafraîchissement : aucune page n'a un `modified` de plus de 60 jours (la plus ancienne date du 23/08, soit 50 jours), rien relu ni redaté.

### 2026-10-05 — Contenu SEO de la semaine

- Base : la PR #6 (SEO du 29/09) était encore ouverte ; la branche la fusionne pour réutiliser le gabarit `country` sans le dupliquer. Ses deux sujets (capitales d'Europe, drapeaux difficiles) ne sont pas repris.
- Pages : `/guides/pays-par-population/`, `/guides/pays-par-superficie/` et leurs versions EN (`/en/guides/countries-by-population/`, `/en/guides/countries-by-area/`) ; nouveaux tableaux `population-top` et `area-top` (parts et parts cumulées calculées depuis `countries_stats.json`).
- 10 fiches pays de plus (rangs 11 à 20 par la population), FR + EN. Total : 20.
- Rafraîchissement : aucune page n'a un `modified` de plus de 60 jours (la plus ancienne date du 23/08, soit 43 jours), rien relu.
- Sauté : la partie « ce qui change d'ici 2050 » du sujet population, faute de projection dans les données du dépôt.

### 2026-09-29 — Contenu SEO de la semaine

- Pages : `/guides/quiz-capitales-d-europe/`, `/guides/drapeaux-les-plus-difficiles/` et leurs versions EN.
- 10 premières fiches pays FR + EN (`/pays/…`, `/en/country/…`), listées dans le sommaire des guides.
- Rafraîchissement : aucune page n'a un `modified` de plus de 60 jours (la plus ancienne date du 23/08), rien relu cette semaine.

### 2026-10-02 — rapport hebdo (sans PostHog)

- Pas de `POSTHOG_PERSONAL_API_KEY` dans la session : aucun indicateur produit mesuré. `playgeog.com` est bloqué par le réseau de la session (403 sur CONNECT) : sitemap et PageSpeed non mesurés, pas de nouvel essai.

| Mesurable sans clé | Valeur |
|---|---|
| Commits sur 7 jours | 10 (dernier : 01/10) |
| Pages ajoutées dans `site/content` | 0 (116 fichiers au total) |
| Cases cochées de la file éditoriale | 0 / 15 |
| Taux partage/complétion, parrainages, rétention | non mesuré |

Faits saillants :
1. Semaine centrée produit : /hq (tableau de bord privé), classement combiné du Défi du Jour, bouton de langue, notes v5.7.0.
2. Aucune page SEO publiée : la Routine « Contenu SEO » n'a rien livré depuis le 23/09.
3. Les indicateurs A1/A2 (`solo_shared`, `referral_shared`, `install_cta_pressed`, `comeback_granted`) restent à zéro information, faute d'accès PostHog.

Décision : poser `POSTHOG_PERSONAL_API_KEY` et autoriser `playgeog.com` dans l'environnement de la Routine ; vérifier pourquoi « Contenu SEO » n'a pas tourné. File éditoriale inchangée (pas de données pour la justifier).

### 2026-09-23 — première chaîne complète

- PR #2 et #3 fusionnées ; CI de `master` verte (elle était rouge depuis le
  16/09 : lint sur `plugins/withoutAppleSignIn.js`).
- `eas-update.yml` : premier run en échec (eas-cli 24 exige Node 22), corrigé,
  deuxième run OK → canal `production` créé, mise à jour publiée pour le
  runtime 5.7.0.
- `release.yml` lancé à la main (le proxy git des sessions Claude refuse le
  push de tags ; `workflow_dispatch` fait le même travail) : Android
  versionCode 23 et iOS build 50 en cours sur EAS, **sans envoi aux stores**
  (secrets Play et App Store Connect absents). À envoyer depuis expo.dev, ou
  poser les secrets pour que ce soit automatique la prochaine fois.
- Tant que 5.7.0 n'est pas dans les stores, les joueurs mobiles n'ont ni les
  nouveautés A1/A2 ni la mise à jour à chaud. Le web (`playgeog.com`) les a.

### 2026-09-22 — mise en place

- Infrastructure : EAS Update (mise à jour à chaud du JS), workflows
  `release.yml`, `eas-update.yml`, `migrate.yml`.
- A1 : « Défier un ami » sur toutes les fins de partie solo ; relance
  parrainage (après 3 parties, une fois par semaine) ; `daily_completed` porte
  `streak` et `signed_in` ; le bonus de série est tracé sur le chemin de
  synchronisation aussi.
- A2 : notification « série en danger » (20 h locales ou 3 h avant minuit UTC) ;
  bonus de retour après 7 jours (30 pièces, RPC `claim_comeback`) ; demande de
  note après une victoire en classé ; deux campagnes push (absents 14 j,
  jamais joué en ligne).
- A3 : Smart App Banner iOS et cartes Twitter sur `/play` ; bouton
  « Installer l'app » sur les fins de partie web.
- À mesurer dès la semaine prochaine : `solo_shared / game_completed`,
  `referral_shared` par `source`, `install_cta_pressed`, `comeback_granted`.
