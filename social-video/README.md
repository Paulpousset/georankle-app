# Vidéos réseaux sociaux — tournage automatique de l'app native

> Objectif : sortir chaque semaine des shorts TikTok / Reels / Shorts filmés sur
> **la vraie app mobile**, sans tenir le téléphone, pour faire venir des joueurs
> sur iOS et Android.

## Pourquoi ce dossier

L'ancien pipeline (`~/rankle/videos-pub/video-pipeline`, hors dépôt) filme le
**build web** dans Playwright avec un viewport de téléphone. Ça se voit : pas de
barre d'état, polices et animations du navigateur, globe en WebGL du web. Pour
une campagne qui vend l'app mobile, il faut des images de l'app mobile.

Ce dossier filme l'app native dans un simulateur iOS ou un émulateur Android,
pilotée par [Maestro](https://maestro.dev), puis la monte en vidéo verticale
avec [Remotion](https://www.remotion.dev).

```
build EAS « recording »  →  flows Maestro  →  out/raw/*.mp4
                                                   │
                     hooks.json  →  plan.mjs  →  out/episodes/*.json
                                                   │
                       ElevenLabs  →  voice.mjs  →  composer/public/voice/*.mp3
                                                   │
                                  render.mjs  →  out/final/*.mp4 + *.txt
```

## Les pièces

| Pièce | Rôle |
|---|---|
| `src/lib/recordingMode.ts` (app) | Mode tournage, actif seulement dans le build `recording` : pas de tutoriel, pas de popup de règles, pas de pub, pas de demande de note. Les réponses portent un testID `rec-correct` / `rec-wrong`. |
| `eas.json` → profil `recording` | Build simulateur iOS + APK Android, canal EAS `recording` (jamais touché par les mises à jour OTA de production), sans clés PostHog ni Sentry : les parties filmées ne faussent pas les chiffres. |
| `maestro/*.yaml` | Un flow = une vidéo. Il lance l'app, choisit la langue, entre dans le mode, **démarre l'enregistrement sur la première question**, joue une partie écrite d'avance (N bonnes réponses, puis une erreur pour la chute), garde l'écran de fin à l'image. Pause « réflexion » entre deux taps pour que ça ne fasse pas robot. |
| `record.sh` | Barre d'état propre (9:41, batterie pleine), puis chaque flow dans chaque langue. |
| `hooks.json` | Accroches, sous-titres, appel à l'action et texte de publication, par flow et par langue. |
| `composer/` | Projet Remotion. `plan.mjs` fait une fiche de montage par vidéo et par accroche, `voice.mjs` y ajoute la voix off ElevenLabs, `render.mjs` sort un MP4 1080×1920 H.264 et le texte à coller sous la vidéo. `sounds.mjs` (lancé par `render.mjs`) synthétise la musique et les bruitages, sans droits ni réseau. |
| `.github/workflows/social-video.yml` | Tout le circuit Android dans GitHub Actions, chaque lundi ou à la main ; les shorts arrivent dans une release « Shorts #N » (et en artefact du run). |

## Flows disponibles

| Flow | Ce qu'on voit | Variables utiles |
|---|---|---|
| `higher-lower` | « Plus ou Moins » : série de bonnes réponses puis la chute | `STREAK` (8), `FAIL` (1), `THINK_MS` (1300) |
| `flags` | 6 drapeaux en CARRÉ, sans faute | `ROUNDS` (6), `FAIL` (0) |
| `capitals` | 6 capitales en CARRÉ, sans faute | `ROUNDS` (6), `FAIL` (0) |

⚠️ Ces flows ont été écrits à partir du code des écrans ; ils n'ont pas encore
tourné sur un appareil. Le premier passage sur le Mac servira à ajuster les
sélecteurs (voir « Avec Claude Code » plus bas, c'est fait pour ça).

## Sur le Mac (iOS, la meilleure image)

Une fois :

```bash
curl -fsSL https://get.maestro.mobile.dev | bash   # Maestro
eas build --platform ios --profile recording        # build simulateur (~15 min sur EAS)
```

Télécharger le `.tar.gz` depuis expo.dev, l'extraire, puis :

```bash
xcrun simctl boot "iPhone 16 Pro"
open -a Simulator
xcrun simctl install booted GeoG.app
```

Ensuite, à chaque fournée :

```bash
./social-video/record.sh ios                       # tous les flows, fr + en
LANGS="fr en es" ./social-video/record.sh ios flags
cd social-video/composer && npm ci
node plan.mjs --variants 2                         # 2 accroches par vidéo
XI_API_KEY=… node voice.mjs                        # voix off (facultatif)
node render.mjs                                    # → social-video/out/final/
npm run studio                                     # retoucher un montage à l'œil
```

Sans passer par EAS : `EXPO_PUBLIC_RECORDING_MODE=1 npx expo run:ios --configuration Release`.

## Dans GitHub Actions (Android, sans le Mac)

Actions → « Vidéos réseaux sociaux » → Run workflow. Le build `recording`
existant est réutilisé ; cocher « rebuild » après un changement d'écran.
L'émulateur tourne en rendu logiciel : l'image est bonne pour les modes 2D
(Plus ou Moins, Drapeaux, Capitales), moins pour le globe 3D, qu'il vaut mieux
filmer sur le Mac.

## Voix off (ElevenLabs)

`voice.mjs` lit l'accroche au début, chaque sous-titre (champ `say` de
`hooks.json`, sinon son texte) et une phrase de fin sur la carte de fin. Les
répliques sont calées pour ne jamais se chevaucher, la carte de fin s'allonge
pour laisser finir la dernière. Sans `XI_API_KEY`, l'étape est sautée et la
vidéo sort muette, sans erreur.

ElevenLabs reste le meilleur choix pour une voix qui passe pour humaine, en
français comme dans les autres langues, et la clé sert déjà au mode Langues
(`scripts/gen_language_audio.mjs`). Ce qui fait la différence n'est pas l'outil
mais la voix :

1. **Le mieux : cloner ta propre voix** (ElevenLabs → Voices → Add voice →
   Professional Voice Clone, environ 30 min d'enregistrement propre ; ou Instant
   Voice Clone avec 1 à 2 min, un peu moins fidèle). La chaîne a alors une
   voix, la tienne, dans toutes les langues.
2. Sinon, choisir dans la Voice Library une voix native par langue (filtres
   « Conversational » ou « Social media ») et noter son Voice ID.

Réglages : `XI_VOICE` (une voix pour tout), `XI_VOICE_FR`, `XI_VOICE_EN`… (une
par langue), `XI_MODEL` (`eleven_multilingual_v2` par défaut, `eleven_v3` plus
expressif). Chaque réplique est mise en cache par son texte : relancer ne
consomme pas de crédits.

## Avec Claude Code : piloter l'app par MCP

Maestro embarque un serveur MCP. Sur le Mac, une fois :

```bash
claude mcp add maestro -- maestro mcp
```

Claude Code voit alors le simulateur : il lit la hiérarchie de l'écran, tape,
fait des captures et lance des flows. C'est la façon la plus rapide de :

- **corriger un flow** qui casse après un changement d'écran (« lance
  higher-lower.yaml, regarde où il bloque, corrige le sélecteur ») ;
- **écrire un nouveau flow** en jouant le mode une fois avec lui, puis en
  figeant les étapes en YAML ;
- **tourner une idée de vidéo** sur demande (« filme une partie de Silhouette où
  je trouve en 2 essais »).

Autres serveurs MCP utiles pour le mobile, si Maestro ne suffit pas :
[mobile-mcp](https://github.com/mobile-next/mobile-mcp) (iOS et Android, vrais
appareils compris) et [XcodeBuildMCP](https://github.com/cameroncooke/XcodeBuildMCP)
(builds Xcode et simulateurs).

## Ajouter un mode

1. Dans l'écran du mode, mettre `testID={recAnswerId(estLaBonneRéponse)}` sur
   chaque réponse (`src/lib/recordingMode.ts`). Hors build `recording`, la
   valeur est `undefined` : rien ne change pour les joueurs.
2. Copier `maestro/higher-lower.yaml`, changer `MODE_TITLE` et la boucle.
3. Ajouter ses accroches dans `hooks.json` (au moins `fr` et `en`).

## À faire à la main, une fois

Dans l'ordre. Après ça, une fournée de shorts sort chaque lundi à 5 h UTC dans une release
« Shorts #N » du dépôt (onglet Releases), sans rien toucher.

1. **Clé ElevenLabs** : GitHub → Settings → Secrets and variables → Actions →
   New repository secret, nom `XI_API_KEY`. Ne jamais la coller dans un chat ou
   un fichier du dépôt.
2. **Voix** : cloner ta voix ou en choisir une (voir « Voix off »), puis, au
   même endroit, onglet Variables : `XI_VOICE` = son Voice ID (ou `XI_VOICE_FR`
   et `XI_VOICE_EN`).
3. **Fusionner la PR** : GitHub ne propose « Run workflow » et ne lance le
   cron qu'une fois le workflow sur `master`.
4. **Premier tournage** : Actions → « Vidéos réseaux sociaux » → Run workflow,
   « rebuild » coché (premier build `recording` sur EAS). S'il échoue sur un
   sélecteur Maestro, me le dire : les captures d'écran du run suffisent pour
   corriger le flow.
5. **Optionnel, sur le Mac** : `claude mcp add maestro -- maestro mcp` pour
   que Claude Code pilote le simulateur iOS (meilleure image, globe 3D).

## Effets du montage

Rythme pensé pour TikTok / Reels, tout dans `composer/src/Short.tsx` :

- **Accroche mot par mot** qui saute en place, dernier mot surligné, flash blanc à la première image.
- **Téléphone** qui entre en tournant, zoom lent sur toute la partie, petit coup de zoom, halo et « pop » à chaque nouvelle question. Les questions sont repérées automatiquement dans la vidéo brute par `plan.mjs` (changements d'écran, `beats` dans la fiche), avec un badge « Q3 » qui suit.
- **Sous-titres** au milieu de l'écran avec gerbe d'émojis et flash. Un sous-titre « raté » (😬, « Ah. », « Oh no »…) passe en rouge, avec secousse et boum.
- **Barre de progression** en haut, fond de nuit avec taches de lumière qui dérivent.
- **Sortie** : riser, zoom flou, flash. Puis la carte de fin, avec des rayons qui tournent, l'icône qui rebondit, un bouton qui pulse et des confettis.
- **Son** : boucle 112 BPM et bruitages (whoosh, pop, boum, riser, ding) synthétisés par `sounds.mjs`. La musique baisse sous la voix off quand il y en a une.

## Ce qui reste manuel

- **Brancher la publication automatique** (une fois) : voir « Publier tout
  seul » ci-dessous.
- **Juger.** Comparer les vues des deux accroches d'une même vidéo, garder les
  gagnantes dans `hooks.json`, retirer les autres.

## Publier tout seul

Le workflow « Publication réseaux sociaux » (`.github/workflows/social-post.yml`)
prend chaque jour à 17 h UTC le prochain short des releases `shorts-N` et le
poste sur TikTok, Instagram (Reels) et YouTube (Shorts). L'API TikTok officielle
limite les apps non auditées aux vidéos privées (YouTube aussi pour les projets
non vérifiés) : on passe donc par des services déjà audités.

| Formule | Services | Coût |
|---|---|---|
| **Gratuite** (défaut) | [Zernio](https://zernio.com) pour TikTok + Instagram (2 comptes offerts, publications illimitées) et [Upload-Post](https://upload-post.com) gratuit pour YouTube (10 envois par mois) | 0 € |
| Tout Zernio | TikTok + Instagram + YouTube sur Zernio, le 3e compte est payant | 6 $/mois |
| Tout Upload-Post | Plan Basic, les trois plateformes | 16 $/mois en annuel |

Le script publie sur **tous les comptes connectés à Zernio**, et sur les
plateformes de `UPLOAD_POST_PLATFORMS` côté Upload-Post (`youtube` par défaut
quand Zernio est branché, les trois sinon). Si un service échoue (quota gratuit
atteint), la vidéo part quand même sur l'autre, le run finit en rouge pour le
signaler et la vidéo n'est pas republiée le lendemain.

- **Une vidéo ne part jamais deux fois** : la liste de ce qui est publié vit
  dans `posted.json`, release `shorts-state`.
- **Une seule accroche par partie** : v1 et v2 montrent la même partie, une
  seule est postée, en alternant d'une fournée à l'autre pour comparer.
- **Simulation par défaut** : tant que `SOCIAL_POST_ENABLED` ne vaut pas
  `true`, le run affiche ce qu'il publierait et ne poste rien.

Mise en route (formule gratuite) :

1. Compte Zernio : connecter TikTok et Instagram (compte professionnel ou
   créateur), créer une clé API.
2. Compte Upload-Post gratuit : créer un profil (ex. `georankle`), y connecter
   YouTube, créer une clé API.
3. GitHub → Settings → Secrets and variables → Actions : secrets
   `ZERNIO_API_KEY` et `UPLOAD_POST_API_KEY`, variable `UPLOAD_POST_USER`
   (nom du profil Upload-Post).
4. Actions → « Publication réseaux sociaux » → Run workflow, simulation
   cochée : vérifier dans le log la vidéo, le texte et les comptes visés.
5. Variable `SOCIAL_POST_ENABLED` = `true` : les publications partent chaque
   jour.

Réglages (variables de dépôt) : `SOCIAL_POST_LANGS` (`fr` par défaut, `fr en`
pour les deux), `UPLOAD_POST_PLATFORMS`, `SOCIAL_POST_MIN_RELEASE` (19 par
défaut : premier tournage avec le montage à effets et la voix Anatole).

En local : `GITHUB_REPOSITORY=Paulpousset/georankle-app node social-video/publish/post.mjs`
affiche la file d'attente sans rien publier.
