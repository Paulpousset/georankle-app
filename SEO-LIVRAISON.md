# SEO — ce qui a été livré

> Exécution du plan SEO playgeog.com, le **23/08/2026**.
> Le constat de départ est dans [SEO-AUDIT.md](SEO-AUDIT.md).
> **Rien n'est commité ni déployé** : tout est dans l'arbre de travail.

---

## En une ligne

Le site public passe de **11 pages françaises à 96 pages en deux langues, à
parité complète** (48 FR + 48 EN), générées depuis une table de routes unique,
avec `hreflang` réciproques, données structurées complètes et sitemap
automatique — et la performance mobile de l'accueil passe de **66 à 92**.

| | Avant | Après |
|---|---|---|
| Pages indexables | 11 (FR) | **96** — 48 FR + 48 EN |
| Mots de contenu | ~14 500 | **~50 400**, entièrement réécrits ou traduits |
| `hreflang` | aucun | 96 pages, réciprocité vérifiée au build |
| Types JSON-LD | 4, sans dates | **7**, dates réelles, FAQ extraite du HTML |
| Sitemap | manuel, `lastmod` figé | généré, `lastmod` déclaré, `xhtml:link` |
| Lighthouse mobile · accueil | **66** · LCP 6,0 s · 1 053 Ko | **92** · LCP 3,1 s · 371 Ko |
| Lighthouse mobile · guide | **84** · LCP 3,6 s · 359 Ko | **99** · LCP 1,8 s · 128 Ko |
| Accessibilité | 94 / 93 | 95 / 95 |
| Erreurs de lint | 47 | **0** |
| Tests | 843 | **852** |

---

## La brique qui débloquait tout : un générateur

L'audit avait identifié le blocage : **il n'existait aucun moteur de template**.
Le `<head>`, la nav, le fil d'Ariane et le pied de page étaient recopiés à la
main dans quinze fichiers. Le plan demandait partout un « helper unique » —
rien ne pouvait l'accueillir.

C'est l'option (A) de l'audit qui a été retenue : un générateur Node maison,
sans dépendance, décrit dans [site/README.md](site/README.md).

```
site/
  build.mjs              point d'entrée ; --check valide sans dist
  lib/routes.mjs         LA table des URL — hreflang, canonical, sitemap, liens internes
  lib/constants.mjs      195 pays, 41 thèmes, 300 niveaux, 12 modes — DÉRIVÉS des sources du jeu
  lib/tables.mjs         12 familles de tableaux générés depuis assets/
  lib/layout.mjs         le gabarit unique
  lib/jsonld.mjs         VideoGame · Article · FAQPage · BreadcrumbList · ItemList
  lib/validate.mjs       les garde-fous qui font échouer le build
  content/<langue>/      94 fragments de contenu
```

`scripts/postbuild-web.mjs` a été absorbé et supprimé ; `vercel.json` appelle
désormais `node site/build.mjs`.

### Les garde-fous

Le build **échoue** — il ne prévient pas, il refuse de publier — si :

- un `hreflang` n'est pas réciproque, ou si une page ne s'auto-référence pas ;
- un alternate pointe vers une langue qui n'existe pas pour cette page ;
- un `canonical` ne pointe pas vers la page elle-même ;
- deux pages partagent un titre dans la même langue ;
- un lien interne mène à une URL que le site ne produit pas ;
- un `<link rel="preload">` désigne un fichier absent ;
- une directive de contenu est inconnue, ou un fragment manquant ;
- une capture d'écran, une police ou un `srcset` désigne un fichier absent ;
- les six continents ne couvrent pas exactement les 195 pays.

`npm run site:check` fait tout cela **en mémoire, sans build Expo** (3 s), et
tourne maintenant dans la CI. Une erreur de réciprocité est silencieuse en
production : elle n'attend plus le déploiement pour se voir.

---

## Phase par phase

### Phase 5 — technique

**5.1 · Le nombre de pays.** L'audit avait établi que « 197 » n'était pas une
incohérence mais une **erreur** : le jeu contient 195 pays, et notre propre
guide pilier le documente. Corrigé, et surtout **centralisé** :
`site/lib/constants.mjs` lit `assets/countries_stats.json`, `game_data.json` et
`src/data/story.ts`. Un pays ajouté au jeu met le site à jour tout seul.

Trois autres chiffres faux ont été trouvés au passage sur la page d'accueil :
**« 6 langues »** (le jeu en parle deux), le nombre de modes et de niveaux, qui
étaient en dur. Tous dérivés désormais.

**5.2 · Sitemap.** Généré au build, 72 URL, `lastmod` issu de la date
`modified:` déclarée dans chaque fragment — et non de la date du fichier, qui
sur Vercel vaut l'horodatage du clone et redaterait le site entier à chaque
déploiement. Chaque URL porte ses `<xhtml:link rel="alternate">`.

**5.3 · Robots et doublons.** `robots.txt` généré (il était déjà sain).
Les doublons repérés par l'audit sont supprimés par des redirections 301 dans
`vercel.json` : `/landing.html` → `/`, `/guides` → `/guides/`, `/a-propos`,
`/contact`, `/en`, `/en/guides`.

**5.4 · Performance.** C'est le poste où le gain est le plus net.

- **Les polices sont rapatriées en local** (`scripts/fetch_site_fonts.mjs`,
  8 fichiers woff2, sous-ensembles latin et latin-ext, SIL OFL). La feuille
  `fonts.googleapis.com` bloquait le rendu ~780 ms sur chaque page, et
  l'élément LCP de l'accueil est le `<h1>` : ce tiers en chemin critique
  *était* le LCP à 6 secondes. Preload sur les deux seules polices utilisées
  au-dessus de la ligne de flottaison, cache immuable d'un an.
- **`icon-512.png` (161 Ko) était affiché en 30 px** dans l'entête de *toutes*
  les pages. Remplacé par `logo-mark.png`, 8 Ko.
- **Les captures d'écran** passent en WebP à la bonne taille, avec repli PNG
  via `<picture>` : `04-globe.png` va de 302 Ko à 17 Ko.
- **PostHog ne charge plus `surveys.js`** (33 Ko de JS inutilisé, aucun sondage
  n'est utilisé) — `disable_surveys: true`.
- Accessibilité : `alt` du logo rendu décoratif (il duplique le mot « GeoG »
  juste à côté) et `aria-label` redondants retirés des badges de stores.
- Vérifié : aucune page ne déborde horizontalement, en 1280 comme en 390 px.

⚠️ Les mesures « après » sont prises sur le build local. Elles n'incluent donc
pas la latence réseau ni le script PostHog (~48 Ko en production). L'ordre de
grandeur du gain est réel, le chiffre exact sera à reprendre après déploiement.

**5.5 · Search Console.** Hors code — reste à faire par Paul (voir plus bas).

### Phase 1 — internationalisation (anglais)

Structure d'URL conforme au plan : **le français reste à la racine**, l'anglais
sous `/en/`, aucune URL française n'a changé. Slugs traduits
(`/guides/drapeaux-du-monde/` ↔ `/en/guides/world-flags/`,
`/jeu-drapeaux/` ↔ `/en/flag-game/`), résolus par la table de routes.

**48 pages anglaises, soit la parité complète avec le français** : accueil,
sommaire des guides, 6 guides piliers, 12 pages de mode, 18 fiches continent,
6 guides thématiques, à-propos, contact, confidentialité, `/play`.

`/play` et `/en/play` servent le même bundle avec deux `<head>` distincts, pour
que chacune soit canonique d'elle-même.

**Pas de redirection automatique** sur `Accept-Language` ni sur l'IP : Googlebot
explore depuis les États-Unis, une redirection l'enfermerait dans la version
anglaise. Un sélecteur de langue en vrais `<a href>` a été ajouté dans la barre
de navigation et le pied de page — et il ne s'affiche pas quand la page n'existe
pas dans l'autre langue, plutôt que de proposer un lien vers une 404.

**ES / PT / DE / IT ne sont pas faits, et c'est délibéré.** L'audit a établi que
l'app ne parle que français et anglais (`Language = 'fr' | 'en'`). Traduire le
site enverrait un lecteur hispanophone sur une interface qu'il ne lit pas. Le
plan lui-même les programme après mesure des résultats anglais.

### Phase 4 — données structurées

| Type | Où |
|---|---|
| `VideoGame` + `SoftwareApplication` | accueil FR et EN |
| `FAQPage` | 41 pages — **extrait du HTML affiché** |
| `Article` | les 42 guides et fiches, avec `datePublished` et `dateModified` réels |
| `BreadcrumbList` | toutes les pages de contenu |
| `ItemList` | chaque page exposant un tableau de référence |
| `Organization` | éditeur, avec `url` et `logo` |

Deux choix méritent d'être signalés. Le `FAQPage` est **dérivé du balisage de la
page** plutôt que saisi à part : l'ancienne page d'accueil déclarait trois
questions quand elle en affichait cinq, et ce genre d'écart ne peut plus se
produire. Et **aucun `aggregateRating`** n'a été ajouté : les notes des stores
ne sont pas récupérées automatiquement, donc il n'y a rien de vérifiable à
déclarer.

### Phase 2 — 12 pages de mode

Une page par mode, en français **et en anglais** (24 pages), chacune avec son
gabarit complet : `<h1>` sur la requête cible, CTA, capture quand elle existe,
« comment ça marche » tiré des règles réelles du jeu (`src/data/modeIntros.ts`),
**un tableau de référence propre à la page**, une FAQ et le maillage interne.

Les tableaux sont tous différents, pour qu'aucune page n'en duplique une autre :
les 195 drapeaux en images, les 195 capitales avec continent, les pays par
nombre de voisins, par superficie, par population, les 24 sous-régions, les
41 critères de Rankle, les 6 rangs du mode classé (lus dans `src/lib/ranked.ts`).

**Les deep links `?mode=` ont été implémentés** ([src/lib/webEntry.ts](src/lib/webEntry.ts))
plutôt que reportés : sans eux, les 24 boutons « Jouer » de ces pages retombaient
tous sur le défi du jour. La liste des modes bootables est une **whitelist**, pas
un cast — `?mode=` est du texte contrôlé par le visiteur, et les modes en ligne
ont besoin d'un match autour d'eux. 9 tests couvrent le cas.

### Phase 3 — 24 pages de longue traîne, en FR et EN

**18 fiches continent** : {drapeaux, capitales, pays} × 6 continents. Tableaux
générés depuis les données du jeu, mais **texte d'introduction original et
distinct sur chacune** (200 à 400 mots) — le plan prévenait qu'une page
purement générée serait traitée comme du contenu de faible valeur.

**6 guides thématiques** : drapeaux qui se ressemblent, pays difficiles à
placer, micro-États, pays enclavés, pays qui ont changé de nom, territoires
contestés.

Les 24 pages existent dans les deux langues, avec des slugs traduits
(`/guides/pays-d-asie/` ↔ `/en/guides/countries-of-asia/`).

Le sommaire des guides et la page d'accueil ont été retissés pour mener vers
elles, et chaque fiche renvoie vers ses sœurs, son guide pilier et son mode.

**Le découpage en 6 continents** que le plan demandait n'existe pas dans les
données du jeu (les Amériques y sont un bloc de 35 pays, et ce périmètre pilote
le choix de zone en solo — y toucher changerait des tirages). Il est donc
reconstruit **côté site uniquement**, à partir du champ `subregion` :
Amérique du Nord au sens large, Amérique centrale et Caraïbes incluses (23 pays),
comme dans l'enseignement francophone. Les pages concernées l'annoncent au
lecteur plutôt que de laisser planer le doute. Un garde-fou vérifie au build que
les six continents couvrent exactement les 195 pays, sans trou ni doublon.

### Phase 6 — hors code

Non implémentée, comme demandé. Un point vérifié au passage : **la grille de
partage du défi du jour contient bien l'URL du site** (`src/lib/share.ts` ajoute
`playgeog.com` ou le lien de parrainage complet). C'est le mécanisme viral de
Wordle, il est en place.

---

## Ce qui reste à faire

### Pour Paul, hors dépôt

1. **Déployer le web.** Rien n'est en ligne. `npm run build:web && npm run build:site`,
   puis le déploiement Vercel habituel.
2. **Search Console** : vérifier la propriété **par domaine entier** (pas par
   préfixe d'URL — la phase 1 ajoute des préfixes de chemin), soumettre
   `sitemap.xml`, activer Bing Webmaster Tools par import depuis GSC.
3. **Valider les `hreflang` avec un outil dédié après déploiement.** Le build
   vérifie la cohérence interne ; seul un crawl externe confirme le rendu réel.
4. **Relancer Lighthouse sur la prod** pour confirmer les gains hors conditions
   locales.
5. **Contraste des couleurs.** Deux règles échouent encore en accessibilité :
   `--brown-light` (#a08060) sur parchemin donne 2,99:1, et la ligne de pied de
   page à `opacity:.7` tombe à 2,06:1. C'est un jeton de la palette : le plan
   interdit de toucher au design, donc rien n'a été modifié. À arbitrer.

### Deux points de données du jeu

Trouvés en écrivant les guides, **non corrigés** : ils touchent les réponses
acceptées par le jeu, ce qui sort du périmètre SEO.

- Le libellé **français** de deux pays suit l'usage ancien : « Swaziland »
  (officiellement Eswatini depuis 2018) et « Îles du Cap-Vert » (Cabo Verde).
  Les libellés anglais, eux, sont à jour. Le guide sur les changements de nom le
  mentionne explicitement plutôt que de faire comme si de rien n'était.
- La **superficie du Vatican** dans `countries_stats.json` (0,49 km²) diverge du
  chiffre le plus couramment cité (0,44 km²). Les textes ont été reformulés en
  « moins d'un demi-kilomètre carré », vrai dans les deux cas, pour ne pas
  contredire le tableau affiché sur la même page.

### Les captures d'écran

**10 des 12 pages de mode ont désormais leur capture, dans les deux langues** —
soit 20 images, prises avec l'application réglée sur la langue de la page : une
capture en français sur une page anglaise se voit tout de suite.

Elles sont produites par [scripts/site_shots.mjs](scripts/site_shots.mjs), qui
s'appuie sur les deep links `?mode=` ajoutés pour l'occasion : plus besoin de
naviguer dans les menus, on entre directement dans le mode voulu. Le menu
principal n'étant pas adressable par URL sur le web, on y remonte depuis un mode
solo par son bouton « accueil ».

Restent sans image : **Classé** et **Histoire**, qui demandent un compte et une
progression que le harnais n'a pas. Leurs pages ne l'attendent pas — leur
tableau de référence porte le contenu.

---

## Vérifications passées

```
npm run site:check   96 pages · hreflang, canonicals, titres, liens internes,
                     ressources statiques — OK
npm run typecheck    OK
npm run lint         0 erreur (47 avant), 74 avertissements préexistants
npm test             852 tests, 67 suites — tous verts
build complet        96 pages générées, sitemap 96 URL
rendu navigateur     16 paires FR/EN contrôlées : statut, lang, canonical,
                     hreflang, JSON-LD, débordement horizontal — toutes OK
captures             chaque page sert bien la variante de sa langue, en WebP
```
