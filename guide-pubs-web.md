# Pubs sur le web — état et marche à suivre (mis à jour le 16/08/2026)

## Où on en est

Le site a été **refusé par AdSense** le 16/08/2026, pour deux motifs :

1. « Annonces diffusées sur des pages ou écrans sans contenu d'éditeur »
2. « Contenu à faible valeur informative »

La cause était structurelle, et mesurable : le `vercel.json` réécrivait **toutes**
les URLs vers la coquille de la SPA. Un robot qui visitait `/play`, `/guides` ou
n'importe quelle URL inventée recevait un HTTP 200 contenant 51 caractères
(« You need to enable JavaScript to run this app. »). Le site n'avait donc,
vu de l'extérieur, qu'**une seule page de contenu** — la landing, purement
promotionnelle — et une infinité de pages vides. S'ajoutait le fait que toute la
landing était en `opacity:0` tant que JavaScript n'avait pas tourné.

## Ce qui a été corrigé (16/08/2026)

**Contenu éditorial** — six guides rédigés, environ 7 000 mots au total, plus les
pages institutionnelles :

- `/guides/` — le hub
- `/guides/combien-de-pays-dans-le-monde/`
- `/guides/drapeaux-du-monde/`
- `/guides/capitales-du-monde/`
- `/guides/frontieres-terrestres/`
- `/guides/memoriser-les-drapeaux/`
- `/guides/reviser-la-geographie/`
- `/a-propos/` (éditeur, sources des données, financement) et `/contact/`

Ce sont des pages HTML statiques dans `public/`, servies telles quelles : aucune
dépendance à JavaScript, lisibles par n'importe quel robot. Style partagé dans
`public/guides.css`.

**Routage** — `vercel.json` ne réécrit plus que `/play` et `/daily` vers
`app.html`. Tout le reste tombe sur le système de fichiers, et les URLs
inexistantes renvoient un vrai 404 (`public/404.html`, sans script publicitaire :
le règlement interdit les annonces sur les pages d'erreur).

**Coquille de l'app** — `scripts/postbuild-web.mjs` remplace l'ancien
`mv` / `cp` du buildCommand. Il donne à `app.html` un vrai `<head>` (titre,
description, canonical, Open Graph) et un `<noscript>` qui décrit le jeu et
renvoie vers les guides. Plus aucune URL du site ne rend une page blanche.
Le script échoue bruyamment si le template Expo change, pour ne jamais déployer
une coquille non traitée.

**Landing** — repli `<noscript>` sur les animations `.rv` (le contenu ne peut
plus rester invisible), section « Les guides » et liens de pied de page.

## Les rails dans le jeu (16/08, deuxième passe)

Les rails avaient d'abord été démontés d'App.tsx. Ils sont **remontés**, mais
il a fallu régler d'abord un bug qui les rendait inopérants.

**Le bug.** `railSize()` supposait un jeu centré sur 600px, laissant des
gouttières libres. Mesuré sur la production : l'application occupait
**toute la largeur, 0 → 1600px**. Les rails étaient bien rendus, mais placés
derrière le jeu (`zIndex: 0`, pour ne jamais le masquer), donc intégralement
recouverts. Vérifié en injectant deux rails orange vif sur la prod : invisibles,
`elementFromPoint` renvoyait un élément de l'app. Autrement dit, activer
`web_ads` n'aurait produit **aucune impression**.

**Le correctif.** `DesktopStage` (web uniquement) borne le jeu à une colonne
centrée de **900px** au-delà de cette largeur, et fournit cette largeur via
`useStageWidth()` (lib/stage.ts) aux écrans qui se dimensionnent à l'espace
disponible — MainMenu, StoryMap, GuessCountryGame, RoundSummary. Sous 900px de
fenêtre le composant s'efface : mobile et natif strictement inchangés.

`railSize()` dérive désormais ses seuils de la colonne : un rail n'apparaît que
s'il tient dans la gouttière avec 30px de marge de chaque côté. D'où
**160×600 dès 1340px** et **300×600 dès 1620px**, et `railOffset()` qui centre
le rail dans sa gouttière.

Vérifié au navigateur à 1440px et 1920px : menu, mode Globe, carte Histoire et
tutoriel d'accueil rendus dans la colonne, sans débordement ni erreur console,
et les rails visibles dans les gouttières.

⚠️ **Risque restant** : le motif de refus n°1 visait les annonces sur des écrans
sans contenu d'éditeur. `/play` reste un écran de jeu. Tant que `web_ads` est à
`false`, rien ne s'affiche et l'examen n'est pas menacé — c'est pour ça que le
flag ne doit être activé **qu'après** l'approbation du site. Pour consolider,
il faudra enrichir `/play` d'un vrai contenu (règles, conseils, description des
modes) autour du jeu.

## Répartition cible des formats

| Surface | Format | État |
| --- | --- | --- |
| Pages de contenu, **ordi ≥1120px** | 2 rails verticaux (160×600, ou 300×600 ≥1520px) + 1 pavé 336×280 dans l'article | injectés par `public/ads-content.js` |
| Pages de contenu, **mobile et tablette** | **aucune publicité, jamais** | garanti par le code |
| Écrans de jeu, **ordi ≥1340px** | 2 rails verticaux dans les gouttières de la colonne de jeu | remontés le 16/08, sous flag `web_ads` |
| Écrans de jeu, **mobile et tablette** | **aucun rail** | garanti par `railSize()` |
| Écrans de jeu, toutes tailles | Rewarded + interstitiel (Ad Placement API, format prévu pour les jeux) | codé, sous flag `web_ads` |
| Pages d'erreur (`/404`) | aucune publicité | conforme |

## ⚠️ NE PAS activer les Auto ads

Règle produit : **jamais de bandeau publicitaire sur mobile.** Les « Auto ads »
d'AdSense font exactement l'inverse — elles décident seules des formats et
placent en priorité des bandeaux d'ancrage collés en bas de l'écran mobile. Elles
doivent donc rester **désactivées** dans la console.

Les emplacements sont pilotés par le code à la place, dans
[public/ads-content.js](public/ads-content.js) :

- rien n'est injecté en dessous de 1120px de large ou 660px de haut ;
- mieux, **la bibliothèque AdSense n'est même pas chargée** sous ce seuil : sur
  téléphone, le script `adsbygoogle` n'existe pas dans la page, donc des Auto ads
  activées par erreur n'auraient rien à quoi s'accrocher ;
- une unité dont le slot id est vide est simplement ignorée.

Vérifié au navigateur sur le build : 0 requête publicitaire à 390px et à 900px,
2 rails à 1440px.

Le troisième slot (`inArticle`, format « In-article ») n'existe pas encore :
créer l'unité dans la console et coller son id dans `SLOTS.inArticle`. Tant
qu'il est vide, seuls les deux rails s'affichent.

## À faire par Paul

1. **Déployer le web** sur Vercel (le contenu doit être en ligne avant la
   demande d'examen).
2. **Vérifier dans la console AdSense** que les deux unités display existent
   bien et correspondent aux ids codés en dur dans
   [src/lib/adsWeb.ts](src/lib/adsWeb.ts) (`2383979543` et `7231760353`). Ces
   ids n'ont jamais servi : si ce sont des placeholders, les rails ne
   diffuseront jamais rien le jour où on les remontera.
3. **Demander le nouvel examen** : AdSense → Sites → playgeog.com → Demander un
   examen. Compter de quelques jours à deux semaines.
4. **RGPD** : AdSense → Confidentialité et messages → créer le message de
   consentement. Sans lui, publicités non personnalisées en UE, donc revenus
   nettement plus faibles.

## Après l'approbation

- **Les pubs display des pages de contenu s'affichent toutes seules** dès que le
  site est approuvé : les unités sont déjà dans les pages, elles restent vides
  en attendant. Aucun redéploiement, et surtout **pas d'Auto ads** (voir plus
  haut). Vérifier simplement que les slot ids sont les bons.
- **Activer le rewarded web** : `UPDATE public.feature_flags SET enabled = true
  WHERE key = 'web_ads';` (effet en ~5 min, le temps du cache des flags).
  ⚠️ `rewarded_ads` étant déjà à `true`, ce flag allume le rewarded web d'un
  seul coup. L'interstitiel reste éteint tant que `interstitial_ads` est à
  `false`.
- **Remonter éventuellement les rails desktop dans le jeu** : réinsérer
  `<SideRailAds />` dans App.tsx. À ne faire qu'après avoir enrichi `/play` en
  vraie page (titre, description du mode, règles, conseils autour de l'app),
  sinon on retombe sous le motif n°1. C'est le pattern des portails de jeux.

## Kill-switch

- `web_ads` à `false` coupe tout le web côté application.
- Les Auto ads se coupent depuis la console AdSense.
- Les claims restent 100 % côté serveur, le flag est revérifié dans les RPC.

## Tester avant l'approbation

En dev (`npm run web`), le script est injecté avec `data-adbreak-test="on"` :
les ad breaks rewarded/interstitiel montrent de fausses pubs Google, sans risque
de sanction. Pour tester sur un preview Vercel, passer temporairement
`FORCE_ADBREAK_TEST = true` dans `adsWeb.ts` (et le remettre à `false` avant la
prod). Les unités display, elles, ne servent rien tant que le site n'est pas
approuvé — c'est normal.
