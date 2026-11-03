# Portails de jeux web et H5 Games Ads (03/11/2026)

Deux façons de gagner de l'argent avec la version web, sans attendre AdSense :

1. **Publier GeoG sur CrazyGames et GameDistribution.** Ils servent le jeu dans
   leur site, y mettent leurs pubs (interstitiels et récompensées) et
   reversent une part des revenus. Surtout, ils apportent des joueurs.
2. **H5 Games Ads (Google)** sur playgeog.com/play : interstitiels et
   récompensées dans le jeu, comme sur mobile. C'est sur candidature.

## Ce qui est fait dans le code

### Un build par portail

```
npm run build:portal -- crazygames
npm run build:portal -- gamedistribution --gd-id <GAME_ID>
```

Sortie : `dist-portal/geog-<portail>.zip`, prêt à déposer (index.html à la
racine, ~20 Mo zippé, 343 fichiers). Le script (`scripts/build-portal.mjs`) :

- active le **mode portail** par la variable de build `EXPO_PUBLIC_PORTAL`.
  Elle n'existe que dans ce build : l'app iOS/Android, les mises à jour OTA
  et playgeog.com ne changent pas (tout est no-op quand elle est absente) ;
- rend tous les chemins **relatifs** (le portail sert le jeu dans un
  sous-dossier, CrazyGames refuse les chemins absolus), et échoue bruyamment
  si le format du bundle Expo change ;
- injecte le SDK du portail, `user-select: none`, et retire du zip les
  fichiers du site (guides, ads.txt, hq…) ;
- prend les clés publiques (Supabase anon, PostHog, Sentry) dans `eas.json`,
  donc pas besoin de `.env`.

Option `--url <page du jeu sur le portail>` : une fois le jeu publié, relancer
le build avec l'URL publique pour que « Défier un ami » partage ce lien.
Sans elle, le partage se fait sans lien.

### Ce que change le mode portail (src/lib/portal.ts)

| Règle du portail | Ce que fait GeoG |
| --- | --- |
| Seules les pubs du SDK du portail | Interstitiels et récompensées passent par le SDK (CrazyGames `requestAd`, GameDistribution `showAd`). Ni AdSense, ni rails, ni AdMob. |
| Pas de pub sur un bouton de navigation (CrazyGames) | Interstitiel seulement entre deux parties (« Nouvelle partie », « Rejouer », « Niveau suivant »), jamais au retour au menu. Sur GameDistribution, aussi au retour au menu. |
| Fréquence | Gérée par le SDK du portail (3 min minimum chez CrazyGames). Notre `interstitialGate` est ignoré là-bas. |
| Pause pendant la pub | La partie suivante ne démarre qu'après la pub ; le son est coupé pendant (`audioGate.ts`). |
| Pre-roll (GameDistribution) | Une pub au premier « Jouer », avant le lancement de la partie. C'est elle qui active le jeu chez GD. |
| Récompensée : jamais de bouton mort | « Toutes les vies » (mode Histoire) marche en invité. Les options qui demandent des pièces (donc un compte) sont cachées. |
| Pas de connexion externe | Tout se joue en invité : bandeau d'inscription, onglet « Connexion », duel en ligne et messages « Connecte-toi pour… » cachés. L'onglet du bas devient « Classement ». |
| Pas de lien vers les stores ni vers une autre version jouable | Boutons « Installer l'app » cachés, liens de partage vers playgeog.com remplacés. |
| Événements | `loadingStart/Stop` au démarrage, `gameplayStart/Stop` quand une partie est à l'écran. |
| `muteAudio` (CrazyGames) | Respecté, prioritaire sur notre réglage. |
| Mention données personnelles | Lien discret « Confidentialité » en bas du menu. |
| Anglais obligatoire | Déjà là (16 langues, détection automatique). |

Vérifié au navigateur sur les deux zips servis depuis un sous-dossier, avec
les SDK simulés (les vrais domaines des SDK sont bloqués dans mon
environnement) : menu, Duel (local uniquement), Higher or Lower jusqu'à la
défaite puis « Nouvelle partie » → midgame demandé, vu, puis la partie
repart. GameDistribution : pre-roll au premier mode lancé, la partie ne
s'ouvre qu'après. Tests unitaires : `src/lib/__tests__/portal.test.ts`.

⚠️ **À vérifier sur le vrai SDK** : le premier dépôt sur CrazyGames (outil
Preview) et sur GameDistribution (lancer le jeu depuis l'admin et regarder le
pre-roll en entier, c'est ce qui active l'intégration).

### H5 Games Ads sur playgeog.com/play

L'intégration Ad Placement API existait déjà (`adsWeb.ts`, rewarded +
interstitiel, sous `web_ads`). Ajouts :

- **Nouveau flag `h5_games_ads`** (`h5_games_ads.sql`, créé à false) : il
  allume les ad breaks **sans** les rails display. Utile si Google accepte le
  jeu dans H5 Games Ads avant d'approuver le site AdSense. `web_ads` continue
  de tout allumer.
- L'interstitiel suit la nomenclature de l'API : `next` quand on enchaîne
  une partie, `browse` au retour au menu.
- Son coupé pendant la pub (`beforeAd` / `afterAd`).
- Correctif : `/play` chargeait déjà `adsbygoogle.js` dans son `<head>` et
  l'app en injectait une **seconde** copie. Le `<head>` de /play porte
  maintenant les attributs de l'API (`data-ad-client`,
  `data-ad-frequency-hint="60s"`) et l'app ne réinjecte plus la bibliothèque.

Pour tester avant l'acceptation : voir « Tester avant l'approbation » dans
`guide-pubs-web.md` (mode test `data-adbreak-test`).

## À faire par Paul

### CrazyGames (le plus de trafic)

1. Créer un compte développeur : https://developer.crazygames.com
2. « Submit a game » → HTML5 → déposer `geog-crazygames.zip`.
3. Renseigner la fiche avec les textes ci-dessous, les trois couvertures
   (1920×1080, 800×1200, 800×800) et les orientations : **paysage et
   portrait**, mobile **oui**.
4. Tester dans l'outil **Preview** de la console avant d'envoyer.
5. Renseigner les infos de paiement (PayPal ou virement) dans le profil.

Le jeu part d'abord en « Basic Launch » (sans pub, pour mesurer l'intérêt
des joueurs). S'il est retenu pour le « Full Launch », les pubs s'activent
toutes seules : le SDK est déjà intégré.

Facultatif mais recommandé : une **vidéo d'aperçu** de 15 à 20 s, sans son,
en 1080p paysage ET portrait (les vidéos TikTok existantes peuvent servir de
base, sans les textes promotionnels).

### GameDistribution

1. Créer un compte développeur : https://gamedistribution.com (Developers).
2. Créer le jeu dans le tableau de bord pour obtenir son **Game ID**
   (32 caractères) et me l'envoyer : je fais le zip (ou
   `npm run build:portal -- gamedistribution --gd-id <ID>`).
3. Déposer le zip, puis ouvrir le jeu depuis l'admin GD et **regarder le
   pre-roll en entier** (bloqueur de pub désactivé) : c'est ce qui active
   l'intégration.
4. Remplir la fiche (textes ci-dessous, vignettes 512×384, 512×512, 200×120)
   et les infos de paiement.

### H5 Games Ads (Google)

1. Formulaire : https://adsense.google.com/start/h5-beta (il faut un compte
   AdSense, celui de `ca-pub-2429865520138981`).
2. Réponses proposées ci-dessous.
3. Si accepté : `UPDATE public.feature_flags SET enabled = true WHERE key =
   'h5_games_ads';` après avoir exécuté `h5_games_ads.sql`. Les
   interstitiels suivent aussi `interstitial_ads_v2`, la récompensée
   `rewarded_ads`.

## Textes de soumission

**Titre** : GeoG — Geography Games

**Description courte (EN)** :
Guess flags, find countries on the globe, rank them by population. 13 quick
geography games and a new daily challenge every day.

**Description (EN)** :
GeoG is a collection of short geography games. Find countries on a 3D globe,
recognize flags and capitals, guess a country from its silhouette, link two
countries through their land borders, pick which one has the higher
population, GDP or tourism, and cut a country into equal population shares.

Every day brings a fresh puzzle for each mode, the same for every player:
build a streak and compare your score. Story mode climbs through 1,000
levels, from the obvious to the obscure. Play against a friend on the same
screen in Duel. Available in 16 languages.

**Contrôles (EN)** : Mouse or touch. Tap or click an answer; drag to spin
the globe, scroll or pinch to zoom. Type a country name where asked.

**Catégorie** : Quiz / Trivia (CrazyGames : Puzzle → Quiz). Tags :
geography, flags, quiz, countries, map, educational, trivia, capitals.

**Description (FR)** :
GeoG, ce sont des petits jeux de géographie. Trouver un pays sur le globe en
3D, reconnaître drapeaux et capitales, deviner un pays à sa silhouette,
relier deux pays par leurs frontières, choisir lequel a la plus grande
population, le plus gros PIB ou le plus de touristes, partager un pays en
parts égales de population. Chaque jour, un défi par mode, le même pour
tous. Un mode Histoire de 1 000 niveaux, et des duels à deux sur le même
écran. 16 langues.

### Candidature H5 Games Ads (réponses proposées)

- **URL du jeu** : https://playgeog.com/play
- **Type** : jeu HTML5 propriétaire, développé en interne (React Native Web).
- **Description** : 13 jeux de géographie courts (globe 3D, drapeaux,
  capitales, silhouettes, frontières, comparaisons), un défi quotidien et un
  mode histoire de 1 000 niveaux. Aussi disponible sur iOS et Android, où
  les mêmes emplacements tournent déjà avec AdMob.
- **Emplacements prévus** : interstitiel entre deux parties (`next`) et au
  retour au menu (`browse`), plafonné par notre propre garde (une pub toutes
  les 6 min de jeu, plafond journalier) en plus de l'API ; récompensée à la
  demande du joueur (recharger ses vies en mode histoire, multiplier ses
  pièces). Jamais pendant une partie, aucun bandeau sur mobile.
- **Audience** : à remplir avec les chiffres PostHog du web (visiteurs
  mensuels de /play, pays principaux).
