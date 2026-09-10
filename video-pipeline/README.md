# video-pipeline — filmer l'app comme on y joue

Produit les vidéos que `store-screenshots/` ne peut pas produire : les **app
previews** de l'App Store et du Play Store, et les rushes des formats courts.

L'app est jouée pour de vrai, sur un téléphone émulé, par une main artificielle
qui hésite avant d'appuyer, lit ce qui s'affiche et tape lentement. Rien n'est
simulé ni remonté image par image : ce qu'on voit est l'app, à sa vitesse.

```sh
cd video-pipeline
npm install

cp .env.record.example ../.env.local   # backend factice : voir « Le backend » plus bas
npm run build:app                      # exporte le web dans .dist/
npm run record                         # la visite → out/iphone69/tour.mp4 + tour.json
npm run cut                            # découpe chaque scène + décline le 1080×1920
```

`.env.local` est le fichier de la racine du dépôt : pensez à remettre le vôtre
après la prise.

## Ce que ça produit

```
out/iphone69/
  tour.mp4                 la prise entière, 1290×2796, H.264, 30 i/s
  tour.json                le manifeste : bornes de chaque scène, à l'image près
  tour-1080x1920.mp4       la déclinaison Play Store / Reels / Shorts
  clips/<scène>.mp4        un fichier par scène, prêt à monter
```

`tour.json` est la pièce maîtresse : il note à quelle seconde commence et finit
chaque scène, et **ce qui a été joué** — quelle réponse, juste ou fausse. Le
montage y coupe ses plans sans revisionner la prise.

## Réglages

Tout passe par l'environnement (voir `config.mjs`) :

| Variable | Défaut | Ce que ça change |
| --- | --- | --- |
| `DEVICE` | `iphone69` | `iphone69` (1290×2796), `iphone65` (1284×2778), `social` (1080×1920) |
| `SCENES` | toutes | `SCENES=globe,silhouette` pour ne refilmer qu'un écran |
| `SEED` | `20260910` | rejoue une **autre** partie, à l'identique d'une fois sur l'autre |
| `TEMPO` | `1` | étire (`1.2`) ou serre (`0.85`) toutes les pauses d'un coup |
| `LOCALE` | `fr-FR` | la langue de la prise — `en-US`, `es-ES`… |
| `FPS`, `CRF` | `30`, `18` | cadence et qualité d'encodage |
| `HEADED` | — | `HEADED=1` pour voir le navigateur travailler (en local) |

## Comment c'est fait

**L'image.** `Page.startScreencast` (CDP) pousse des JPEG quand le rendu change,
donc à cadence variable. Une pompe republie la dernière image reçue pour tenir
30 i/s exactement, calée sur l'horloge murale — une machine lente rend une vidéo
au bon rythme, pas un ralenti. Le flux part dans ffmpeg (`ffmpeg-static`, qui
embarque x264 ; celui de Playwright ne fait que du VP8).

**Le doigt.** Les appuis passent par `Input.dispatchTouchEvent`, pas par la
souris : l'app tourne en émulation tactile, et react-native-web ne réagit pas
aux mêmes événements. Un calque dessine le point de contact et l'onde qui en
part — sans lui, une capture mobile est illisible, l'écran change sans qu'on
voie pourquoi.

**Le rythme.** Chaque appui porte une hésitation avant (l'œil cherche la cible)
et une lecture après (le joueur découvre l'écran). Le point d'impact est
décentré d'un tirage gaussien proportionnel à la taille du bouton. La frappe est
irrégulière, avec des respirations aux espaces. Tout ce hasard sort d'un
générateur à graine fixe : deux prises avec le même `SEED` sont identiques à
l'image près.

**Les cibles.** Le scénario vise les `accessibilityLabel` de l'app, pas le texte
affiché. Ce sont les chaînes que lit un lecteur d'écran : déjà traduites, et
stables quand la maquette bouge.

**Le défilement.** Par la roulette, pas par le doigt — un glissement tactile
émulé ne parcourt qu'un dixième de la course demandée. Attention : la roulette
n'agit que **sous le curseur**, qui est en (0,0) sur une page fraîche ; sans
`mouse.move` préalable, `scroll()` ne fait rien du tout et une prise entière
peut se terminer sans qu'aucune page n'ait bougé, sans la moindre erreur. Le
doigt dessiné suit le mouvement pour que le geste montré soit celui que le
joueur ferait.

**Les entrées ne sont pas attendues.** `Input.dispatchTouchEvent` et
`mouse.wheel` ne rendent la main qu'une fois l'événement traité par le moteur
de rendu. Sur les écrans 3D — Globe Géo, Mode Histoire, le globe décoratif de
l'accueil — ce traitement coûte des secondes quand WebGL tourne en logiciel :
un glissement de dix-huit pas mettait trois minutes, et « Mode Histoire », qui
ne fait pourtant que défiler, aussi. Les messages CDP partent dans l'ordre sur
la même socket, donc on les envoie sans attendre leur accusé de réception et on
ne l'attend qu'à la fin du geste. La trajectoire reste exacte ; le rythme vient
des pauses entre les envois. Sur une machine avec un vrai GPU, ces écrans sont
de toute façon rapides — la lenteur est un artefact des machines sans carte
graphique, pas du pipeline.

**Un appui n'est pas un glissement dégénéré.** Sur le globe, un « glissement »
d'un seul pas au même point suivait de trop près la rotation précédente : l'app
y lisait un double-tap et zoomait à fond, ruinant la moitié de la scène sans la
moindre erreur dans le journal. D'où `tapAt(x, y)`, et son attente d'une
seconde et demie avant le contact.

## Les réponses justes

Le pipeline ne connaît pas la bonne réponse : il choisit, puis relève le verdict
dans le bandeau de résultat (`Bonne réponse` / `Mauvaise réponse`, les libellés
d'accessibilité de `SilhouetteGame`, `ChallengeQuiz` et `LanguagesGame`).

C'est pourquoi chaque mode de quiz joue **trois** questions : le manifeste dit
lesquelles sont bonnes, et le montage coupe sur une bonne. Si une prise est
vraiment malchanceuse, `SEED=7 npm run record` rejoue une autre partie — et la
rejouera à l'identique le jour où il faudra la refaire.

## Ce que la visite couvre

Vingt scènes, mobile uniquement : accueil, défi du jour, Globe Géo (avec la
rotation du globe 3D), Silhouette, Capitales, Drapeaux, Langues, Rankle, Streak,
Plus ou Moins, Devinez le Pays (la scène de frappe), Frontières, Défis Pays,
Mode Histoire, l'onglet Local, l'onglet En Ligne, la zone de jeu, le sélecteur
de langue, l'écran de compte, et la bascule vers le thème sombre.

Une scène qui échoue ne fait pas tomber la prise : elle est signalée dans le
manifeste et la visite continue.

## Le backend

Une prise tourne contre un backend **factice** : `.env.record.example` fait
pointer `EXPO_PUBLIC_SUPABASE_URL` sur un port local où rien n'écoute. L'app
démarre, tous les modes solo fonctionnent — leur logique est locale — et aucune
requête ne part vers la production. Une vidéo de fiche store ne peut donc pas
exposer un pseudo, un score ou un classement réel, et la prise n'envoie jamais
d'identifiants.

## Les écrans connectés

Avec un compte, la visite continue : connexion (la scène de frappe), profil,
boutique, amis, classement mondial, ligues, **un vrai duel classé**, puis
déconnexion. Les identifiants viennent de l'environnement et n'en sortent
jamais — ni manifeste, ni journal, ni fichier du dépôt :

```sh
cp ../.env.local.mien ../.env.local     # le VRAI backend cette fois : les comptes y vivent
npm run build:app
RECORD_EMAIL=test1@test.com RECORD_PASSWORD=… \
SPARRING_EMAIL=test2@test.com SPARRING_PASSWORD=… SPARRING_NAME=test2 \
npm run record
```

`SPARRING_*` ouvre un **second téléphone hors champ** (`lib/sparring.mjs`), qui
se connecte avec l'autre compte, entre dans la file classée juste avant le
héros et répond aux questions sans pause : c'est lui qui rend le match
possible. Sans lui, la scène `classe` cherche un adversaire pendant 90 s puis
annule proprement.

Deux réserves. Les comptes doivent être **des comptes de test** — tout ce que
la prise joue (pièces, ELO, scores du jour) est réellement écrit dans la base.
Et ces scènes ont été écrites d'après les libellés d'accessibilité du code
source, pas d'après une prise : la machine qui a filmé la visite solo ne
pouvait pas joindre Supabase. Chaque cible passe par des variantes et une scène
qui ne trouve pas son écran se retire ; la première prise connectée dira ce
qui reste à ajuster, et `explore.mjs` sert à relever vite le bon libellé.

## Le montage — `compose/`

La prise et le montage sont séparés : refaire un titre ne doit pas obliger à
rejouer une partie. Le montage est un projet
[HyperFrames](https://github.com/heygen-com/hyperframes) (HTML → MP4
déterministe, Apache 2.0) dans `compose/` : la vidéo est une page HTML, chaque
plan un `<video>` daté (`data-start`, `data-duration`, `data-media-start` pour
le point d'entrée dans le rush), les titres des éléments animés par GSAP.

```sh
npm run cut                    # d'abord les plans, depuis la prise
npm run compose:sync           # copie clips/ + tour.json dans compose/assets/
cd compose && npm run check    # lint + validation en Chrome headless
npm run render                 # → compose/renders/app-preview.mp4
```

Ce que le montage exige de la machine : un Chrome headless que HyperFrames
télécharge lui-même (`npx hyperframes browser ensure`), et ffmpeg/ffprobe —
fournis par `ffmpeg-static`/`ffprobe-static` et passés par
`HYPERFRAMES_FFMPEG_PATH`/`HYPERFRAMES_FFPROBE_PATH` (voir `compose:render`).
GSAP et les polices sont **vendus localement** (`compose/vendor/`,
`compose/assets/fonts/`) : le Chrome du rendu n'a pas accès au réseau, et un
CDN qui répond différemment un jour casserait le déterminisme de toute façon.
